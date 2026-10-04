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
  members: Array<{ id: string; username: string }>;
};
