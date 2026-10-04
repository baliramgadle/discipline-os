import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { db } from '../../lib/db.js';

const currencySchema = z
  .string()
  .trim()
  .transform((currency) => currency.toUpperCase())
  .refine((currency) => {
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Currency must be a valid ISO 4217 currency code.');

const accountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['ASSET', 'LIABILITY']),
  currency: currencySchema.default('USD'),
  openingBalance: z.number().finite().min(0).default(0),
});

const entrySchema = z.object({
  description: z.string().trim().min(1).max(240),
  amount: z.number().finite().positive(),
  direction: z.enum(['INCREASE', 'DECREASE']),
  entryDate: z.iso.date().optional(),
});

const financeRouter = Router();
financeRouter.use(requireAuth);

financeRouter.get('/planning', async (req, res) => {
  const [goals, budgets] = await Promise.all([
    db.query(
      `SELECT g.id, g.name, g.currency, g.target_amount::float8 AS "targetAmount",
              g.current_amount::float8 AS "currentAmount", g.target_date::text AS "targetDate"
       FROM financial_goals g WHERE g.user_id = $1 AND g.is_active = TRUE
       ORDER BY g.target_date NULLS LAST, g.created_at`,
      [req.user!.id],
    ),
    db.query(
      `SELECT b.id, b.category, b.currency, b.monthly_limit::float8 AS "monthlyLimit",
              COALESCE(SUM(e.amount) FILTER (
                WHERE e.direction = 'DECREASE'
                  AND e.entry_date >= DATE_TRUNC('month', CURRENT_DATE)::date
              ), 0)::float8 AS "spentThisMonth"
       FROM financial_budgets b
       LEFT JOIN financial_accounts a
         ON a.user_id = b.user_id AND a.currency = b.currency
       LEFT JOIN financial_entries e
         ON e.account_id = a.id AND e.user_id = b.user_id
        AND LOWER(e.description) LIKE '%' || LOWER(b.category) || '%'
       WHERE b.user_id = $1 AND b.is_active = TRUE
       GROUP BY b.id
       ORDER BY b.category`,
      [req.user!.id],
    ),
  ]);
  return sendSuccess(res, { goals: goals.rows, budgets: budgets.rows });
});

financeRouter.post('/goals', async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    currency: currencySchema.default('USD'),
    targetAmount: z.number().finite().positive(),
    currentAmount: z.number().finite().min(0).default(0),
    targetDate: z.iso.date().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Financial goal data is invalid.', 400);
  }
  const result = await db.query(
    `INSERT INTO financial_goals (user_id, name, currency, target_amount, current_amount, target_date)
     VALUES ($1, $2, $3, $4, $5, $6::date)
     RETURNING id, name, currency, target_amount::float8 AS "targetAmount",
               current_amount::float8 AS "currentAmount", target_date::text AS "targetDate"`,
    [req.user!.id, parsed.data.name, parsed.data.currency, parsed.data.targetAmount,
      parsed.data.currentAmount, parsed.data.targetDate ?? null],
  );
  return sendSuccess(res, result.rows[0], 201);
});

