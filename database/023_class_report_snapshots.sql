CREATE TABLE IF NOT EXISTS application_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES assessment_applications(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  schema_version text NOT NULL DEFAULT '1.0',
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, version)
);

CREATE TABLE IF NOT EXISTS application_report_render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_snapshot_id uuid NOT NULL REFERENCES application_report_snapshots(id) ON DELETE CASCADE,
  renderer text NOT NULL DEFAULT 'context-lmtx',
  template_version text NOT NULL DEFAULT 'class-report-v1',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  output_manifest jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS application_report_snapshots_application_idx
  ON application_report_snapshots (application_id, version DESC);

CREATE INDEX IF NOT EXISTS application_report_render_jobs_queue_idx
  ON application_report_render_jobs (status, created_at)
  WHERE status IN ('queued', 'running');

COMMENT ON COLUMN application_report_snapshots.snapshot IS
  'Fotografia estatística imutável usada para reproduzir o relatório da turma.';
