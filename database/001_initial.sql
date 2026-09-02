CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE question_status AS ENUM ('draft', 'review', 'approved', 'archived');
CREATE TYPE question_type AS ENUM ('single_choice', 'multiple_choice', 'short_answer', 'essay');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');

CREATE TABLE institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'coordinator', 'teacher')),
  PRIMARY KEY (institution_id, user_id)
);

CREATE TABLE curriculum_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version text NOT NULL DEFAULT 'BNCC-2018',
  code text NOT NULL,
  stage text NOT NULL,
  subject text NOT NULL,
  grade_range text NOT NULL,
  description text NOT NULL,
  UNIQUE (curriculum_version, code)
);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  public_code text NOT NULL,
  current_revision integer NOT NULL DEFAULT 1,
  status question_status NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, public_code)
);

CREATE TABLE question_revisions (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  type question_type NOT NULL DEFAULT 'single_choice',
  statement jsonb NOT NULL,
  explanation jsonb,
  difficulty difficulty_level NOT NULL DEFAULT 'medium',
  default_points numeric(8,2) NOT NULL DEFAULT 1 CHECK (default_points >= 0),
  subject text NOT NULL,
  grade text NOT NULL,
  source_name text,
  source_license text,
  authored_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, revision)
);

CREATE TABLE alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  revision integer NOT NULL,
  stable_key text NOT NULL,
  content jsonb NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  FOREIGN KEY (question_id, revision) REFERENCES question_revisions(question_id, revision) ON DELETE CASCADE,
  UNIQUE (question_id, revision, stable_key),
  UNIQUE (question_id, revision, position)
);

CREATE TABLE question_skills (
  question_id uuid NOT NULL,
  revision integer NOT NULL,
  skill_id uuid NOT NULL REFERENCES curriculum_skills(id),
  is_primary boolean NOT NULL DEFAULT false,
  FOREIGN KEY (question_id, revision) REFERENCES question_revisions(question_id, revision) ON DELETE CASCADE,
  PRIMARY KEY (question_id, revision, skill_id)
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL,
  instructions text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'frozen', 'published', 'archived')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  code text NOT NULL,
  seed bigint NOT NULL,
  snapshot jsonb NOT NULL,
  answer_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, code)
);

CREATE TABLE render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  renderer text NOT NULL DEFAULT 'context-lmtx',
  template_version text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  output_manifest jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX questions_search_idx ON question_revisions USING gin (to_tsvector('portuguese', statement::text));
CREATE INDEX questions_tenant_status_idx ON questions (institution_id, status, updated_at DESC);
CREATE INDEX question_skills_skill_idx ON question_skills (skill_id);
CREATE UNIQUE INDEX one_primary_skill_per_revision ON question_skills (question_id, revision) WHERE is_primary;
COMMENT ON TABLE question_revisions IS 'Conteúdo versionado e reutilizável; não contém decisões de layout da prova.';
COMMENT ON COLUMN assessment_versions.snapshot IS 'Fotografia imutável de conteúdo, ordem, pontos e metadados entregue ao renderizador.';
COMMENT ON COLUMN alternatives.is_correct IS 'A cardinalidade de respostas corretas é validada pela aplicação conforme question_revisions.type.';
