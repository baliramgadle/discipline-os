import { Router } from 'express';
import { z } from 'zod';

import { db, pool } from '../../lib/db.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { requireAdmin, requireAuth } from '../../middleware/auth.middleware.js';

const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/stats', async (_req, res) => {
  const result = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM users) AS "totalUsers",
            (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS "activeUsers",
            (SELECT COUNT(*)::int FROM users WHERE role = 'ADMIN') AS "adminUsers",
            (SELECT COUNT(*)::int FROM chat_messages WHERE created_at >= NOW() - INTERVAL '24 hours') AS "messagesLast24Hours",
            (SELECT COUNT(*)::int FROM task_check_ins WHERE check_in_date = CURRENT_DATE) AS "taskCheckInsToday",
            (SELECT COUNT(*)::int FROM routine_check_ins WHERE check_in_date = CURRENT_DATE) AS "routineCheckInsToday"`,
  );
  return sendSuccess(res, result.rows[0]);
});

adminRouter.get('/users', async (req, res) => {
  const parsed = z.object({
    search: z.string().trim().max(120).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'User search or pagination parameters are invalid.', 400);
  }
  const result = await db.query(
    `SELECT id, name, username, email, role, is_active AS "isActive",
            created_at AS "createdAt"
     FROM users
     WHERE name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [`%${parsed.data.search}%`, parsed.data.limit, parsed.data.offset],
  );
  return sendSuccess(res, result.rows);
});

adminRouter.patch('/users/:userId', async (req, res) => {
  const params = z.object({ userId: z.uuid() }).safeParse(req.params);
  const body = z.object({
    role: z.enum(['USER', 'ADMIN']).optional(),
    isActive: z.boolean().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0).safeParse(req.body);
  if (!params.success || !body.success) {
    return sendError(res, 'VALIDATION_ERROR', 'A valid role or account status is required.', 400);
  }
  if (params.data.userId === req.user!.id && body.data.isActive === false) {
    return sendError(res, 'SELF_DEACTIVATION_BLOCKED', 'You cannot deactivate your own administrator account.', 400);
  }
  if (params.data.userId === req.user!.id && body.data.role === 'USER') {
    return sendError(res, 'SELF_DEMOTION_BLOCKED', 'You cannot remove your own administrator role.', 400);
  }
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Database access is unavailable.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(807531)');
    const existing = await client.query<{ role: string; isActive: boolean }>(
      `SELECT role, is_active AS "isActive" FROM users WHERE id = $1 FOR UPDATE`,
      [params.data.userId],
    );
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return sendError(res, 'USER_NOT_FOUND', 'User could not be found.', 404);
    }
    const nextRole = body.data.role ?? existing.rows[0].role;
    const nextActive = body.data.isActive ?? existing.rows[0].isActive;
    if (existing.rows[0].role === 'ADMIN' && existing.rows[0].isActive
      && (nextRole !== 'ADMIN' || !nextActive)) {
      const adminCount = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE role = 'ADMIN' AND is_active = TRUE`,
      );
      if ((adminCount.rows[0]?.count ?? 0) <= 1) {
        await client.query('ROLLBACK');
        return sendError(res, 'LAST_ADMIN_REQUIRED', 'The last active administrator cannot be demoted or deactivated.', 409);
      }
    }
    const updated = await client.query(
      `UPDATE users SET role = $2, is_active = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, is_active AS "isActive",
                 created_at AS "createdAt"`,
      [params.data.userId, nextRole, nextActive],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_user_id, details)
       VALUES ($1, 'USER_ACCOUNT_UPDATED', $2, $3::jsonb)`,
      [
        req.user!.id,
        params.data.userId,
        JSON.stringify({
          previous: existing.rows[0],
          updated: { role: nextRole, isActive: nextActive },
        }),
      ],
    );
    await client.query('COMMIT');
    return sendSuccess(res, updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

adminRouter.get('/audit-logs', async (req, res) => {
  const parsed = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Audit log limit must be between 1 and 100.', 400);
  }
  const result = await db.query(
    `SELECT l.id, l.action, l.details, l.created_at AS "createdAt",
            actor.name AS "actorName", target.name AS "targetName"
     FROM audit_logs l
     LEFT JOIN users actor ON actor.id = l.actor_id
     LEFT JOIN users target ON target.id = l.target_user_id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [parsed.data.limit],
  );
  return sendSuccess(res, result.rows);
});

export default adminRouter;
