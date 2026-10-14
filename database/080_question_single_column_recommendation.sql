ALTER TABLE question_revisions ADD COLUMN IF NOT EXISTS recommend_single_column boolean NOT NULL DEFAULT false;