financeRouter.patch('/goals/:goalId', async (req, res) => {
  const parsed = z.object({
    currentAmount: z.number().finite().min(0),
  }).strict().safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Current amount must be zero or greater.', 400);
  }
  const result = await db.query(
    `UPDATE financial_goals SET current_amount = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id, name, currency, target_amount::float8 AS "targetAmount",
               current_amount::float8 AS "currentAmount", target_date::text AS "targetDate"`,
    [req.params.goalId, req.user!.id, parsed.data.currentAmount],
  );
  if (!result.rows[0]) {
    return sendError(res, 'FINANCIAL_GOAL_NOT_FOUND', 'Financial goal could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

financeRouter.delete('/goals/:goalId', async (req, res) => {
  const result = await db.query(
    `UPDATE financial_goals SET is_active = FALSE, archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE RETURNING id`,
    [req.params.goalId, req.user!.id],
  );
  if (!result.rowCount) {
    return sendError(res, 'FINANCIAL_GOAL_NOT_FOUND', 'Financial goal could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

financeRouter.post('/budgets', async (req, res) => {
  const parsed = z.object({
    category: z.string().trim().min(1).max(80),
    currency: currencySchema.default('USD'),
    monthlyLimit: z.number().finite().positive(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Budget data is invalid.', 400);
  }
  const result = await db.query(
    `INSERT INTO financial_budgets (user_id, category, currency, monthly_limit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, category, currency) DO UPDATE
     SET monthly_limit = EXCLUDED.monthly_limit, is_active = TRUE, updated_at = NOW()
     RETURNING id, category, currency, monthly_limit::float8 AS "monthlyLimit", 0::float8 AS "spentThisMonth"`,
    [req.user!.id, parsed.data.category, parsed.data.currency, parsed.data.monthlyLimit],
  );
  return sendSuccess(res, result.rows[0], 201);
});

financeRouter.delete('/budgets/:budgetId', async (req, res) => {
  const result = await db.query(
    `UPDATE financial_budgets SET is_active = FALSE, archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE RETURNING id`,
    [req.params.budgetId, req.user!.id],
  );
  if (!result.rowCount) {
    return sendError(res, 'BUDGET_NOT_FOUND', 'Budget could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

financeRouter.get('/summary', async (req, res) => {
  const result = await db.query<{
    id: string;
    name: string;
    kind: 'ASSET' | 'LIABILITY';
    currency: string;
    openingBalance: string;
    entryBalance: string;
    monthlyNetChange: string;
    entries: Array<{
      id: string;
      description: string;
      amount: string;
      direction: 'INCREASE' | 'DECREASE';
      entryDate: string;
    }>;
  }>(
    `SELECT a.id, a.name, a.kind, a.currency,
            a.opening_balance::text AS "openingBalance",
            totals.balance::text AS "entryBalance",
            totals.monthly_change::text AS "monthlyNetChange",
            recent.entries
     FROM financial_accounts a
     CROSS JOIN LATERAL (
       SELECT COALESCE(SUM(
                CASE WHEN e.direction = 'INCREASE' THEN e.amount ELSE -e.amount END
              ), 0) AS balance,
              COALESCE(SUM(
                CASE WHEN e.entry_date >= DATE_TRUNC('month', CURRENT_DATE)::date
                     THEN CASE WHEN e.direction = 'INCREASE' THEN e.amount ELSE -e.amount END
                     ELSE 0 END
              ), 0) AS monthly_change
       FROM financial_entries e
       WHERE e.account_id = a.id AND e.user_id = a.user_id
     ) totals
     CROSS JOIN LATERAL (
       SELECT COALESCE(
         json_agg(
           json_build_object(
             'id', recent.id,
             'description', recent.description,
             'amount', recent.amount::text,
             'direction', recent.direction,
             'entryDate', recent.entry_date
           ) ORDER BY recent.entry_date DESC, recent.created_at DESC
         ),
         '[]'::json
       ) AS entries
       FROM (
         SELECT id, description, amount, direction, entry_date, created_at
         FROM financial_entries
         WHERE account_id = a.id AND user_id = a.user_id
         ORDER BY entry_date DESC, created_at DESC
         LIMIT 5
       ) recent
     ) recent
     WHERE a.user_id = $1 AND a.is_active = TRUE
     ORDER BY a.created_at`,
    [req.user!.id],
  );

  const accounts = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    balance: Number(row.openingBalance) + Number(row.entryBalance),
    monthlyNetChange:
      (row.kind === 'ASSET' ? 1 : -1) * Number(row.monthlyNetChange),
    entries: row.entries,
  }));
  const currencies = [...new Set(accounts.map((account) => account.currency))];
  const totals = currencies.map((currency) => {
    const inCurrency = accounts.filter((account) => account.currency === currency);
    const assets = inCurrency
      .filter((account) => account.kind === 'ASSET')
      .reduce((sum, account) => sum + account.balance, 0);
    const liabilities = inCurrency
      .filter((account) => account.kind === 'LIABILITY')
      .reduce((sum, account) => sum + account.balance, 0);
    const monthlyNetChange = inCurrency.reduce(
      (sum, account) => sum + account.monthlyNetChange,
      0,
    );
    return {
      currency,
      assets: Number(assets.toFixed(2)),
      liabilities: Number(liabilities.toFixed(2)),
      netWorth: Number((assets - liabilities).toFixed(2)),
      monthlyNetChange: Number(monthlyNetChange.toFixed(2)),
    };
  });
  return sendSuccess(res, { totals, accounts });
});

financeRouter.post('/accounts', async (req, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Account data is invalid.', 400);
  }
  const result = await db.query(
    `INSERT INTO financial_accounts (user_id, name, kind, currency, opening_balance)
     VALUES ($1, $2, $3, UPPER($4), $5)
     RETURNING id, name, kind, currency, opening_balance AS "openingBalance"`,
    [
      req.user!.id,
      parsed.data.name,
      parsed.data.kind,
      parsed.data.currency,
      parsed.data.openingBalance,
    ],
  );
  return sendSuccess(res, result.rows[0], 201);
});

financeRouter.get('/accounts/:accountId/entries', async (req, res) => {
  const result = await db.query(
    `SELECT id, description, amount::text AS amount, direction,
            entry_date AS "entryDate", created_at AS "createdAt"
     FROM financial_entries
     WHERE account_id = $1 AND user_id = $2
     ORDER BY entry_date DESC, created_at DESC
     LIMIT 100`,
    [req.params.accountId, req.user!.id],
  );
  return sendSuccess(res, result.rows);
});

financeRouter.post('/accounts/:accountId/entries', async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Financial entry is invalid.', 400);
  }
  const result = await db.query(
    `INSERT INTO financial_entries
       (account_id, user_id, description, amount, direction, entry_date)
     SELECT id, user_id, $3, $4, $5, COALESCE($6::date, CURRENT_DATE)
     FROM financial_accounts
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id, account_id AS "accountId", description,
               amount::text AS amount, direction, entry_date AS "entryDate"`,
    [
      req.params.accountId,
      req.user!.id,
      parsed.data.description,
      parsed.data.amount,
      parsed.data.direction,
      parsed.data.entryDate ?? null,
    ],
  );
  if (!result.rows[0]) {
    return sendError(res, 'ACCOUNT_NOT_FOUND', 'Financial account could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0], 201);
});

financeRouter.delete('/accounts/:accountId', async (req, res) => {
  const result = await db.query(
    `UPDATE financial_accounts SET is_active = FALSE, archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING id`,
    [req.params.accountId, req.user!.id],
  );
  if (!result.rows[0]) {
    return sendError(res, 'ACCOUNT_NOT_FOUND', 'Financial account could not be found.', 404);
  }
  return sendSuccess(res, { archived: true });
});

export default financeRouter;
