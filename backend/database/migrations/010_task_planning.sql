ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority VARCHAR(8) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_tasks_user_due_date
  ON tasks(user_id, due_date) WHERE is_active = TRUE;
