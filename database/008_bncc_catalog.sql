ALTER TABLE curriculum_subjects
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_subjects_source_key_idx
  ON curriculum_subjects (curriculum_version, source_key)
  WHERE source_key IS NOT NULL;

ALTER TABLE knowledge_objects
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_objects_source_key_idx
  ON knowledge_objects (subject_id, source_key)
  WHERE source_key IS NOT NULL;

ALTER TABLE curriculum_skills
  ADD COLUMN IF NOT EXISTS dataset_version text,
  ADD COLUMN IF NOT EXISTS validity_status text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;

CREATE TABLE IF NOT EXISTS skill_knowledge_objects (
  skill_id uuid NOT NULL REFERENCES curriculum_skills(id) ON DELETE CASCADE,
  knowledge_object_id uuid NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1 CHECK (position > 0),
  PRIMARY KEY (skill_id, knowledge_object_id),
  UNIQUE (skill_id, position)
);

INSERT INTO skill_knowledge_objects (skill_id, knowledge_object_id, position)
SELECT id, knowledge_object_id, 1
FROM curriculum_skills
WHERE knowledge_object_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS skill_knowledge_objects_object_idx
  ON skill_knowledge_objects (knowledge_object_id, skill_id);

COMMENT ON TABLE skill_knowledge_objects IS
  'Relação N:N oficial entre habilidades e objetos de conhecimento da BNCC.';
