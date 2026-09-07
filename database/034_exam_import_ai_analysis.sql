ALTER TABLE exam_import_jobs
  ADD COLUMN IF NOT EXISTS prompt_version text;

COMMENT ON COLUMN exam_import_jobs.prompt_version IS
  'Versao auditavel do prompt usado em analises assistidas por IA.';
