import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';
import { getScoreSummary } from './score.service.js';

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

const scoresRouter = Router();
scoresRouter.use(requireAuth);

const targetSchema = z.object({
  metric: z.enum(['XP', 'ACTIVE_DAYS', 'STREAK']),
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  targetValue: z.number().int().min(1).max(100000),
});

const refreshAchievements = async (userId: string) => {
  const [totals, scoreSummary] = await Promise.all([
    db.query<{
      totalXp: string;
      totalCheckins: string;
      projectsCompleted: string;
    }>(
      `SELECT
         (SELECT COALESCE(SUM(points_awarded), 0)::text FROM (
            SELECT points_awarded FROM task_check_ins WHERE user_id = $1
            UNION ALL
            SELECT points_awarded FROM routine_check_ins WHERE user_id = $1
          ) earned) AS "totalXp",
         ((SELECT COUNT(*) FROM task_check_ins WHERE user_id = $1)
          + (SELECT COUNT(*) FROM routine_check_ins WHERE user_id = $1))::text AS "totalCheckins",
         (SELECT COUNT(*)::text FROM projects WHERE user_id = $1 AND status = 'COMPLETED') AS "projectsCompleted"`,
      [userId],
    ),
    getScoreSummary(userId, 90),
  ]);
  const total = totals.rows[0];
  if (!total) throw new Error('Database did not return achievement totals.');

  const metrics: Record<string, number> = {
    TOTAL_XP: Number(total.totalXp),
    TOTAL_CHECKINS: Number(total.totalCheckins),
    BEST_STREAK: scoreSummary.bestStreakDays,
    PROJECTS_COMPLETED: Number(total.projectsCompleted),
  };
  const eligible = await db.query<{ key: string; title: string; description: string; value: number }>(
    `INSERT INTO user_achievements (user_id, achievement_key, value_at_unlock)
     SELECT $1, d.key, GREATEST(
       CASE d.metric
       WHEN 'TOTAL_XP' THEN $2::integer
       WHEN 'TOTAL_CHECKINS' THEN $3::integer
       WHEN 'BEST_STREAK' THEN $4::integer
       WHEN 'PROJECTS_COMPLETED' THEN $5::integer
       END, 0
     )
     FROM achievement_definitions d
     WHERE CASE d.metric
         WHEN 'TOTAL_XP' THEN $2::integer
         WHEN 'TOTAL_CHECKINS' THEN $3::integer
         WHEN 'BEST_STREAK' THEN $4::integer
         WHEN 'PROJECTS_COMPLETED' THEN $5::integer
       END >= d.threshold
     ON CONFLICT (user_id, achievement_key) DO NOTHING
     RETURNING achievement_key AS key, value_at_unlock AS value`,
    [userId, metrics.TOTAL_XP, metrics.TOTAL_CHECKINS, metrics.BEST_STREAK, metrics.PROJECTS_COMPLETED],
  );

  for (const unlocked of eligible.rows) {
    const definition = await db.query<{ title: string; description: string }>(
      'SELECT title, description FROM achievement_definitions WHERE key = $1',
      [unlocked.key],
    );
    const achievement = definition.rows[0];
    if (!achievement) throw new Error(`Achievement definition ${unlocked.key} is missing.`);
    await db.query(
      `INSERT INTO notifications
         (user_id, kind, title, body, resource_type, resource_id, dedupe_key)
       SELECT $1, 'ACHIEVEMENT_UNLOCKED', $2, $3, 'ACHIEVEMENT', NULL,
              'achievement:' || $4::text
       WHERE COALESCE((SELECT in_app_enabled FROM notification_preferences WHERE user_id = $1), TRUE)`,
      [userId, `Achievement unlocked: ${achievement.title}`, achievement.description, unlocked.key],
    );
  }

  return db.query(
    `SELECT d.key, d.title, d.description, d.metric,
            d.threshold, a.earned_at AS "earnedAt",
            a.value_at_unlock AS "valueAtUnlock",
            CASE d.metric
              WHEN 'TOTAL_XP' THEN $2::integer
              WHEN 'TOTAL_CHECKINS' THEN $3::integer
              WHEN 'BEST_STREAK' THEN $4::integer
              WHEN 'PROJECTS_COMPLETED' THEN $5::integer
            END AS progress
     FROM achievement_definitions d
     LEFT JOIN user_achievements a
       ON a.achievement_key = d.key AND a.user_id = $1
     ORDER BY d.threshold, d.title`,
    [userId, metrics.TOTAL_XP, metrics.TOTAL_CHECKINS, metrics.BEST_STREAK, metrics.PROJECTS_COMPLETED],
  );
};

