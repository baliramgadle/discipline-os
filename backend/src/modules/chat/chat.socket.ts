import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { env } from '../../config/env.js';
import { findUserById } from '../auth/auth.repository.js';
import { verifyToken } from '../../utils/jwt.js';
import { getConversationPeerIds, getUserConversationIds } from './chat.service.js';

let chatIo: Server | null = null;
const connectedSockets = new Map<string, number>();

const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;
const conversationPeers = new Map<string, Set<string>>();

export const initializeChatSocket = (server: HttpServer) => {
  chatIo = new Server(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    maxHttpBufferSize: 16_384,
  });

  chatIo.use(async (socket, next) => {
    const accessToken = socket.handshake.auth.accessToken;
    if (typeof accessToken !== 'string') {
      return next(new Error('Authentication required.'));
    }
    let payload;
    try {
      payload = verifyToken(accessToken, 'access');
    } catch {
      return next(new Error('Authentication token is invalid or expired.'));
    }
    if (payload.type !== 'access') {
      return next(new Error('An access token is required.'));
    }
    try {
      const user = await findUserById(payload.sub);
      if (!user || !user.isActive) {
        return next(new Error('Authentication required.'));
      }
      socket.data.user = { id: user.id, username: user.username };
      return next();
    } catch (error) {
      console.error('Chat socket user lookup failed:', error);
      return next(new Error('Authentication could not be verified.'));
    }
  });

  chatIo.on('connection', async (socket) => {
    try {
      const user = socket.data.user as { id: string; username: string };
      const previousCount = connectedSockets.get(user.id) ?? 0;
      connectedSockets.set(user.id, previousCount + 1);
      const conversationIds = await getUserConversationIds(user.id);
      const peerIds = await getConversationPeerIds(user.id);
      socket.data.peerIds = peerIds;
      socket.data.conversationIds = new Set(conversationIds);
      conversationPeers.set(user.id, new Set(peerIds));
      await socket.join(userRoom(user.id));
      await socket.join(conversationIds.map(conversationRoom));

      socket.emit('chat:presence_snapshot', peerIds
        .filter((peerId) => (connectedSockets.get(peerId) ?? 0) > 0));
      if (previousCount === 0) {
        for (const peerId of peerIds) {
          chatIo?.to(userRoom(peerId)).emit('chat:presence', { userId: user.id, online: true });
        }
      }

      socket.on('chat:typing_start', (conversationId: unknown) => {
        const joinedConversations = socket.data.conversationIds as Set<string>;
        if (typeof conversationId !== 'string' || !joinedConversations.has(conversationId)) {
          return;
        }
        socket.to(conversationRoom(conversationId)).emit('chat:typing', {
          conversationId,
          userId: user.id,
          username: user.username,
          typing: true,
        });
      });
      socket.on('chat:typing_stop', (conversationId: unknown) => {
        const joinedConversations = socket.data.conversationIds as Set<string>;
        if (typeof conversationId !== 'string' || !joinedConversations.has(conversationId)) {
          return;
        }
        socket.to(conversationRoom(conversationId)).emit('chat:typing', {
          conversationId,
          userId: user.id,
          username: user.username,
          typing: false,
        });
      });
    } catch (error) {
      console.error('Could not initialize authenticated chat connection:', error);
      socket.disconnect(true);
    }
  });

  chatIo.on('connection', (socket) => {
    socket.on('disconnect', () => {
      const user = socket.data.user as { id: string };
      const count = connectedSockets.get(user.id) ?? 0;
      if (count <= 1) {
        connectedSockets.delete(user.id);
        const peerIds = [...(conversationPeers.get(user.id) ?? new Set<string>())];
        conversationPeers.delete(user.id);
        for (const peerId of peerIds ?? []) {
          chatIo?.to(userRoom(peerId)).emit('chat:presence', { userId: user.id, online: false });
        }
      } else {
        connectedSockets.set(user.id, count - 1);
      }
    });
  });

  return chatIo;
};

export const emitChatEvent = (conversationId: string, event: string, payload: unknown) => {
  chatIo?.to(conversationRoom(conversationId)).emit(event, payload);
};

export const notifyConversationCreated = async (conversationId: string, userIds: string[]) => {
  const room = conversationRoom(conversationId);
  for (const userId of userIds) {
    if (chatIo) {
      try {
        await chatIo.in(userRoom(userId)).socketsJoin(room);
        const sockets = await chatIo.in(userRoom(userId)).fetchSockets();
        for (const socket of sockets) {
          const joinedConversations = socket.data.conversationIds as Set<string>;
          joinedConversations.add(conversationId);
        }
      } catch (error) {
        console.error('Could not update chat rooms for a new conversation:', error);
      }
    }
    chatIo?.to(userRoom(userId)).emit('chat:conversation_available', { conversationId });
    const peers = conversationPeers.get(userId) ?? new Set<string>();
    for (const peerId of userIds) {
      if (peerId !== userId) peers.add(peerId);
    }
    conversationPeers.set(userId, peers);
    if ((connectedSockets.get(userId) ?? 0) > 0) {
      for (const peerId of userIds) {
        if (peerId !== userId && (connectedSockets.get(peerId) ?? 0) > 0) {
          chatIo?.to(userRoom(userId)).emit('chat:presence', { userId: peerId, online: true });
        }
      }
    }
  }
};
