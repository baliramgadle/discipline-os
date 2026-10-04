import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const routineSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  points: z.number().int().min(1).max(1000),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
});

const updateRoutineSchema = routineSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one routine field is required.' },
);

const routinesRouter = Router();
routinesRouter.use(requireAuth);

routinesRouter.get('/board', async (req, res) => {
  const result = await db.query(
    `SELECT r.id, r.title, r.category, r.points, r.weekdays,
            (c.id IS NOT NULL) AS completed
     FROM routines r
     LEFT JOIN routine_check_ins c
       ON c.routine_id = r.id
      AND c.user_id = r.user_id
      AND c.check_in_date = CURRENT_DATE
     WHERE r.user_id = $1
       AND r.is_active = TRUE
       AND EXTRACT(DOW FROM CURRENT_DATE)::smallint = ANY(r.weekdays)
     ORDER BY r.created_at`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows);
});

routinesRouter.post('/', async (req, res) => {
  const parsed = routineSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Routine data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `INSERT INTO routines (user_id, title, category, points, weekdays)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, category, points, weekdays`,
    [
      req.user!.id,
      parsed.data.title,
      parsed.data.category,
      parsed.data.points,
      parsed.data.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    ],
  );
  return sendSuccess(res, result.rows[0], 201);
});

routinesRouter.patch('/:routineId', async (req, res) => {
  const parsed = updateRoutineSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Routine data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `UPDATE routines
     SET title = COALESCE($3, title),
         category = COALESCE($4, category),
         points = COALESCE($5, points),
         weekdays = COALESCE($6, weekdays),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id, title, category, points, weekdays`,
    [
      req.params.routineId,
      req.user!.id,
      parsed.data.title ?? null,
      parsed.data.category ?? null,
      parsed.data.points ?? null,
      parsed.data.weekdays ?? null,
    ],
  );
  if (!result.rows[0]) {
    return sendError(res, 'ROUTINE_NOT_FOUND', 'Routine could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

routinesRouter.delete('/:routineId', async (req, res) => {
  const result = await db.query(
    `UPDATE routines
     SET is_active = FALSE, archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id`,
    [req.params.routineId, req.user!.id],
  );
  if (!result.rows[0]) {
    return sendError(res, 'ROUTINE_NOT_FOUND', 'Routine could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

routinesRouter.post('/:routineId/check-in', async (req, res) => {
  const result = await db.query(
    `INSERT INTO routine_check_ins (routine_id, user_id, check_in_date, points_awarded)
     SELECT r.id, r.user_id, CURRENT_DATE, r.points
     FROM routines r
     WHERE r.id = $1
       AND r.user_id = $2
       AND r.is_active = TRUE
       AND EXTRACT(DOW FROM CURRENT_DATE)::smallint = ANY(r.weekdays)
     ON CONFLICT (routine_id, check_in_date) DO NOTHING
     RETURNING routine_id AS "routineId", check_in_date AS date,
               points_awarded AS "xpAwarded"`,
    [req.params.routineId, req.user!.id],
  );
  if (result.rows[0]) {
    return sendSuccess(res, result.rows[0], 201);
  }

  const routine = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM routines
       WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     ) AS exists`,
    [req.params.routineId, req.user!.id],
  );
  if (!routine.rows[0]?.exists) {
    return sendError(res, 'ROUTINE_NOT_FOUND', 'Routine could not be found.', 404);
  }
  return sendError(
    res,
    'DUPLICATE_CHECKIN',
    'This routine is already checked in for today or is not scheduled today.',
    409,
  );
});

export default routinesRouter;
