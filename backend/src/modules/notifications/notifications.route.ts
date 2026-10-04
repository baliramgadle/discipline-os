import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../lib/db.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const parsed = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Notification limit must be between 1 and 100.', 400);
  }
  await db.query(
    `INSERT INTO notifications (user_id, kind, title, body, resource_type, resource_id, dedupe_key)
     SELECT t.user_id, 'TASK_DUE', 'Task due: ' || t.title,
            CASE WHEN t.due_date < CURRENT_DATE
              THEN 'This task is past its due date.'
              ELSE 'This task is due today.'
            END,
            'TASK', t.id, 'task-due:' || t.id::text
     FROM tasks t
     WHERE t.user_id = $1 AND t.is_active = TRUE
       AND t.due_date <= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM task_check_ins c
         WHERE c.task_id = t.id AND c.user_id = t.user_id
           AND c.check_in_date = CURRENT_DATE
       )
       AND COALESCE((
         SELECT p.in_app_enabled FROM notification_preferences p WHERE p.user_id = t.user_id
       ), TRUE)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [req.user!.id],
  );
  const result = await db.query(
    `SELECT n.id, n.kind, n.title, n.body, n.resource_type AS "resourceType",
            n.resource_id AS "resourceId", n.read_at AS "readAt",
            n.created_at AS "createdAt", actor.name AS "actorName"
     FROM notifications n
     LEFT JOIN users actor ON actor.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [req.user!.id, parsed.data.limit],
  );
  return sendSuccess(res, result.rows);
});

notificationsRouter.get('/preferences', async (req, res) => {
  const result = await db.query(
    `SELECT COALESCE(p.in_app_enabled, TRUE) AS "inAppEnabled"
     FROM users u
     LEFT JOIN notification_preferences p ON p.user_id = u.id
     WHERE u.id = $1`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows[0] ?? { inAppEnabled: true });
});

notificationsRouter.put('/preferences', async (req, res) => {
  const parsed = z.object({ inAppEnabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Notification preference must be true or false.', 400);
  }
  const result = await db.query(
    `INSERT INTO notification_preferences (user_id, in_app_enabled)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
     SET in_app_enabled = EXCLUDED.in_app_enabled, updated_at = NOW()
     RETURNING in_app_enabled AS "inAppEnabled"`,
    [req.user!.id, parsed.data.inAppEnabled],
  );
  return sendSuccess(res, result.rows[0]);
});

notificationsRouter.post('/read-all', async (req, res) => {
  const result = await db.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [req.user!.id],
  );
  return sendSuccess(res, { markedRead: result.rowCount ?? 0 });
});

notificationsRouter.post('/:notificationId/read', async (req, res) => {
  const parsed = z.object({ notificationId: z.uuid() }).safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Notification ID is invalid.', 400);
  }
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_at AS "readAt"`,
    [parsed.data.notificationId, req.user!.id],
  );
  if (!result.rows[0]) {
    return sendError(res, 'NOTIFICATION_NOT_FOUND', 'Notification could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

export default notificationsRouter;
