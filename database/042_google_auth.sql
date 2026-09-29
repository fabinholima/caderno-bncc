ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject text UNIQUE;
CREATE TABLE IF NOT EXISTS oauth_login_attempts (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
