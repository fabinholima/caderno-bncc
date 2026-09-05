CREATE TABLE IF NOT EXISTS saeb_matrices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  name text NOT NULL,
  stage text NOT NULL CHECK (stage = 'Ensino Fundamental'),
  subject text NOT NULL,
  grade_range text NOT NULL,
  version text NOT NULL,
  source_url text NOT NULL,
  source_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saeb_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id uuid NOT NULL REFERENCES saeb_matrices(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  UNIQUE (matrix_id, code),
  UNIQUE (matrix_id, position)
);

CREATE TABLE IF NOT EXISTS saeb_descriptors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id uuid NOT NULL REFERENCES saeb_matrices(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES saeb_topics(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  source_metadata jsonb,
  UNIQUE (matrix_id, code),
  UNIQUE (matrix_id, position)
);

CREATE TABLE IF NOT EXISTS question_saeb_descriptors (
  question_id uuid NOT NULL,
  revision integer NOT NULL,
  descriptor_id uuid NOT NULL REFERENCES saeb_descriptors(id),
  is_primary boolean NOT NULL DEFAULT false,
  FOREIGN KEY (question_id, revision)
    REFERENCES question_revisions(question_id, revision) ON DELETE CASCADE,
  PRIMARY KEY (question_id, revision, descriptor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_primary_saeb_descriptor_per_revision
  ON question_saeb_descriptors (question_id, revision)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS saeb_descriptors_matrix_topic_idx
  ON saeb_descriptors (matrix_id, topic_id, position);

COMMENT ON TABLE saeb_matrices IS
  'Matrizes de referência do Saeb mantidas separadas do currículo BNCC.';
COMMENT ON TABLE saeb_descriptors IS
  'Descritores oficiais do Saeb; não representam a totalidade do currículo escolar.';
