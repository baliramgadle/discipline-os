CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID,
  subject VARCHAR(120) NOT NULL,
  topic VARCHAR(200) NOT NULL DEFAULT '',
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  notes TEXT NOT NULL DEFAULT '',
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT study_sessions_project_owner_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_date
  ON study_sessions(user_id, session_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_project
  ON study_sessions(project_id, session_date DESC);

CREATE TABLE IF NOT EXISTS wellness_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL
    CHECK (kind IN ('MEAL', 'WATER', 'WORKOUT', 'SLEEP', 'HABIT')),
  label VARCHAR(160) NOT NULL,
  quantity NUMERIC(10, 2),
  unit VARCHAR(30) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity IS NULL OR quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wellness_entries_user_date
  ON wellness_entries(user_id, entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_entries_user_kind_date
  ON wellness_entries(user_id, kind, entry_date DESC);
