CREATE TABLE IF NOT EXISTS score_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric VARCHAR(20) NOT NULL CHECK (metric IN ('XP', 'ACTIVE_DAYS', 'STREAK')),
  period VARCHAR(12) NOT NULL CHECK (period IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  target_value INTEGER NOT NULL CHECK (target_value > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_targets_user_created
  ON score_targets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS achievement_definitions (
  key VARCHAR(40) PRIMARY KEY,
  metric VARCHAR(24) NOT NULL
    CHECK (metric IN ('TOTAL_XP', 'TOTAL_CHECKINS', 'BEST_STREAK', 'PROJECTS_COMPLETED')),
  threshold INTEGER NOT NULL CHECK (threshold > 0),
  title VARCHAR(100) NOT NULL,
  description VARCHAR(240) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key VARCHAR(40) NOT NULL REFERENCES achievement_definitions(key) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value_at_unlock INTEGER NOT NULL CHECK (value_at_unlock >= 0),
  PRIMARY KEY (user_id, achievement_key)
);

INSERT INTO achievement_definitions (key, metric, threshold, title, description) VALUES
  ('first_checkin', 'TOTAL_CHECKINS', 1, 'First step', 'Record your first task or routine check-in.'),
  ('ten_checkins', 'TOTAL_CHECKINS', 10, 'Building momentum', 'Record 10 task or routine check-ins.'),
  ('fifty_checkins', 'TOTAL_CHECKINS', 50, 'Steady practice', 'Record 50 task or routine check-ins.'),
  ('first_500_xp', 'TOTAL_XP', 500, 'Five hundred XP', 'Earn 500 XP from completed work.'),
  ('first_week_streak', 'BEST_STREAK', 7, 'A week of consistency', 'Complete activity on seven consecutive days.'),
  ('first_project_complete', 'PROJECTS_COMPLETED', 1, 'Project complete', 'Complete your first project.')
ON CONFLICT (key) DO NOTHING;
