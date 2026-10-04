import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../lib/db.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

const periods = {
  daily: 'CURRENT_DATE',
  weekly: "date_trunc('week', CURRENT_DATE)::date",
  monthly: "date_trunc('month', CURRENT_DATE)::date",
} as const;

leaderboardRouter.get('/', async (req, res) => {
  const parsed = z.object({
    period: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Leaderboard period is invalid.', 400);
  }
  const startDate = periods[parsed.data.period];
  const result = await db.query(
    `WITH activity AS (
       SELECT user_id, check_in_date AS activity_date, points_awarded
       FROM task_check_ins
       WHERE check_in_date >= ${startDate}
       UNION ALL
       SELECT user_id, check_in_date AS activity_date, points_awarded
       FROM routine_check_ins
       WHERE check_in_date >= ${startDate}
     )
     SELECT u.id AS "userId", u.name,
            COALESCE(SUM(a.points_awarded), 0)::int AS "pointsEarned",
            COUNT(DISTINCT a.activity_date)::int AS "activeDays"
     FROM users u
     LEFT JOIN activity a ON a.user_id = u.id
     WHERE u.is_active = TRUE AND u.leaderboard_visible = TRUE
     GROUP BY u.id, u.name
     ORDER BY "pointsEarned" DESC, "activeDays" DESC, u.name ASC
     LIMIT 100`,
  );
  return sendSuccess(res, {
    period: parsed.data.period,
    rankingRule: 'Total XP awarded by completed task and routine check-ins during the selected calendar period.',
    entries: result.rows.map((row, index) => ({ rank: index + 1, ...row })),
  });
});

leaderboardRouter.get('/preferences', async (req, res) => {
  const result = await db.query(
    `SELECT leaderboard_visible AS "leaderboardVisible"
     FROM users WHERE id = $1`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows[0] ?? { leaderboardVisible: false });
});

leaderboardRouter.put('/preferences', async (req, res) => {
  const parsed = z.object({ leaderboardVisible: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Leaderboard visibility must be true or false.', 400);
  }
  const result = await db.query(
    `UPDATE users SET leaderboard_visible = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING leaderboard_visible AS "leaderboardVisible"`,
    [req.user!.id, parsed.data.leaderboardVisible],
  );
  return sendSuccess(res, result.rows[0]);
});

export default leaderboardRouter;
