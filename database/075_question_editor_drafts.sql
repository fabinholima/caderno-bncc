CREATE TABLE IF NOT EXISTS question_editor_drafts (
  id uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS question_editor_drafts_owner_idx ON question_editor_drafts(institution_id,user_id,updated_at DESC) WHERE completed_at IS NULL;
