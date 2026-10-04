import * as chatRepository from './chat.repository.js';
import type { ChatConversation, ChatMessage } from './chat.types.js';

export class ChatServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

export const listUsers = (userId: string, query: string) =>
  chatRepository.listChatUsers(userId, query);

export const listConversations = (userId: string): Promise<ChatConversation[]> =>
  chatRepository.listConversations(userId);

export const createDirectConversation = async (userId: string, otherUserId: string) => {
  if (userId === otherUserId) {
    throw new ChatServiceError('You cannot start a conversation with yourself.', 'INVALID_RECIPIENT', 400);
  }
  const conversation = await chatRepository.createDirectConversation(userId, otherUserId);
  if (!conversation) {
    throw new ChatServiceError('The selected user could not be found.', 'USER_NOT_FOUND', 404);
  }
  return conversation;
};

export const createGroupConversation = async (
  userId: string,
  name: string,
  memberIds: string[],
) => {
  if (memberIds.length < 1 || memberIds.length > 49) {
    throw new ChatServiceError('A group must include between 1 and 49 other members.', 'INVALID_MEMBERS', 400);
  }
  if (memberIds.includes(userId) || new Set(memberIds).size !== memberIds.length) {
    throw new ChatServiceError('Group members must be unique and must not include you.', 'INVALID_MEMBERS', 400);
  }
  const conversation = await chatRepository.createGroupConversation(userId, name, memberIds);
  if (!conversation) {
    throw new ChatServiceError('One or more selected users could not be found.', 'USER_NOT_FOUND', 404);
  }
  return conversation;
};

export const getMessages = async (
  conversationId: string,
  userId: string,
  beforeId: string | undefined,
  limit: number,
): Promise<ChatMessage[]> => {
  await requireConversationMember(conversationId, userId);
  return chatRepository.listMessages(conversationId, beforeId, limit);
};

export const sendMessage = async (
  conversationId: string,
  userId: string,
  body: string,
  replyToId: string | null,
) => {
  await requireConversationMember(conversationId, userId);
  const message = await chatRepository.createMessage(conversationId, userId, body, replyToId);
  if (!message) {
    throw new ChatServiceError('The reply target could not be found in this conversation.', 'REPLY_NOT_FOUND', 404);
  }
  return message;
};

export const editMessage = async (
  conversationId: string,
  messageId: string,
  userId: string,
  body: string,
) => {
  await requireConversationMember(conversationId, userId);
  const message = await chatRepository.updateMessage(conversationId, messageId, userId, body);
  if (!message) {
    throw new ChatServiceError('The message could not be found or is no longer editable.', 'MESSAGE_NOT_FOUND', 404);
  }
  return message;
};

export const removeMessage = async (conversationId: string, messageId: string, userId: string) => {
  await requireConversationMember(conversationId, userId);
  const message = await chatRepository.deleteMessage(conversationId, messageId, userId);
  if (!message) {
    throw new ChatServiceError('The message could not be found or was already deleted.', 'MESSAGE_NOT_FOUND', 404);
  }
  return message;
};

export const markRead = async (conversationId: string, userId: string) => {
  await requireConversationMember(conversationId, userId);
  return chatRepository.markConversationRead(conversationId, userId);
};

export const getUserConversationIds = (userId: string) =>
  chatRepository.listConversationIds(userId);

export const getConversationPeerIds = (userId: string) =>
  chatRepository.listConversationPeerIds(userId);

const requireConversationMember = async (conversationId: string, userId: string) => {
  const isMember = await chatRepository.isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ChatServiceError('The conversation could not be found.', 'CONVERSATION_NOT_FOUND', 404);
  }
};
