import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
  dueDate: z.iso.date().nullable().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dueDate: z.iso.date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one project field is required.',
});

const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT id, name, description, status, progress,
            due_date::text AS "dueDate", created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM projects
     WHERE user_id = $1 AND status != 'ARCHIVED'
     ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
              due_date NULLS LAST, created_at DESC`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows);
});

projectsRouter.post('/', async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Project data is invalid.', 400);
  }
  const result = await db.query(
    `INSERT INTO projects (user_id, name, description, due_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, description, status, progress,
               due_date::text AS "dueDate", created_at AS "createdAt"`,
    [
      req.user!.id,
      parsed.data.name,
      parsed.data.description ?? '',
      parsed.data.dueDate ?? null,
    ],
  );
  return sendSuccess(res, result.rows[0], 201);
});

projectsRouter.patch('/:projectId', async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Project data is invalid.', 400);
  }
  const result = await db.query(
    `UPDATE projects
     SET name = COALESCE($3, name),
         description = COALESCE($4, description),
         status = CASE
           WHEN $5 = 'COMPLETED' OR COALESCE($6, progress) = 100 THEN 'COMPLETED'
           WHEN $5 = 'ACTIVE' OR $6 IS NOT NULL THEN 'ACTIVE'
           ELSE status
         END,
         progress = CASE WHEN $5 = 'COMPLETED' THEN 100
                         ELSE COALESCE($6, progress) END,
         due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'ARCHIVED'
     RETURNING id, name, description, status, progress, due_date::text AS "dueDate"`,
    [
      req.params.projectId,
      req.user!.id,
      parsed.data.name ?? null,
      parsed.data.description ?? null,
      parsed.data.status ?? null,
      parsed.data.progress ?? null,
      parsed.data.dueDate !== undefined,
      parsed.data.dueDate ?? null,
    ],
  );
  if (!result.rows[0]) {
    return sendError(res, 'PROJECT_NOT_FOUND', 'Project could not be found.', 404);
  }
  if (result.rows[0].status === 'COMPLETED') {
    await db.query(
      `INSERT INTO notifications (user_id, kind, title, body, resource_type, resource_id, dedupe_key)
       SELECT $1, 'PROJECT_COMPLETED', 'Project completed', $2, 'PROJECT', $3::uuid,
              'project-completed:' || $3::uuid::text
       WHERE COALESCE((SELECT in_app_enabled FROM notification_preferences WHERE user_id = $1), TRUE)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [req.user!.id, `You completed ${result.rows[0].name}.`, result.rows[0].id],
    );
  }
  return sendSuccess(res, result.rows[0]);
});

projectsRouter.delete('/:projectId', async (req, res) => {
  const result = await db.query(
    `UPDATE projects
     SET status = 'ARCHIVED', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'ARCHIVED'
     RETURNING id`,
    [req.params.projectId, req.user!.id],
  );
  if (!result.rows[0]) {
    return sendError(res, 'PROJECT_NOT_FOUND', 'Project could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

export default projectsRouter;
