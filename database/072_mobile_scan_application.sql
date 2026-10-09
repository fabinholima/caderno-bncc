ALTER TABLE card_scans ADD COLUMN IF NOT EXISTS expected_application_id uuid REFERENCES assessment_applications(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS card_scans_expected_application_idx ON card_scans(expected_application_id) WHERE expected_application_id IS NOT NULL;
