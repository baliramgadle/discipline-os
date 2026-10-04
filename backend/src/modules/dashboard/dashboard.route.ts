import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';
import { getScoreSummary } from '../scores/score.service.js';

const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/overview', async (req, res) => {
  const userId = req.user!.id;
  const [scoreSummary, goalTotals, scoreTotals] = await Promise.all([
    getScoreSummary(userId, 30),
    db.query<{ active: string }>(
      `SELECT COUNT(*)::text AS active
       FROM goals
       WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId],
    ),
    db.query<{ all_time: string; this_month: string }>(
      `SELECT COALESCE(SUM(points_awarded), 0)::text AS all_time,
              COALESCE(SUM(points_awarded) FILTER (
                WHERE check_in_date >= DATE_TRUNC('month', CURRENT_DATE)::date
              ), 0)::text AS this_month
       FROM (
         SELECT points_awarded, check_in_date FROM task_check_ins WHERE user_id = $1
         UNION ALL
         SELECT points_awarded, check_in_date FROM routine_check_ins WHERE user_id = $1
       ) all_check_ins`,
      [userId],
    ),
  ]);

  const goals = goalTotals.rows[0];
  const scores = scoreTotals.rows[0];
  const { today } = scoreSummary;

  return sendSuccess(res, {
    headline: 'Plan → Execute → Check-in → Score → Analyze → Improve',
    user: {
      name: req.user!.name,
      role: req.user!.role,
    },
    metrics: [
      {
        label: 'Daily score',
        value: `${today.score}%`,
        change: `${today.tasksCompleted} of ${today.tasksTotal} tasks complete today`,
        tone: today.score === 100 ? 'positive' : today.score > 0 ? 'neutral' : 'warning',
      },
      {
        label: 'Current streak',
        value: `${scoreSummary.currentStreakDays} days`,
        change: `Best streak: ${scoreSummary.bestStreakDays} days`,
        tone: scoreSummary.currentStreakDays > 0 ? 'positive' : 'neutral',
      },
      {
        label: 'XP earned',
        value: Number(scores?.all_time ?? 0).toLocaleString(),
        change: `${Number(scores?.this_month ?? 0).toLocaleString()} this month`,
        tone: 'positive',
      },
      {
        label: 'Active goals',
        value: goals?.active ?? '0',
        change: 'Currently in progress',
        tone: 'neutral',
      },
    ],
  });
});

export default dashboardRouter;
