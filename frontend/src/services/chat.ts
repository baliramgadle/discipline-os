import type { Socket } from 'socket.io-client';
import { API_BASE_URL } from './apiOrigin';

const API_PREFIX = `${API_BASE_URL}/chat`;

export type ChatUser = { id: string; username: string };

export type ChatConversation = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  createdAt: string;
  updatedAt: string;
  otherUserId: string | null;
  otherUsername: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  members: ChatUser[];
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  body: string | null;
  replyToId: string | null;
  replyToBody: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  isRead: boolean;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

const request = async <T>(token: string, path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.success || !('data' in result)) {
    throw new Error(result.error?.message ?? 'The chat request failed.');
  }
  return result.data as T;
};

export const searchChatUsers = (token: string, query: string) =>
  request<ChatUser[]>(token, `/users?query=${encodeURIComponent(query)}`);

export const fetchConversations = (token: string) =>
  request<ChatConversation[]>(token, '/conversations');

export const createDirectConversation = (token: string, userId: string) =>
  request<{ id: string }>(token, '/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

export const createGroupConversation = (token: string, name: string, memberIds: string[]) =>
  request<{ id: string }>(token, '/conversations/group', {
    method: 'POST',
    body: JSON.stringify({ name, memberIds }),
  });

export const fetchMessages = (
  token: string,
  conversationId: string,
  before?: string,
) => {
  const params = new URLSearchParams({ limit: '50' });
  if (before) {
    params.set('before', before);
  }
  return request<ChatMessage[]>(
    token,
    `/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  );
};

export const sendChatMessage = (
  token: string,
  conversationId: string,
  body: string,
  replyToId: string | null,
) =>
  request<ChatMessage>(token, `/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, replyToId }),
  });

export const updateChatMessage = (
  token: string,
  message: ChatMessage,
  body: string,
) =>
  request<ChatMessage>(
    token,
    `/conversations/${encodeURIComponent(message.conversationId)}/messages/${encodeURIComponent(message.id)}`,
    { method: 'PATCH', body: JSON.stringify({ body }) },
  );

export const deleteChatMessage = (token: string, message: ChatMessage) =>
  request<ChatMessage>(
    token,
    `/conversations/${encodeURIComponent(message.conversationId)}/messages/${encodeURIComponent(message.id)}`,
    { method: 'DELETE' },
  );

export const markConversationRead = (token: string, conversationId: string) =>
  request<{ lastReadAt: string }>(
    token,
    `/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: 'POST', body: JSON.stringify({}) },
  );

export type ChatSocket = Socket;
