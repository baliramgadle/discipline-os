import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { emitChatEvent, notifyConversationCreated } from './chat.socket.js';
import * as chatService from './chat.service.js';

const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get('/users', async (req, res) => {
  const parsed = z.object({
    query: z.string().trim().regex(/^@?[a-zA-Z0-9_]{2,50}$/),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Search by username using at least two letters, numbers, or underscores.', 400);
  }
  const users = await chatService.listUsers(req.user!.id, parsed.data.query.replace(/^@/, ''));
  return sendSuccess(res, users);
});

chatRouter.get('/conversations', async (req, res) => {
  const conversations = await chatService.listConversations(req.user!.id);
  return sendSuccess(res, conversations);
});

chatRouter.post('/conversations/direct', async (req, res) => {
  const parsed = z.object({ userId: z.uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'A valid user ID is required.', 400);
  }
  const conversation = await chatService.createDirectConversation(req.user!.id, parsed.data.userId);
  await notifyConversationCreated(conversation.id, [req.user!.id, parsed.data.userId]);
  return sendSuccess(res, conversation, 201);
});

chatRouter.post('/conversations/group', async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    memberIds: z.array(z.uuid()).min(1).max(49),
  }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Group details are invalid.',
      400,
    );
  }
  const conversation = await chatService.createGroupConversation(
    req.user!.id,
    parsed.data.name,
    parsed.data.memberIds,
  );
  await notifyConversationCreated(conversation.id, [req.user!.id, ...parsed.data.memberIds]);
  return sendSuccess(res, conversation, 201);
});

chatRouter.get('/conversations/:conversationId/messages', async (req, res) => {
  const parsedParams = z.object({ conversationId: z.uuid() }).safeParse(req.params);
  const parsedQuery = z.object({
    before: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).safeParse(req.query);
  if (!parsedParams.success || !parsedQuery.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Message history parameters are invalid.', 400);
  }
  const messages = await chatService.getMessages(
    parsedParams.data.conversationId,
    req.user!.id,
    parsedQuery.data.before,
    parsedQuery.data.limit,
  );
  return sendSuccess(res, messages);
});

chatRouter.post('/conversations/:conversationId/messages', async (req, res) => {
  const parsedParams = z.object({ conversationId: z.uuid() }).safeParse(req.params);
  const parsedBody = z.object({
    body: z.string().trim().min(1).max(4000),
    replyToId: z.uuid().nullable().optional(),
  }).safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Message content is invalid.', 400);
  }
  const message = await chatService.sendMessage(
    parsedParams.data.conversationId,
    req.user!.id,
    parsedBody.data.body,
    parsedBody.data.replyToId ?? null,
  );
  emitChatEvent(parsedParams.data.conversationId, 'chat:message', message);
  return sendSuccess(res, message, 201);
});

chatRouter.patch('/conversations/:conversationId/messages/:messageId', async (req, res) => {
  const parsedParams = z.object({ conversationId: z.uuid(), messageId: z.uuid() }).safeParse(req.params);
  const parsedBody = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Message content is invalid.', 400);
  }
  const message = await chatService.editMessage(
    parsedParams.data.conversationId,
    parsedParams.data.messageId,
    req.user!.id,
    parsedBody.data.body,
  );
  emitChatEvent(parsedParams.data.conversationId, 'chat:message_updated', message);
  return sendSuccess(res, message);
});

chatRouter.delete('/conversations/:conversationId/messages/:messageId', async (req, res) => {
  const parsedParams = z.object({ conversationId: z.uuid(), messageId: z.uuid() }).safeParse(req.params);
  if (!parsedParams.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Message identifiers are invalid.', 400);
  }
  const message = await chatService.removeMessage(
    parsedParams.data.conversationId,
    parsedParams.data.messageId,
    req.user!.id,
  );
  emitChatEvent(parsedParams.data.conversationId, 'chat:message_updated', message);
  return sendSuccess(res, message);
});

chatRouter.post('/conversations/:conversationId/read', async (req, res) => {
  const parsedParams = z.object({ conversationId: z.uuid() }).safeParse(req.params);
  if (!parsedParams.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Conversation ID is invalid.', 400);
  }
  const readState = await chatService.markRead(parsedParams.data.conversationId, req.user!.id);
  emitChatEvent(parsedParams.data.conversationId, 'chat:read', {
    conversationId: parsedParams.data.conversationId,
    userId: req.user!.id,
    lastReadAt: readState?.lastReadAt,
  });
  return sendSuccess(res, readState);
});

export default chatRouter;
