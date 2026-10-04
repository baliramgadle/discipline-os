CREATE TABLE IF NOT EXISTS routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(60) NOT NULL,
  points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 1000),
  weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    cardinality(weekdays) BETWEEN 1 AND 7
    AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS routine_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT routine_check_ins_owner_fk
    FOREIGN KEY (routine_id, user_id) REFERENCES routines(id, user_id) ON DELETE CASCADE,
  CONSTRAINT routine_check_ins_once_per_day UNIQUE (routine_id, check_in_date)
);

CREATE TABLE IF NOT EXISTS daily_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mood SMALLINT CHECK (mood BETWEEN 1 AND 5),
  energy SMALLINT CHECK (energy BETWEEN 1 AND 5),
  wins TEXT NOT NULL DEFAULT '',
  improvements TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, review_date)
);

CREATE INDEX IF NOT EXISTS idx_routines_user_active ON routines(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_routine_check_ins_user_date
  ON routine_check_ins(user_id, check_in_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reviews_user_date
  ON daily_reviews(user_id, review_date DESC);
