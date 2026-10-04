import type { PoolClient } from 'pg';

import { pool, db } from '../../lib/db.js';
import type { ChatConversation, ChatMessage } from './chat.types.js';

type ChatUser = { id: string; username: string };

const requirePool = () => {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Database access is unavailable.');
  }
  return pool;
};

const messageColumns = `
  m.id,
  m.conversation_id AS "conversationId",
  m.sender_id AS "senderId",
  u.username AS "senderUsername",
  CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,
  m.reply_to_id AS "replyToId",
  CASE WHEN replied.deleted_at IS NULL THEN replied.body ELSE NULL END AS "replyToBody",
  m.edited_at AS "editedAt",
  m.deleted_at AS "deletedAt",
  m.created_at AS "createdAt",
  EXISTS (
    SELECT 1
    FROM chat_conversation_members read_member
    WHERE read_member.conversation_id = m.conversation_id
      AND read_member.user_id != m.sender_id
      AND read_member.last_read_at >= m.created_at
  ) AS "isRead"
`;

export const listChatUsers = async (
  userId: string,
  query: string,
): Promise<ChatUser[]> => {
  const result = await db.query<ChatUser>(
    `SELECT id, username
     FROM users
     WHERE id != $1 AND is_active = TRUE
       AND username ILIKE $2
     ORDER BY username
     LIMIT 30`,
    [userId, `%${query}%`],
  );
  return result.rows;
};

export const listConversationIds = async (userId: string): Promise<string[]> => {
  const result = await db.query<{ conversationId: string }>(
    `SELECT conversation_id AS "conversationId"
     FROM chat_conversation_members
     WHERE user_id = $1`,
    [userId],
  );
  return result.rows.map((row) => row.conversationId);
};

export const listConversationPeerIds = async (userId: string): Promise<string[]> => {
  const result = await db.query<{ userId: string }>(
    `SELECT DISTINCT peer.user_id AS "userId"
     FROM chat_conversation_members mine
     JOIN chat_conversation_members peer
       ON peer.conversation_id = mine.conversation_id
      AND peer.user_id != mine.user_id
     JOIN users u ON u.id = peer.user_id AND u.is_active = TRUE
     WHERE mine.user_id = $1`,
    [userId],
  );
  return result.rows.map((row) => row.userId);
};

export const listConversations = async (userId: string): Promise<ChatConversation[]> => {
  const result = await db.query<ChatConversation>(
    `SELECT c.id, c.type, c.name,
            c.created_at AS "createdAt", c.updated_at AS "updatedAt",
            peer.id AS "otherUserId", peer.username AS "otherUsername",
            latest.body AS "lastMessage", latest."createdAt" AS "lastMessageAt",
            (SELECT COUNT(*)::int
             FROM chat_messages unread
             WHERE unread.conversation_id = c.id
               AND unread.sender_id != $1
               AND unread.deleted_at IS NULL
               AND unread.created_at > mine.last_read_at) AS "unreadCount",
            COALESCE(
              (SELECT json_agg(json_build_object('id', member_user.id, 'username', member_user.username)
                               ORDER BY member_user.username)
               FROM chat_conversation_members members
               JOIN users member_user ON member_user.id = members.user_id
               WHERE members.conversation_id = c.id),
              '[]'::json
            ) AS members
     FROM chat_conversations c
     JOIN chat_conversation_members mine
       ON mine.conversation_id = c.id AND mine.user_id = $1
     LEFT JOIN LATERAL (
       SELECT other.id, other.username
       FROM chat_conversation_members other_member
       JOIN users other ON other.id = other_member.user_id AND other.is_active = TRUE
       WHERE other_member.conversation_id = c.id AND other_member.user_id != $1
       ORDER BY other_member.joined_at
       LIMIT 1
     ) peer ON TRUE
     LEFT JOIN LATERAL (
       SELECT CASE WHEN m.deleted_at IS NULL THEN m.body ELSE 'Message deleted' END AS body,
              m.created_at AS "createdAt"
       FROM chat_messages m
       WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
     ) latest ON TRUE
     ORDER BY latest."createdAt" DESC NULLS LAST, c.updated_at DESC`,
    [userId],
  );
  return result.rows;
};

