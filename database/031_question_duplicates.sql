BEGIN;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS duplicate_of_question_id uuid
    REFERENCES questions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS duplicate_detected_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_reason text;

CREATE INDEX IF NOT EXISTS questions_duplicate_of_idx
  ON questions (duplicate_of_question_id)
  WHERE duplicate_of_question_id IS NOT NULL;

UPDATE questions duplicate
SET duplicate_of_question_id = canonical.id,
    duplicate_detected_at = COALESCE(duplicate.duplicate_detected_at, now()),
    duplicate_reason = COALESCE(
      duplicate.duplicate_reason,
      'Conteúdo equivalente detectado após normalização do enunciado e das alternativas.'
    ),
    status = 'archived',
    updated_at = now()
FROM questions canonical
WHERE duplicate.public_code = 'QUI-0008'
  AND canonical.public_code = 'QUI-0007'
  AND duplicate.institution_id = canonical.institution_id
  AND duplicate.id <> canonical.id
  AND duplicate.duplicate_of_question_id IS NULL;

COMMIT;
