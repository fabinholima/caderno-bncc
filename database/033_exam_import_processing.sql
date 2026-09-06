BEGIN;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS concurrent_imports integer NOT NULL DEFAULT 1
    CHECK (concurrent_imports > 0);

UPDATE subscription_plans SET concurrent_imports =
  CASE WHEN id = 'school' THEN 3 ELSE 1 END;

ALTER TABLE exam_import_documents
  ALTER COLUMN file_data DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'database'
    CHECK (storage_provider IN ('database','filesystem','object_storage')),
  ADD COLUMN IF NOT EXISTS storage_key text;

CREATE TABLE IF NOT EXISTS exam_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  exam_import_id uuid NOT NULL REFERENCES exam_imports(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'extract'
    CHECK (job_type IN ('extract','ai_analysis')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts integer NOT NULL DEFAULT 0,
  cancellation_requested boolean NOT NULL DEFAULT false,
  provider text,
  model text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_import_jobs_active_idx
  ON exam_import_jobs (exam_import_id, job_type)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS exam_import_jobs_claim_idx
  ON exam_import_jobs (status, created_at);

COMMIT;
