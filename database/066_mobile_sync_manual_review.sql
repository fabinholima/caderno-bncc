ALTER TABLE assessment_submissions
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE card_scans ADD COLUMN IF NOT EXISTS upload_sha256 text;
CREATE TABLE IF NOT EXISTS mobile_mutations (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  kind text NOT NULL,
  entity_id uuid NOT NULL,
  payload_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, user_id, request_id)
);
COMMENT ON TABLE mobile_mutations IS 'Receipts for durable mobile corrections; replaying a request returns its original result.';
