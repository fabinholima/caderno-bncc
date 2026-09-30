ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_ip inet;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS user_sessions_last_ip_idx ON user_sessions(last_ip);
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS refund_cents integer NOT NULL DEFAULT 0 CHECK(refund_cents >= 0);
CREATE TABLE IF NOT EXISTS billing_refund_events (
  id bigserial PRIMARY KEY,
  payment_id text NOT NULL REFERENCES billing_payments(provider_id),
  cumulative_cents integer NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents > 0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id,cumulative_cents)
);
