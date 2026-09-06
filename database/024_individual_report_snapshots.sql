ALTER TABLE application_report_snapshots
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'class'
    CHECK (scope_type IN ('class', 'student')),
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE application_report_snapshots
  DROP CONSTRAINT IF EXISTS application_report_snapshots_application_id_version_key;

CREATE UNIQUE INDEX IF NOT EXISTS application_report_snapshots_scope_version_idx
  ON application_report_snapshots
    (application_id, scope_type, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

ALTER TABLE application_report_snapshots
  DROP CONSTRAINT IF EXISTS application_report_snapshots_scope_check;

ALTER TABLE application_report_snapshots
  ADD CONSTRAINT application_report_snapshots_scope_check CHECK (
    (scope_type = 'class' AND student_id IS NULL) OR
    (scope_type = 'student' AND student_id IS NOT NULL)
  );
