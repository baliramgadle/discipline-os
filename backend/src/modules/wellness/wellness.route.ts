import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const wellnessRouter = Router();
wellnessRouter.use(requireAuth);

const wellnessEntrySchema = z.object({
  kind: z.enum(['MEAL', 'WATER', 'WORKOUT', 'SLEEP', 'HABIT']),
  label: z.string().trim().min(1).max(160),
  quantity: z.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(30).default(''),
  notes: z.string().trim().max(2000).default(''),
  entryDate: z.iso.date().optional(),
});

wellnessRouter.get('/today', async (req, res) => {
  const result = await db.query(
    `SELECT id, kind, label, quantity, unit, notes,
            entry_date::text AS "entryDate", created_at AS "createdAt"
     FROM wellness_entries
     WHERE user_id = $1 AND is_active = TRUE AND entry_date = CURRENT_DATE
     ORDER BY created_at DESC`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows);
});

wellnessRouter.get('/summary', async (req, res) => {
  const result = await db.query(
    `SELECT kind, unit, COUNT(*)::int AS "entryCount",
            COALESCE(SUM(quantity), 0)::float8 AS "totalQuantity"
     FROM wellness_entries
     WHERE user_id = $1 AND is_active = TRUE AND entry_date >= CURRENT_DATE - INTERVAL '29 days'
     GROUP BY kind, unit
     ORDER BY kind, unit`,
    [req.user!.id],
  );
  const recent = await db.query(
    `SELECT entry_date::text AS date, COUNT(*)::int AS "entryCount"
     FROM wellness_entries
     WHERE user_id = $1 AND is_active = TRUE AND entry_date >= CURRENT_DATE - INTERVAL '6 days'
     GROUP BY entry_date
     ORDER BY entry_date DESC`,
    [req.user!.id],
  );
  return sendSuccess(res, { last30Days: result.rows, recentDays: recent.rows });
});

wellnessRouter.post('/', async (req, res) => {
  const parsed = wellnessEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Wellness entry data is invalid.',
      400,
    );
  }
  const result = await db.query(
    `INSERT INTO wellness_entries (user_id, kind, label, quantity, unit, notes, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE))
     RETURNING id, kind, label, quantity, unit, notes,
               entry_date::text AS "entryDate", created_at AS "createdAt"`,
    [
      req.user!.id,
      parsed.data.kind,
      parsed.data.label,
      parsed.data.quantity ?? null,
      parsed.data.unit,
      parsed.data.notes,
      parsed.data.entryDate ?? null,
    ],
  );
  return sendSuccess(res, result.rows[0], 201);
});

wellnessRouter.patch('/:entryId', async (req, res) => {
  const parsed = wellnessEntrySchema.partial().refine((value) => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Wellness entry data is invalid.', 400);
  }
  const result = await db.query(
    `UPDATE wellness_entries
     SET kind = COALESCE($3, kind),
         label = COALESCE($4, label),
         quantity = CASE WHEN $5::boolean THEN $6::numeric ELSE quantity END,
         unit = COALESCE($7, unit),
         notes = COALESCE($8, notes),
         entry_date = COALESCE($9::date, entry_date)
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id, kind, label, quantity, unit, notes,
               entry_date::text AS "entryDate", created_at AS "createdAt"`,
    [
      req.params.entryId,
      req.user!.id,
      parsed.data.kind ?? null,
      parsed.data.label ?? null,
      Object.hasOwn(parsed.data, 'quantity'),
      parsed.data.quantity ?? null,
      parsed.data.unit ?? null,
      parsed.data.notes ?? null,
      parsed.data.entryDate ?? null,
    ],
  );
  if (!result.rowCount) {
    return sendError(res, 'WELLNESS_ENTRY_NOT_FOUND', 'Wellness entry could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

wellnessRouter.delete('/:entryId', async (req, res) => {
  const parsed = z.object({ entryId: z.uuid() }).safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Wellness entry ID is invalid.', 400);
  }
  const result = await db.query(
    `UPDATE wellness_entries SET is_active = FALSE, archived_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id`,
    [parsed.data.entryId, req.user!.id],
  );
  if (!result.rowCount) {
    return sendError(res, 'WELLNESS_ENTRY_NOT_FOUND', 'Wellness entry could not be found.', 404);
  }
  return sendSuccess(res, { deleted: true });
});

export default wellnessRouter;
