CREATE TABLE IF NOT EXISTS mobile_google_login_attempts (
  id uuid PRIMARY KEY,
  ticket_hash text UNIQUE NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  state_hash text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  message text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS mobile_google_login_expiry_idx ON mobile_google_login_attempts(expires_at);