export const createDirectConversation = async (
  userId: string,
  otherUserId: string,
): Promise<{ id: string } | null> => {
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const other = await client.query(
      'SELECT 1 FROM users WHERE id = $1 AND is_active = TRUE',
      [otherUserId],
    );
    if (!other.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    const directKey = [userId, otherUserId].sort().join(':');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO chat_conversations (type, direct_key, created_by)
       VALUES ('DIRECT', $1, $2)
       ON CONFLICT (direct_key) WHERE type = 'DIRECT' DO NOTHING
       RETURNING id`,
      [directKey, userId],
    );
    const conversation = inserted.rows[0] ?? (await client.query<{ id: string }>(
      'SELECT id FROM chat_conversations WHERE direct_key = $1',
      [directKey],
    )).rows[0];
    if (!conversation) {
      throw new Error('Database did not return the direct conversation.');
    }
    await client.query(
      `INSERT INTO chat_conversation_members (conversation_id, user_id)
       VALUES ($1, $2), ($1, $3)
       ON CONFLICT DO NOTHING`,
      [conversation.id, userId, otherUserId],
    );
    await client.query('COMMIT');
    return conversation;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createGroupConversation = async (
  userId: string,
  name: string,
  memberIds: string[],
): Promise<{ id: string } | null> => {
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const distinctIds = [...new Set([userId, ...memberIds])];
    const users = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE is_active = TRUE AND id = ANY($1::uuid[])',
      [distinctIds],
    );
    if (users.rowCount !== distinctIds.length) {
      await client.query('ROLLBACK');
      return null;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO chat_conversations (type, name, created_by)
       VALUES ('GROUP', $1, $2)
       RETURNING id`,
      [name, userId],
    );
    const conversation = inserted.rows[0];
    if (!conversation) {
      throw new Error('Database did not return the created group.');
    }
    await addMembers(client, conversation.id, userId, distinctIds);
    await client.query('COMMIT');
    return conversation;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const addMembers = async (client: PoolClient, conversationId: string, ownerId: string, memberIds: string[]) => {
  for (const memberId of memberIds) {
    await client.query(
      `INSERT INTO chat_conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [conversationId, memberId, memberId === ownerId ? 'OWNER' : 'MEMBER'],
    );
  }
};

export const isConversationMember = async (conversationId: string, userId: string) => {
  const result = await db.query<{ isMember: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM chat_conversation_members
       WHERE conversation_id = $1 AND user_id = $2
     ) AS "isMember"`,
    [conversationId, userId],
  );
  return result.rows[0]?.isMember ?? false;
};

export const listMessages = async (
  conversationId: string,
  beforeId: string | undefined,
  limit: number,
): Promise<ChatMessage[]> => {
  const result = await db.query<ChatMessage>(
    `SELECT ${messageColumns}
     FROM chat_messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN chat_messages replied ON replied.id = m.reply_to_id
     WHERE m.conversation_id = $1
       AND (
         $2::uuid IS NULL
         OR EXISTS (
           SELECT 1
           FROM chat_messages cursor
           WHERE cursor.id = $2 AND cursor.conversation_id = $1
             AND (m.created_at, m.id) < (cursor.created_at, cursor.id)
         )
       )
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $3`,
    [conversationId, beforeId ?? null, limit],
  );
  return result.rows.reverse();
};

export const createMessage = async (
  conversationId: string,
  senderId: string,
  body: string,
  replyToId: string | null,
): Promise<ChatMessage | null> => {
  const result = await db.query<ChatMessage>(
    `WITH inserted AS (
       INSERT INTO chat_messages (conversation_id, sender_id, body, reply_to_id)
       SELECT $1, $2, $3, $4
       WHERE $4::uuid IS NULL OR EXISTS (
         SELECT 1 FROM chat_messages parent
         WHERE parent.id = $4 AND parent.conversation_id = $1
       )
       RETURNING *
     )
     , notifications_created AS (
       INSERT INTO notifications (user_id, actor_id, kind, title, body, resource_type, resource_id)
       SELECT member.user_id, inserted.sender_id, 'CHAT_MESSAGE', 'New chat message',
              LEFT(inserted.body, 240), 'CONVERSATION', inserted.conversation_id
       FROM inserted
       JOIN chat_conversation_members member
         ON member.conversation_id = inserted.conversation_id
        AND member.user_id != inserted.sender_id
       LEFT JOIN notification_preferences preference
         ON preference.user_id = member.user_id
       WHERE COALESCE(preference.in_app_enabled, TRUE)
       RETURNING id
     )
     SELECT ${messageColumns.replaceAll('m.', 'inserted.')}
     FROM inserted
     JOIN users u ON u.id = inserted.sender_id
     LEFT JOIN chat_messages replied ON replied.id = inserted.reply_to_id`,
    [conversationId, senderId, body, replyToId],
  );
  return result.rows[0] ?? null;
};

export const updateMessage = async (
  conversationId: string,
  messageId: string,
  senderId: string,
  body: string,
): Promise<ChatMessage | null> => {
  const result = await db.query<ChatMessage>(
    `WITH updated AS (
       UPDATE chat_messages
       SET body = $4, edited_at = NOW()
       WHERE id = $2 AND conversation_id = $1 AND sender_id = $3 AND deleted_at IS NULL
       RETURNING *
     )
     SELECT ${messageColumns.replaceAll('m.', 'updated.')}
     FROM updated
     JOIN users u ON u.id = updated.sender_id
     LEFT JOIN chat_messages replied ON replied.id = updated.reply_to_id`,
    [conversationId, messageId, senderId, body],
  );
  return result.rows[0] ?? null;
};

export const deleteMessage = async (
  conversationId: string,
  messageId: string,
  senderId: string,
): Promise<ChatMessage | null> => {
  const result = await db.query<ChatMessage>(
    `WITH updated AS (
       UPDATE chat_messages
       SET body = '', deleted_at = NOW(), edited_at = NULL
       WHERE id = $2 AND conversation_id = $1 AND sender_id = $3 AND deleted_at IS NULL
       RETURNING *
     )
     SELECT ${messageColumns.replaceAll('m.', 'updated.')}
     FROM updated
     JOIN users u ON u.id = updated.sender_id
     LEFT JOIN chat_messages replied ON replied.id = updated.reply_to_id`,
    [conversationId, messageId, senderId],
  );
  return result.rows[0] ?? null;
};

export const markConversationRead = async (conversationId: string, userId: string) => {
  const result = await db.query<{ lastReadAt: string }>(
    `UPDATE chat_conversation_members
     SET last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2
     RETURNING last_read_at AS "lastReadAt"`,
    [conversationId, userId],
  );
  return result.rows[0] ?? null;
};
