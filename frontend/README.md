# Discipline OS frontend

The React + TypeScript frontend connects to the Express API under `/api/v1`.
The Vite development server proxies both API calls and Socket.IO traffic to the
backend.

## Development

From the repository root, configure `DATABASE_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, and `CLIENT_URL` in the backend environment file, then run:

```sh
npm run dev:backend
npm run dev:frontend
```

Apply pending SQL migrations from the repository root with:

```sh
npm --prefix backend run migrate
```

## Chat

The Messages panel supports direct and group conversations, message history,
replies, editing and deleting your own messages, read receipts, online presence,
and typing indicators. Conversations and messages are persisted in PostgreSQL;
the Socket.IO connection is authenticated with the access token and only joins
rooms for conversations where that user is a member.

REST endpoints are authenticated and mounted at `/api/v1/chat`:

- `GET /users?query=...` searches active users by username only.
- `GET /conversations` lists the caller's conversations and unread counts.
- `POST /conversations/direct` with `{ "userId": "..." }` opens or reuses a
  direct conversation.
- `POST /conversations/group` with `{ "name": "...", "memberIds": ["..."] }`
  creates a group.
- `GET /conversations/:id/messages?limit=50&before=<message-uuid>` loads
  persisted message history.
- `POST /conversations/:id/messages` with `{ "body": "...", "replyToId": null }`
  sends a message.
- `PATCH` or `DELETE /conversations/:id/messages/:messageId` edits or removes
  the caller's own message.
- `POST /conversations/:id/read` advances the caller's read position.

Socket.IO clients authenticate using `auth.accessToken`. The server emits
`chat:message`, `chat:message_updated`, `chat:read`, `chat:presence`,
`chat:presence_snapshot`, and `chat:typing`. Clients may send
`chat:typing_start` and `chat:typing_stop` with a conversation ID; membership is
checked against the authenticated socket's conversation rooms.

## Account recovery

Password recovery uses the Resend API. Configure `RESEND_API_KEY` and
`EMAIL_FROM` in the backend environment with a verified sender before enabling
reset email delivery. The API returns an explicit service-unavailable response
while email delivery is not configured; reset tokens are single-use, expire
after one hour, and invalidate existing refresh sessions after a successful
password change.
