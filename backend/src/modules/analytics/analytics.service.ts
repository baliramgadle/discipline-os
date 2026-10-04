import { db } from '../../lib/db.js';
import { getScoreSummary } from '../scores/score.service.js';

type CategoryRow = {
  category: string;
  tasksTotal: string | number;
  tasksCompleted: string | number;
  pointsEarned: string | number;
  pointsPossible: string | number;
};

const toNumber = (value: string | number) => Number(value);

export const getAnalyticsSummary = async (userId: string) => {
  const [scoreSummary, categoriesResult] = await Promise.all([
    getScoreSummary(userId, 60),
    db.query<CategoryRow>(
      `WITH analysis_days AS (
         SELECT day::date AS activity_date
         FROM GENERATE_SERIES(
           CURRENT_DATE - INTERVAL '29 days',
           CURRENT_DATE,
           INTERVAL '1 day'
         ) AS day
       ),
       scheduled_items AS (
         SELECT d.activity_date, 'task'::text AS kind, t.id, t.category, t.points
         FROM analysis_days d
         JOIN tasks t
           ON t.user_id = $1
          AND t.created_at < d.activity_date + INTERVAL '1 day'
          AND (t.archived_at IS NULL OR t.archived_at > d.activity_date)
         UNION ALL
         SELECT d.activity_date, 'routine'::text AS kind, r.id, r.category, r.points
         FROM analysis_days d
         JOIN routines r
           ON r.user_id = $1
          AND r.created_at < d.activity_date + INTERVAL '1 day'
          AND (r.archived_at IS NULL OR r.archived_at > d.activity_date)
          AND EXTRACT(DOW FROM d.activity_date)::smallint = ANY(r.weekdays)
       ),
       activity_checks AS (
         SELECT 'task'::text AS kind, task_id AS item_id,
                check_in_date, points_awarded
         FROM task_check_ins
         WHERE user_id = $1
           AND check_in_date >= CURRENT_DATE - INTERVAL '29 days'
         UNION ALL
         SELECT 'routine'::text AS kind, routine_id AS item_id,
                check_in_date, points_awarded
         FROM routine_check_ins
         WHERE user_id = $1
           AND check_in_date >= CURRENT_DATE - INTERVAL '29 days'
       )
       SELECT i.category,
              COUNT(i.id)::text AS "tasksTotal",
              COUNT(c.item_id)::text AS "tasksCompleted",
              COALESCE(SUM(c.points_awarded), 0)::text AS "pointsEarned",
              COALESCE(SUM(i.points), 0)::text AS "pointsPossible"
       FROM scheduled_items i
       LEFT JOIN activity_checks c
         ON c.kind = i.kind
        AND c.item_id = i.id
        AND c.check_in_date = i.activity_date
       GROUP BY i.category
       ORDER BY SUM(COALESCE(c.points_awarded, 0)) DESC, i.category`,
      [userId],
    ),
  ]);

  const todayDate = new Date(`${scoreSummary.today.date}T00:00:00Z`);
  todayDate.setUTCDate(todayDate.getUTCDate() - 29);
  const currentPeriodStart = todayDate.toISOString().slice(0, 10);
  const scoredDays = scoreSummary.history
    .filter((day) => day.tasksTotal > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  const currentScores = scoredDays.filter(
    (day) => day.date >= currentPeriodStart,
  );
  const previousScores = scoredDays.filter(
    (day) => day.date < currentPeriodStart,
  );
  const average = (values: number[]) =>
    values.length
      ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
      : null;
  const currentAverage = average(currentScores.map((day) => day.score));
  const previousAverage = average(previousScores.map((day) => day.score));
  const scoreChange =
    currentAverage !== null && previousAverage !== null
      ? currentAverage - previousAverage
      : null;
  const bestDay =
    currentScores.length > 0
      ? currentScores.reduce((best, day) =>
          day.score > best.score ? day : best,
        )
      : null;

  const categoryPerformance = categoriesResult.rows.map((row) => {
    const tasksTotal = toNumber(row.tasksTotal);
    const tasksCompleted = toNumber(row.tasksCompleted);
    const pointsPossible = toNumber(row.pointsPossible);
    return {
      category: row.category,
      tasksTotal,
      tasksCompleted,
      completionRate:
        tasksTotal === 0
          ? 0
          : Math.round((tasksCompleted / tasksTotal) * 100),
      pointsEarned: toNumber(row.pointsEarned),
      pointsPossible,
      score:
        pointsPossible === 0
          ? 0
          : Math.min(
              100,
              Math.round((toNumber(row.pointsEarned) / pointsPossible) * 100),
            ),
    };
  });

  const insights: string[] = [];
  if (currentAverage === null) {
    insights.push('Complete a task check-in to start building your score analysis.');
  } else {
    insights.push(`Your average daily score over ${currentScores.length} scored days is ${currentAverage}%.`);
    if (scoreChange !== null) {
      insights.push(
        scoreChange > 0
          ? `Your average score is up ${scoreChange} points from the previous period.`
          : scoreChange < 0
            ? `Your average score is down ${Math.abs(scoreChange)} points from the previous period.`
            : 'Your average score is unchanged from the previous period.',
      );
    } else {
      insights.push('Keep recording scores to unlock a comparison with the previous period.');
    }
  }

  const strongestCategory = [...categoryPerformance]
    .filter((category) => category.tasksTotal > 0)
    .sort((left, right) => right.score - left.score)[0];
  if (strongestCategory) {
    insights.push(
      `${strongestCategory.category} is your strongest category at ${strongestCategory.score}%.`,
    );
  }
  if (bestDay) {
    insights.push(`Your best scored day in this period was ${bestDay.date} at ${bestDay.score}%.`);
  }

  return {
    periodDays: 30,
    activeDays: currentScores.length,
    averageDailyScore: currentAverage,
    previousAverageDailyScore: previousAverage,
    scoreChange,
    bestDay,
    categoryPerformance,
    insights,
  };
};
