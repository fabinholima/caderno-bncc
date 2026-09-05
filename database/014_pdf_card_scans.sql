ALTER TABLE card_scans DROP CONSTRAINT card_scans_mime_type_check;
ALTER TABLE card_scans ADD CONSTRAINT card_scans_mime_type_check CHECK (mime_type IN ('image/png','image/jpeg','application/pdf'));
