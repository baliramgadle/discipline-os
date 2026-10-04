ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE financial_goals
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE financial_budgets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE projects SET archived_at = updated_at WHERE status = 'ARCHIVED' AND archived_at IS NULL;
UPDATE financial_accounts SET archived_at = updated_at WHERE is_active = FALSE AND archived_at IS NULL;
UPDATE financial_goals SET archived_at = updated_at WHERE is_active = FALSE AND archived_at IS NULL;
UPDATE financial_budgets SET archived_at = updated_at WHERE is_active = FALSE AND archived_at IS NULL;
UPDATE goals SET archived_at = updated_at WHERE status = 'ARCHIVED' AND archived_at IS NULL;
