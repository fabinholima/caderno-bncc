ALTER TABLE card_scans
  ADD COLUMN submission_id uuid UNIQUE
  REFERENCES assessment_submissions(id) ON DELETE SET NULL;

CREATE INDEX card_scans_application_student_idx
  ON card_scans (application_student_id, completed_at DESC);

COMMENT ON COLUMN card_scans.submission_id IS
  'Correção gerada automaticamente após uma leitura OMR sem ambiguidades.';
