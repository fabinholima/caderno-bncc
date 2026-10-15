-- Independent of job retention: one admitted exam per local calendar day.
CREATE TABLE IF NOT EXISTS exam_ai_daily_admissions (
  usage_day date NOT NULL,
  exam_import_id uuid NOT NULL REFERENCES exam_imports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_day, exam_import_id)
);
ALTER TABLE exam_import_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS exam_import_jobs_ready_idx ON exam_import_jobs(next_attempt_at) WHERE status='queued';
