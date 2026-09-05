CREATE TABLE IF NOT EXISTS curriculum_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version text NOT NULL DEFAULT 'BNCC-2018',
  source_key text NOT NULL,
  name text NOT NULL,
  stage text NOT NULL,
  source_metadata jsonb,
  UNIQUE (curriculum_version, source_key)
);

CREATE TABLE IF NOT EXISTS curriculum_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES curriculum_areas(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  number integer NOT NULL CHECK (number > 0),
  description text NOT NULL,
  source_metadata jsonb,
  UNIQUE (area_id, source_key),
  UNIQUE (area_id, number)
);

CREATE TABLE IF NOT EXISTS skill_competencies (
  skill_id uuid NOT NULL REFERENCES curriculum_skills(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES curriculum_competencies(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, competency_id)
);

CREATE INDEX IF NOT EXISTS skill_competencies_competency_idx
  ON skill_competencies (competency_id, skill_id);

COMMENT ON TABLE curriculum_competencies IS
  'Competências específicas oficiais, usadas no Ensino Médio em vez de objetos de conhecimento.';
