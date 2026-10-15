ALTER TABLE exam_import_jobs ADD COLUMN IF NOT EXISTS ai_provider text CHECK (ai_provider IN ('gemini','deepseek','openai','local_demo'));
