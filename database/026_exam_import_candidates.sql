ALTER TABLE exam_imports
  ADD COLUMN IF NOT EXISTS extracted_candidates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN exam_imports.extracted_candidates IS
  'Questões candidatas extraídas do PDF, ainda sujeitas à revisão do professor.';
