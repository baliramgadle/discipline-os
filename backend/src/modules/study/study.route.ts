import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const studyRouter = Router();
studyRouter.use(requireAuth);

const studySessionSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(200).default(''),
  durationMinutes: z.number().int().min(1).max(1440),
  notes: z.string().trim().max(2000).default(''),
  projectId: z.uuid().nullable().optional(),
  sessionDate: z.iso.date().optional(),
});

studyRouter.get('/summary', async (req, res) => {
  const result = await db.query(
    `SELECT COALESCE(SUM(duration_minutes), 0)::int AS "totalMinutes",
            COUNT(*)::int AS "sessionCount",
            COUNT(DISTINCT session_date)::int AS "studyDays",
            COALESCE(SUM(duration_minutes) FILTER (
              WHERE session_date >= date_trunc('week', CURRENT_DATE)::date
            ), 0)::int AS "minutesThisWeek"
     FROM study_sessions
     WHERE user_id = $1 AND is_active = TRUE
       AND session_date >= CURRENT_DATE - INTERVAL '89 days'`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows[0]);
});

studyRouter.get('/sessions', async (req, res) => {
  const parsed = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Study session limit must be between 1 and 100.', 400);
  }
  const result = await db.query(
    `SELECT s.id, s.subject, s.topic, s.duration_minutes AS "durationMinutes",
            s.notes, s.session_date::text AS "sessionDate", s.project_id AS "projectId",
            p.name AS "projectName", s.created_at AS "createdAt"
     FROM study_sessions s
     LEFT JOIN projects p ON p.id = s.project_id AND p.user_id = s.user_id
     WHERE s.user_id = $1 AND s.is_active = TRUE
     ORDER BY s.session_date DESC, s.created_at DESC
     LIMIT $2`,
    [req.user!.id, parsed.data.limit],
  );
  return sendSuccess(res, result.rows);
});

studyRouter.post('/sessions', async (req, res) => {
  const parsed = studySessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Study session data is invalid.',
      400,
    );
  }
  if (parsed.data.projectId) {
    const project = await db.query(
      `SELECT 1 FROM projects
       WHERE id = $1 AND user_id = $2 AND status != 'ARCHIVED'`,
      [parsed.data.projectId, req.user!.id],
    );
    if (!project.rowCount) {
      return sendError(res, 'PROJECT_NOT_FOUND', 'The selected project could not be found.', 404);
    }
  }
  const result = await db.query(
    `INSERT INTO study_sessions
       (user_id, project_id, subject, topic, duration_minutes, notes, session_date)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE))
     RETURNING id, subject, topic, duration_minutes AS "durationMinutes",
               notes, session_date::text AS "sessionDate",
               project_id AS "projectId", created_at AS "createdAt"`,
    [
      req.user!.id,
      parsed.data.projectId ?? null,
      parsed.data.subject,
      parsed.data.topic,
      parsed.data.durationMinutes,
      parsed.data.notes,
      parsed.data.sessionDate ?? null,
    ],
  );
  return sendSuccess(res, result.rows[0], 201);
});

studyRouter.patch('/sessions/:sessionId', async (req, res) => {
  const parsed = studySessionSchema.partial().refine((value) => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Study session data is invalid.', 400);
  }
  if (parsed.data.projectId) {
    const project = await db.query(
      `SELECT 1 FROM projects
       WHERE id = $1 AND user_id = $2 AND status != 'ARCHIVED'`,
      [parsed.data.projectId, req.user!.id],
    );
    if (!project.rowCount) {
      return sendError(res, 'PROJECT_NOT_FOUND', 'The selected project could not be found.', 404);
    }
  }
  const result = await db.query(
    `UPDATE study_sessions
     SET subject = COALESCE($3, subject),
         topic = COALESCE($4, topic),
         duration_minutes = COALESCE($5, duration_minutes),
         notes = COALESCE($6, notes),
         project_id = CASE WHEN $7::boolean THEN $8::uuid ELSE project_id END,
         session_date = COALESCE($9::date, session_date)
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
       AND (NOT $7::boolean OR $8::uuid IS NULL
            OR EXISTS (SELECT 1 FROM projects WHERE id = $8 AND user_id = $2 AND status != 'ARCHIVED'))
     RETURNING id, subject, topic, duration_minutes AS "durationMinutes", notes,
               session_date::text AS "sessionDate", project_id AS "projectId"`,
    [
      req.params.sessionId,
      req.user!.id,
      parsed.data.subject ?? null,
      parsed.data.topic ?? null,
      parsed.data.durationMinutes ?? null,
      parsed.data.notes ?? null,
      Object.hasOwn(parsed.data, 'projectId'),
      parsed.data.projectId ?? null,
      parsed.data.sessionDate ?? null,
    ],
  );
  if (!result.rows[0]) {
    return sendError(res, 'STUDY_SESSION_NOT_FOUND', 'Study session could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

studyRouter.delete('/sessions/:sessionId', async (req, res) => {
  const result = await db.query(
    `UPDATE study_sessions SET is_active = FALSE, archived_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id`,
    [req.params.sessionId, req.user!.id],
  );
  if (!result.rowCount) {
    return sendError(res, 'STUDY_SESSION_NOT_FOUND', 'Study session could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

export default studyRouter;
