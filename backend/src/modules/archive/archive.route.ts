import { Router } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const archiveRouter = Router();
archiveRouter.use(requireAuth);

archiveRouter.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT kind, id, title, detail, archived_at AS "archivedAt"
     FROM (
       SELECT 'task'::text AS kind, id, title, category AS detail, archived_at
       FROM tasks WHERE user_id = $1 AND is_active = FALSE
       UNION ALL
       SELECT 'routine', id, title, category, archived_at
       FROM routines WHERE user_id = $1 AND is_active = FALSE
       UNION ALL
       SELECT 'project', id, name, description, archived_at
       FROM projects WHERE user_id = $1 AND status = 'ARCHIVED'
       UNION ALL
       SELECT 'goal', id, name, COALESCE(target_description, ''), archived_at
       FROM goals WHERE user_id = $1 AND status = 'ARCHIVED'
       UNION ALL
       SELECT 'financial-account', id, name, kind, archived_at
       FROM financial_accounts WHERE user_id = $1 AND is_active = FALSE
       UNION ALL
       SELECT 'financial-goal', id, name, currency, archived_at
       FROM financial_goals WHERE user_id = $1 AND is_active = FALSE
       UNION ALL
       SELECT 'budget', id, category, currency, archived_at
       FROM financial_budgets WHERE user_id = $1 AND is_active = FALSE
       UNION ALL
       SELECT 'study-session', id, subject, topic, archived_at
       FROM study_sessions WHERE user_id = $1 AND is_active = FALSE
       UNION ALL
       SELECT 'wellness-entry', id, label, kind, archived_at
       FROM wellness_entries WHERE user_id = $1 AND is_active = FALSE
     ) archived
     ORDER BY archived_at DESC NULLS LAST, title`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows);
});

archiveRouter.post('/:kind/:id/restore', async (req, res) => {
  const parsed = z.object({
    kind: z.enum(['task', 'routine', 'project', 'goal', 'financial-account', 'financial-goal', 'budget', 'study-session', 'wellness-entry']),
    id: z.uuid(),
  }).safeParse(req.params);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Archived item could not be identified.', 400);
  }

  const updates: Record<typeof parsed.data.kind, string> = {
    task: `UPDATE tasks SET is_active = TRUE, archived_at = NULL, updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
    routine: `UPDATE routines SET is_active = TRUE, archived_at = NULL, updated_at = NOW()
              WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
    project: `UPDATE projects SET status = 'ACTIVE', archived_at = NULL, updated_at = NOW()
              WHERE id = $1 AND user_id = $2 AND status = 'ARCHIVED'`,
    goal: `UPDATE goals SET status = 'ACTIVE', archived_at = NULL, updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND status = 'ARCHIVED'`,
    'financial-account': `UPDATE financial_accounts SET is_active = TRUE, archived_at = NULL, updated_at = NOW()
                          WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
    'financial-goal': `UPDATE financial_goals SET is_active = TRUE, archived_at = NULL, updated_at = NOW()
                       WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
    budget: `UPDATE financial_budgets SET is_active = TRUE, archived_at = NULL, updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
    'study-session': `UPDATE study_sessions SET is_active = TRUE, archived_at = NULL
                      WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
    'wellness-entry': `UPDATE wellness_entries SET is_active = TRUE, archived_at = NULL
                       WHERE id = $1 AND user_id = $2 AND is_active = FALSE`,
  };

  const result = await db.query(updates[parsed.data.kind], [parsed.data.id, req.user!.id]);
  if (!result.rowCount) {
    return sendError(res, 'ARCHIVED_ITEM_NOT_FOUND', 'Archived item could not be found.', 404);
  }
  return sendSuccess(res, { restored: true });
});

export default archiveRouter;