scoresRouter.get('/summary', async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      'Score history days must be between 7 and 90.',
      400,
    );
  }

  const summary = await getScoreSummary(req.user!.id, parsed.data.days);
  return sendSuccess(res, summary);
});

scoresRouter.get('/targets', async (req, res) => {
  const result = await db.query<{
    id: string;
    metric: 'XP' | 'ACTIVE_DAYS' | 'STREAK';
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    targetValue: number;
  }>(
    `SELECT id, metric, period, target_value AS "targetValue"
     FROM score_targets
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user!.id],
  );
  const streak = await getScoreSummary(req.user!.id, 7);
  const progress = await Promise.all(result.rows.map(async (target) => {
    if (target.metric === 'STREAK') {
      return { ...target, currentValue: streak.currentStreakDays };
    }
    const startExpression = target.period === 'DAILY'
      ? 'CURRENT_DATE'
      : target.period === 'WEEKLY'
        ? "date_trunc('week', CURRENT_DATE)::date"
        : "date_trunc('month', CURRENT_DATE)::date";
    const activity = await db.query<{ currentValue: string }>(
      `SELECT ${target.metric === 'XP'
        ? 'COALESCE(SUM(points_awarded), 0)'
        : 'COUNT(DISTINCT check_in_date)'}::text AS "currentValue"
       FROM (
         SELECT points_awarded, check_in_date FROM task_check_ins
         WHERE user_id = $1 AND check_in_date >= ${startExpression}
         UNION ALL
         SELECT points_awarded, check_in_date FROM routine_check_ins
         WHERE user_id = $1 AND check_in_date >= ${startExpression}
       ) activity`,
      [req.user!.id],
    );
    return { ...target, currentValue: Number(activity.rows[0]?.currentValue ?? 0) };
  }));
  return sendSuccess(res, progress);
});

scoresRouter.post('/targets', async (req, res) => {
  const parsed = targetSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Score target is invalid.', 400);
  }
  const count = await db.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM score_targets WHERE user_id = $1',
    [req.user!.id],
  );
  if ((count.rows[0]?.count ?? 0) >= 10) {
    return sendError(res, 'TARGET_LIMIT_REACHED', 'You can have up to 10 score targets.', 409);
  }
  const result = await db.query(
    `INSERT INTO score_targets (user_id, metric, period, target_value)
     VALUES ($1, $2, $3, $4)
     RETURNING id, metric, period, target_value AS "targetValue"`,
    [req.user!.id, parsed.data.metric, parsed.data.period, parsed.data.targetValue],
  );
  return sendSuccess(res, { ...result.rows[0], currentValue: 0 }, 201);
});

scoresRouter.delete('/targets/:targetId', async (req, res) => {
  const parsed = z.object({ targetId: z.uuid() }).safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Score target ID is invalid.', 400);
  }
  const result = await db.query(
    'DELETE FROM score_targets WHERE id = $1 AND user_id = $2 RETURNING id',
    [parsed.data.targetId, req.user!.id],
  );
  if (!result.rows[0]) {
    return sendError(res, 'TARGET_NOT_FOUND', 'Score target could not be found.', 404);
  }
  return sendSuccess(res, { deleted: true });
});

scoresRouter.get('/achievements', async (req, res) => {
  const result = await refreshAchievements(req.user!.id);
  return sendSuccess(res, result.rows);
});

export default scoresRouter;
