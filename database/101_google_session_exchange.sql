CREATE TABLE IF NOT EXISTS google_session_exchange_codes (
  code_hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_session_exchange_expiry_idx
  ON google_session_exchange_codes(expires_at);
