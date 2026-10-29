ALTER TABLE oauth_login_attempts
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'login'
    CHECK (purpose IN ('login', 'link'));

ALTER TABLE oauth_login_attempts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS oauth_login_attempts_user_id_idx
  ON oauth_login_attempts(user_id) WHERE user_id IS NOT NULL;
