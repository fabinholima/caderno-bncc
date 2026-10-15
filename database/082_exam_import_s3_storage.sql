-- Align the database with createObjectStorage().provider, preserving legacy rows.
ALTER TABLE exam_import_documents
  DROP CONSTRAINT IF EXISTS exam_import_documents_storage_provider_check;
ALTER TABLE exam_import_documents
  ADD CONSTRAINT exam_import_documents_storage_provider_check
  CHECK (storage_provider IN ('database','filesystem','object_storage','s3'));
