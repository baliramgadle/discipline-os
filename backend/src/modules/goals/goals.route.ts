import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const goalInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  targetValue: z.number().finite().positive().optional(),
  currentValue: z.number().finite().min(0).optional(),
  targetDescription: z.string().trim().max(240).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one goal field is required.',
});

const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetValue: z.number().finite().positive(),
  targetDescription: z.string().trim().max(240).optional(),
});

const goalsRouter = Router();
goalsRouter.use(requireAuth);

goalsRouter.get('/:goalId/milestones', async (req, res) => {
  const result = await db.query(
    `SELECT m.id, m.goal_id AS "goalId", m.title,
            m.target_value::float8 AS "targetValue",
            m.current_value::float8 AS "currentValue",
            m.target_date::text AS "targetDate",
            m.completed_at AS "completedAt"
     FROM goal_milestones m
     JOIN goals g ON g.id = m.goal_id AND g.user_id = m.user_id
     WHERE g.id = $1 AND g.user_id = $2
     ORDER BY m.created_at`,
    [req.params.goalId, req.user!.id],
  );
  const exists = await db.query(
    'SELECT 1 FROM goals WHERE id = $1 AND user_id = $2',
    [req.params.goalId, req.user!.id],
  );
  if (!exists.rowCount) {
    return sendError(res, 'GOAL_NOT_FOUND', 'Goal could not be found.', 404);
  }
  return sendSuccess(res, result.rows);
});

goalsRouter.post('/:goalId/milestones', async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(160),
    targetValue: z.number().finite().positive(),
    targetDate: z.iso.date().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Milestone data is invalid.', 400);
  }
  const result = await db.query(
    `INSERT INTO goal_milestones (goal_id, user_id, title, target_value, target_date)
     SELECT g.id, g.user_id, $3, $4, $5::date
     FROM goals g
     WHERE g.id = $1 AND g.user_id = $2 AND g.status = 'ACTIVE'
     RETURNING id, goal_id AS "goalId", title, target_value::float8 AS "targetValue",
               current_value::float8 AS "currentValue", target_date::text AS "targetDate",
               completed_at AS "completedAt"`,
    [req.params.goalId, req.user!.id, parsed.data.title, parsed.data.targetValue, parsed.data.targetDate ?? null],
  );
  if (!result.rows[0]) {
    return sendError(res, 'GOAL_NOT_FOUND', 'Active goal could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0], 201);
});

