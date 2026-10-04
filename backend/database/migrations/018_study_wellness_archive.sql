ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE wellness_entries
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_active
  ON study_sessions(user_id, is_active, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_wellness_entries_user_active
  ON wellness_entries(user_id, is_active, entry_date DESC);
