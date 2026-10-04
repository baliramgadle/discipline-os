import { db } from '../../lib/db.js';

export type DailyScore = {
  date: string;
  score: number;
  tasksCompleted: number;
  tasksTotal: number;
  pointsEarned: number;
  pointsPossible: number;
};

export type ScoreSummary = {
  today: DailyScore;
  currentStreakDays: number;
  bestStreakDays: number;
  history: DailyScore[];
};

const asInteger = (value: string | number | undefined) =>
  Number(value ?? 0);

const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
};

export const scoreStreaks = (dates: string[], today: string) => {
  const daySet = new Set(dates);
  const mostRecent = daySet.has(today)
    ? today
    : new Date(Date.UTC(
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7)) - 1,
        Number(today.slice(8, 10)) - 1,
      ))
        .toISOString()
        .slice(0, 10);

  let currentStreakDays = 0;
  let bestStreakDays = 0;
  let runningStreak = 0;
  let previousDay: number | undefined;

  for (const date of dates) {
    const currentDay = dayNumber(date);
    runningStreak =
      previousDay !== undefined && previousDay - currentDay === 1
        ? runningStreak + 1
        : 1;
    bestStreakDays = Math.max(bestStreakDays, runningStreak);
    previousDay = currentDay;
  }

  if (daySet.has(mostRecent)) {
    let date = mostRecent;
    while (daySet.has(date)) {
      currentStreakDays += 1;
      const previousDate = new Date(dayNumber(date) * 86_400_000 - 86_400_000);
      date = previousDate.toISOString().slice(0, 10);
    }
  }

  return { currentStreakDays, bestStreakDays };
};

export const getScoreSummary = async (
  userId: string,
  historyDays: number,
): Promise<ScoreSummary> => {
  const [historyResult, activityResult, dateResult] = await Promise.all([
    db.query<{
      date: string;
      tasksTotal: string;
      tasksCompleted: string;
      pointsPossible: string;
      pointsEarned: string;
    }>(
      `WITH score_days AS (
         SELECT day::date AS score_date
         FROM GENERATE_SERIES(
           CURRENT_DATE - ($2::integer - 1),
           CURRENT_DATE,
           INTERVAL '1 day'
         ) AS day
       ),
       scheduled_items AS (
         SELECT d.score_date, 'task'::text AS kind, t.id, t.points
         FROM score_days d
         JOIN tasks t
           ON t.user_id = $1
          AND t.created_at < d.score_date + INTERVAL '1 day'
          AND (t.archived_at IS NULL OR t.archived_at > d.score_date)
          AND (t.schedule_weekdays IS NULL
               OR EXTRACT(DOW FROM d.score_date)::smallint = ANY(t.schedule_weekdays))
         UNION ALL
         SELECT d.score_date, 'routine'::text AS kind, r.id, r.points
         FROM score_days d
         JOIN routines r
           ON r.user_id = $1
          AND r.created_at < d.score_date + INTERVAL '1 day'
          AND (r.archived_at IS NULL OR r.archived_at > d.score_date)
          AND EXTRACT(DOW FROM d.score_date)::smallint = ANY(r.weekdays)
       ),
       activity_checks AS (
         SELECT 'task'::text AS kind, task_id AS item_id,
                check_in_date, points_awarded
         FROM task_check_ins
         WHERE user_id = $1
           AND check_in_date >= CURRENT_DATE - ($2::integer - 1)
         UNION ALL
         SELECT 'routine'::text AS kind, routine_id AS item_id,
                check_in_date, points_awarded
         FROM routine_check_ins
         WHERE user_id = $1
           AND check_in_date >= CURRENT_DATE - ($2::integer - 1)
       )
       SELECT d.score_date::text AS date,
              COUNT(i.id)::text AS "tasksTotal",
              COUNT(c.item_id)::text AS "tasksCompleted",
              COALESCE(SUM(i.points), 0)::text AS "pointsPossible",
              COALESCE(SUM(c.points_awarded), 0)::text AS "pointsEarned"
       FROM score_days d
       LEFT JOIN scheduled_items i ON i.score_date = d.score_date
       LEFT JOIN activity_checks c
         ON c.kind = i.kind
        AND c.item_id = i.id
        AND c.check_in_date = d.score_date
       GROUP BY d.score_date
       ORDER BY d.score_date DESC`,
      [userId, historyDays],
    ),
    db.query<{ date: string }>(
      `SELECT DISTINCT activity_date::text AS date
       FROM (
         SELECT check_in_date AS activity_date
         FROM task_check_ins
         WHERE user_id = $1
         UNION
         SELECT check_in_date AS activity_date
         FROM routine_check_ins
         WHERE user_id = $1
       ) activity
       ORDER BY date DESC`,
      [userId],
    ),
    db.query<{ today: string }>(
      'SELECT CURRENT_DATE::text AS today',
    ),
  ]);

  const history = historyResult.rows.map((row): DailyScore => {
    const tasksTotal = asInteger(row.tasksTotal);
    const tasksCompleted = asInteger(row.tasksCompleted);
    const pointsPossible = asInteger(row.pointsPossible);
    const pointsEarned = asInteger(row.pointsEarned);
    return {
      date: row.date,
      score:
        pointsPossible === 0
          ? 0
          : Math.min(100, Math.round((pointsEarned / pointsPossible) * 100)),
      tasksCompleted,
      tasksTotal,
      pointsEarned,
      pointsPossible,
    };
  });

  const today = dateResult.rows[0]?.today;
  if (!today) {
    throw new Error('Database did not return the current date.');
  }
  const todayScore = history.find((entry) => entry.date === today);
  if (!todayScore) {
    throw new Error('Database did not return today’s score.');
  }

  const streaks = scoreStreaks(
    activityResult.rows.map((row) => row.date),
    today,
  );

  return {
    today: todayScore,
    ...streaks,
    history,
  };
};
