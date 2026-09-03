CREATE TABLE curriculum_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version text NOT NULL DEFAULT 'BNCC-2018',
  name text NOT NULL,
  stage text NOT NULL,
  UNIQUE (curriculum_version, name, stage)
);

CREATE TABLE knowledge_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES curriculum_subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade_range text NOT NULL,
  description text,
  UNIQUE (subject_id, name, grade_range)
);

ALTER TABLE curriculum_skills
  ADD COLUMN knowledge_object_id uuid REFERENCES knowledge_objects(id);

CREATE INDEX knowledge_objects_subject_idx ON knowledge_objects (subject_id, grade_range);
CREATE INDEX curriculum_skills_object_idx ON curriculum_skills (knowledge_object_id);

COMMENT ON TABLE knowledge_objects IS 'Objeto de conhecimento reutilizável ao qual uma ou mais habilidades curriculares podem estar ligadas.';
COMMENT ON COLUMN curriculum_skills.knowledge_object_id IS 'Classificação curricular; a questão continua ligada à habilidade por question_skills.';
