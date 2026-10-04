ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE tasks
SET archived_at = updated_at
WHERE is_active = FALSE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_check_ins_user_date_task
  ON task_check_ins(user_id, check_in_date DESC, task_id);