goalsRouter.patch('/:goalId/milestones/:milestoneId', async (req, res) => {
  const parsed = z.object({
    currentValue: z.number().finite().min(0),
  }).strict().safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Milestone progress must be zero or greater.', 400);
  }
  const result = await db.query(
    `UPDATE goal_milestones m
     SET current_value = $4,
         completed_at = CASE WHEN $4 >= m.target_value THEN COALESCE(m.completed_at, NOW()) ELSE NULL END,
         updated_at = NOW()
     FROM goals g
     WHERE m.id = $1 AND m.goal_id = $2 AND m.user_id = $3
       AND g.id = m.goal_id AND g.user_id = m.user_id
     RETURNING m.id, m.goal_id AS "goalId", m.title,
               m.target_value::float8 AS "targetValue", m.current_value::float8 AS "currentValue",
               m.target_date::text AS "targetDate", m.completed_at AS "completedAt"`,
    [req.params.milestoneId, req.params.goalId, req.user!.id, parsed.data.currentValue],
  );
  if (!result.rows[0]) {
    return sendError(res, 'MILESTONE_NOT_FOUND', 'Milestone could not be found.', 404);
  }
  if (result.rows[0].completedAt) {
    await db.query(
      `INSERT INTO notifications (user_id, kind, title, body, resource_type, resource_id, dedupe_key)
       SELECT $1, 'MILESTONE_COMPLETED', 'Goal milestone completed', $2, 'MILESTONE', $3::uuid,
              'milestone-completed:' || $3::uuid::text
       WHERE COALESCE((SELECT in_app_enabled FROM notification_preferences WHERE user_id = $1), TRUE)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [req.user!.id, `You completed ${result.rows[0].title}.`, result.rows[0].id],
    );
  }
  return sendSuccess(res, result.rows[0]);
});

goalsRouter.delete('/:goalId/milestones/:milestoneId', async (req, res) => {
  const result = await db.query(
    `DELETE FROM goal_milestones
     WHERE id = $1 AND goal_id = $2 AND user_id = $3
     RETURNING id`,
    [req.params.milestoneId, req.params.goalId, req.user!.id],
  );
  if (!result.rowCount) {
    return sendError(res, 'MILESTONE_NOT_FOUND', 'Milestone could not be found.', 404);
  }
  return sendSuccess(res, { deleted: true });
});

goalsRouter.get('/summary', async (req, res) => {
  const [goalsResult, scoreResult] = await Promise.all([
    db.query<{
      id: string;
      name: string;
      targetValue: string;
      currentValue: string;
      targetDescription: string | null;
      status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
    }>(
      `SELECT id, name,
              target_value::text AS "targetValue",
              current_value::text AS "currentValue",
              target_description AS "targetDescription",
              status
       FROM goals
       WHERE user_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC`,
      [req.user!.id],
    ),
    db.query<{ annual: string; monthly: string }>(
      `SELECT COALESCE(SUM(points_awarded) FILTER (
                WHERE check_in_date >= DATE_TRUNC('year', CURRENT_DATE)::date
              ), 0)::text AS annual,
              COALESCE(SUM(points_awarded) FILTER (
                WHERE check_in_date >= DATE_TRUNC('month', CURRENT_DATE)::date
              ), 0)::text AS monthly
       FROM (
         SELECT points_awarded, check_in_date FROM task_check_ins WHERE user_id = $1
         UNION ALL
         SELECT points_awarded, check_in_date FROM routine_check_ins WHERE user_id = $1
       ) all_check_ins`,
      [req.user!.id],
    ),
  ]);

  const scores = scoreResult.rows[0];
  return sendSuccess(res, {
    annualScore: Number(scores?.annual ?? 0),
    monthlyScore: Number(scores?.monthly ?? 0),
    activeGoals: goalsResult.rows.map((goal) => {
      const targetValue = Number(goal.targetValue);
      const currentValue = Number(goal.currentValue);
      return {
        ...goal,
        targetValue,
        currentValue,
        progress: Math.min(100, Math.round((currentValue / targetValue) * 100)),
        target: goal.targetDescription || `${currentValue} of ${targetValue}`,
      };
    }),
  });
});

goalsRouter.post('/', async (req, res) => {
  const parsed = createGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Goal data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `INSERT INTO goals (user_id, name, target_value, target_description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, target_value::text AS "targetValue",
               current_value::text AS "currentValue",
               target_description AS "targetDescription", status`,
    [
      req.user!.id,
      parsed.data.name,
      parsed.data.targetValue,
      parsed.data.targetDescription ?? null,
    ],
  );
  return sendSuccess(res, result.rows[0], 201);
});

goalsRouter.patch('/:goalId', async (req, res) => {
  const parsed = goalInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Goal data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `UPDATE goals
     SET name = COALESCE($3, name),
         target_value = COALESCE($4, target_value),
         current_value = COALESCE($5, current_value),
         target_description = COALESCE($6, target_description),
         status = CASE
           WHEN COALESCE($5, current_value) >= COALESCE($4, target_value) THEN 'COMPLETED'
           ELSE 'ACTIVE'
         END,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'ARCHIVED'
     RETURNING id, name, target_value::text AS "targetValue",
               current_value::text AS "currentValue",
               target_description AS "targetDescription", status`,
    [
      req.params.goalId,
      req.user!.id,
      parsed.data.name ?? null,
      parsed.data.targetValue ?? null,
      parsed.data.currentValue ?? null,
      parsed.data.targetDescription ?? null,
    ],
  );

  if (!result.rows[0]) {
    return sendError(res, 'GOAL_NOT_FOUND', 'Goal could not be found.', 404);
  }
  if (result.rows[0].status === 'COMPLETED') {
    await db.query(
      `INSERT INTO notifications (user_id, kind, title, body, resource_type, resource_id, dedupe_key)
       SELECT $1, 'GOAL_COMPLETED', 'Goal completed', $2, 'GOAL', $3::uuid,
              'goal-completed:' || $3::uuid::text
       WHERE COALESCE((SELECT in_app_enabled FROM notification_preferences WHERE user_id = $1), TRUE)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [req.user!.id, `You reached your goal: ${result.rows[0].name}.`, result.rows[0].id],
    );
  }
  return sendSuccess(res, result.rows[0]);
});

goalsRouter.delete('/:goalId', async (req, res) => {
  const result = await db.query(
    `UPDATE goals
     SET status = 'ARCHIVED', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'ARCHIVED'
     RETURNING id`,
    [req.params.goalId, req.user!.id],
  );

  if (!result.rows[0]) {
    return sendError(res, 'GOAL_NOT_FOUND', 'Goal could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

export default goalsRouter;
