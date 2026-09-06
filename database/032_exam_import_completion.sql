BEGIN;

ALTER TABLE exam_imports
  DROP CONSTRAINT IF EXISTS exam_imports_status_check;

ALTER TABLE exam_imports
  ADD CONSTRAINT exam_imports_status_check
  CHECK (status IN (
    'uploaded','queued','extracting','extracted','needs_review',
    'completed','failed','cancelled'
  ));

COMMIT;
