import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().min(1).max(60),
  points: z.number().int().min(1).max(1000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.iso.date().nullable().optional(),
  scheduleWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  projectId: z.uuid().nullable().optional(),
});

const updateTaskSchema = createTaskSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one task field is required.' },
);

const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/board', async (req, res) => {
  const result = await db.query<{
    id: string;
    title: string;
    description: string | null;
    points: number;
    category: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate: string | null;
    scheduleWeekdays: number[] | null;
    tags: string[];
    projectId: string | null;
    projectName: string | null;
    completed: boolean;
  }>(
    `SELECT t.id, t.title, t.description, t.points, t.category,
            t.priority, t.due_date::text AS "dueDate",
            t.schedule_weekdays AS "scheduleWeekdays", t.tags,
            t.project_id AS "projectId", p.name AS "projectName",
            (c.id IS NOT NULL) AS completed
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id
     LEFT JOIN task_check_ins c
       ON c.task_id = t.id
      AND c.user_id = t.user_id
      AND c.check_in_date = CURRENT_DATE
     WHERE t.user_id = $1 AND t.is_active = TRUE
       AND (t.schedule_weekdays IS NULL
            OR EXTRACT(DOW FROM CURRENT_DATE)::smallint = ANY(t.schedule_weekdays))
     ORDER BY CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
              t.due_date ASC NULLS LAST, t.created_at`,
    [req.user!.id],
  );

  return sendSuccess(res, result.rows);
});

tasksRouter.post('/', async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Task data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `INSERT INTO tasks
       (user_id, title, description, category, points, priority, due_date,
        schedule_weekdays, tags, project_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, p.id
     FROM (SELECT 1) seed
     LEFT JOIN projects p ON p.id = $10 AND p.user_id = $1 AND p.status = 'ACTIVE'
     WHERE $10::uuid IS NULL OR p.id IS NOT NULL
     RETURNING id, title, description, category, points, priority, due_date::text AS "dueDate",
               schedule_weekdays AS "scheduleWeekdays", tags, project_id AS "projectId",
               (SELECT name FROM projects WHERE id = tasks.project_id AND user_id = tasks.user_id) AS "projectName"`,
    [
      req.user!.id,
      parsed.data.title,
      parsed.data.description ?? null,
      parsed.data.category,
      parsed.data.points,
      parsed.data.priority ?? 'MEDIUM',
      parsed.data.dueDate ?? null,
      parsed.data.scheduleWeekdays
        ? [...new Set(parsed.data.scheduleWeekdays)].sort((a, b) => a - b)
        : null,
      [...new Set((parsed.data.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
      parsed.data.projectId ?? null,
    ],
  );

  if (!result.rows[0]) {
    return sendError(res, 'PROJECT_NOT_FOUND', 'The selected project is not active or could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0], 201);
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Task data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `UPDATE tasks
     SET title = COALESCE($3, title),
         description = COALESCE($4, description),
         category = COALESCE($5, category),
         points = COALESCE($6, points),
         priority = COALESCE($7, priority),
         due_date = CASE WHEN $8::boolean THEN $9::date ELSE due_date END,
         schedule_weekdays = CASE WHEN $10::boolean THEN $11::smallint[] ELSE schedule_weekdays END,
         tags = COALESCE($12, tags),
         project_id = CASE WHEN $13::boolean THEN $14::uuid ELSE project_id END,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
       AND (
         NOT $13::boolean OR $14::uuid IS NULL
         OR EXISTS (SELECT 1 FROM projects p WHERE p.id = $14 AND p.user_id = $2 AND p.status = 'ACTIVE')
       )
     RETURNING id, title, description, category, points, priority, due_date::text AS "dueDate",
               schedule_weekdays AS "scheduleWeekdays", tags, project_id AS "projectId",
               (SELECT name FROM projects WHERE id = tasks.project_id AND user_id = tasks.user_id) AS "projectName"`,
    [
      req.params.taskId,
      req.user!.id,
      parsed.data.title ?? null,
      parsed.data.description ?? null,
      parsed.data.category ?? null,
      parsed.data.points ?? null,
      parsed.data.priority ?? null,
      Object.hasOwn(parsed.data, 'dueDate'),
      parsed.data.dueDate ?? null,
      Object.hasOwn(parsed.data, 'scheduleWeekdays'),
      parsed.data.scheduleWeekdays
        ? [...new Set(parsed.data.scheduleWeekdays)].sort((a, b) => a - b)
        : null,
      parsed.data.tags
        ? [...new Set(parsed.data.tags.map((tag) => tag.trim()).filter(Boolean))]
        : null,
      Object.hasOwn(parsed.data, 'projectId'),
      parsed.data.projectId ?? null,
    ],
  );

  if (!result.rows[0]) {
    if (Object.hasOwn(parsed.data, 'projectId') && parsed.data.projectId !== null) {
      const project = await db.query(
        `SELECT 1 FROM projects WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
        [parsed.data.projectId, req.user!.id],
      );
      if (!project.rowCount) {
        return sendError(res, 'PROJECT_NOT_FOUND', 'The selected project is not active or could not be found.', 404);
      }
    }
    return sendError(res, 'TASK_NOT_FOUND', 'Task could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

tasksRouter.delete('/:taskId', async (req, res) => {
  const result = await db.query(
    `UPDATE tasks
     SET is_active = FALSE, archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id`,
    [req.params.taskId, req.user!.id],
  );

  if (!result.rows[0]) {
    return sendError(res, 'TASK_NOT_FOUND', 'Task could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

tasksRouter.post('/:taskId/check-in', async (req, res) => {
  const result = await db.query(
    `INSERT INTO task_check_ins (task_id, user_id, check_in_date, points_awarded)
     SELECT t.id, t.user_id, CURRENT_DATE, t.points
     FROM tasks t
     WHERE t.id = $1 AND t.user_id = $2 AND t.is_active = TRUE
       AND (t.schedule_weekdays IS NULL
            OR EXTRACT(DOW FROM CURRENT_DATE)::smallint = ANY(t.schedule_weekdays))
     ON CONFLICT (task_id, check_in_date) DO NOTHING
     RETURNING task_id AS "taskId", check_in_date AS date,
               points_awarded AS "xpAwarded"`,
    [req.params.taskId, req.user!.id],
  );

  if (result.rows[0]) {
    return sendSuccess(res, result.rows[0], 201);
  }

  const taskResult = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     ) AS exists`,
    [req.params.taskId, req.user!.id],
  );

  if (!taskResult.rows[0]?.exists) {
    return sendError(res, 'TASK_NOT_FOUND', 'Task could not be found.', 404);
  }

  return sendError(
    res,
    'DUPLICATE_CHECKIN',
    'This task is already checked in for today.',
    409,
  );
});

export default tasksRouter;
