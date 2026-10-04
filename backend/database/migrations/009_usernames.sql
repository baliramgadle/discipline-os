ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username VARCHAR(50);

UPDATE users
SET username = 'member_' || REPLACE(id::text, '-', '')
WHERE username IS NULL;

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users(LOWER(username));

ALTER TABLE users
  ADD CONSTRAINT users_username_format
  CHECK (username ~ '^[a-zA-Z0-9_]{3,50}$');
