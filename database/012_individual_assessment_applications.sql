CREATE TABLE application_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES assessment_applications(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE RESTRICT,
  qr_payload text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, student_id)
);
ALTER TABLE render_jobs ADD COLUMN application_student_id uuid REFERENCES application_students(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX render_jobs_application_student_idx ON render_jobs (application_student_id) WHERE application_student_id IS NOT NULL;
CREATE INDEX application_students_application_idx ON application_students (application_id);
