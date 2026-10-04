import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const reviewSchema = z.object({
  mood: z.number().int().min(1).max(5).nullable(),
  energy: z.number().int().min(1).max(5).nullable(),
  wins: z.string().trim().max(2000),
  improvements: z.string().trim().max(2000),
  notes: z.string().trim().max(5000),
});

const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

reviewsRouter.get('/today', async (req, res) => {
  const result = await db.query(
    `SELECT review_date::text AS date, mood, energy, wins, improvements, notes,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM daily_reviews
     WHERE user_id = $1 AND review_date = CURRENT_DATE`,
    [req.user!.id],
  );
  return sendSuccess(res, result.rows[0] ?? null);
});

reviewsRouter.get('/history', async (req, res) => {
  const parsed = z.object({
    limit: z.coerce.number().int().min(1).max(90).default(30),
  }).safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Review history limit must be between 1 and 90.', 400);
  }
  const result = await db.query(
    `SELECT review_date::text AS date, mood, energy, wins, improvements, notes,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM daily_reviews
     WHERE user_id = $1
     ORDER BY review_date DESC
     LIMIT $2`,
    [req.user!.id, parsed.data.limit],
  );
  return sendSuccess(res, result.rows);
});

reviewsRouter.put('/today', async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Daily review data is invalid.',
      400,
    );
  }

  const result = await db.query(
    `INSERT INTO daily_reviews (user_id, review_date, mood, energy, wins, improvements, notes)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, review_date) DO UPDATE
     SET mood = EXCLUDED.mood,
         energy = EXCLUDED.energy,
         wins = EXCLUDED.wins,
         improvements = EXCLUDED.improvements,
         notes = EXCLUDED.notes,
         updated_at = NOW()
     RETURNING review_date::text AS date, mood, energy, wins, improvements, notes,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      req.user!.id,
      parsed.data.mood,
      parsed.data.energy,
      parsed.data.wins,
      parsed.data.improvements,
      parsed.data.notes,
    ],
  );
  return sendSuccess(res, result.rows[0]);
});

export default reviewsRouter;
