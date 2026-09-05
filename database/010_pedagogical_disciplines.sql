CREATE TABLE IF NOT EXISTS pedagogical_disciplines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES curriculum_areas(id),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'Ensino Médio',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, area_id, name)
);

CREATE TABLE IF NOT EXISTS pedagogical_discipline_skills (
  discipline_id uuid NOT NULL REFERENCES pedagogical_disciplines(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES curriculum_skills(id) ON DELETE CASCADE,
  tagged_by uuid NOT NULL REFERENCES users(id),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discipline_id, skill_id)
);

CREATE INDEX IF NOT EXISTS pedagogical_discipline_skills_skill_idx
  ON pedagogical_discipline_skills (skill_id, discipline_id);

COMMENT ON TABLE pedagogical_disciplines IS
  'Camada pedagógica institucional; não altera a classificação normativa da BNCC.';
