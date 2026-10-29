-- Evolui o cadastro acadêmico preservando usuários, escolas, turmas,
-- alunos, matrículas e aplicações existentes.

-- Cada registro representa uma etapa/ano/agrupamento que aquela escola atende.
CREATE TABLE IF NOT EXISTS etapas_escola (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES educator_schools(id) ON DELETE CASCADE,
  etapa text NOT NULL CHECK (etapa IN ('infantil','fundamental_iniciais','fundamental_finais','medio','eja','tecnico')),
  ano_agrupamento text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, etapa, ano_agrupamento)
);
CREATE INDEX IF NOT EXISTS etapas_escola_school_idx ON etapas_escola(school_id, etapa);

-- Vínculo da turma à escola e ao nível atendido. Colunas opcionais mantêm
-- compatibilidade com turmas antigas até que seus donos as revisem.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES educator_schools(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS school_stage_id uuid REFERENCES etapas_escola(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS shift text NOT NULL DEFAULT '' CHECK (shift IN ('','manha','tarde','noite','integral'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS copied_from_class_id uuid REFERENCES classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS classes_school_year_idx ON classes(school_id, school_year DESC);
CREATE INDEX IF NOT EXISTS classes_creator_year_idx ON classes(created_by, school_year DESC);

-- Disciplinas ministradas naquela turma (derivam daqui os resumos do perfil).
CREATE TABLE IF NOT EXISTS class_subjects (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 2 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, teacher_id, subject)
);

-- Docentes explicitamente autorizados a ver os dados daquela turma.
CREATE TABLE IF NOT EXISTS class_memberships (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_role text NOT NULL CHECK (access_role IN ('owner','teacher','coordinator')),
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);
CREATE INDEX IF NOT EXISTS class_memberships_user_idx ON class_memberships(user_id, class_id);

-- Número de matrícula, nascimento e observação são opcionais. A observação
-- fica restrita à equipe autorizada e serve apenas para necessidade escolar.
ALTER TABLE students ALTER COLUMN registration SET DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE students ADD COLUMN IF NOT EXISTS observation text NOT NULL DEFAULT '';

-- Permite cadastro sem RA. Mantém unicidade institucional quando ele existe.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_institution_id_registration_key;
CREATE UNIQUE INDEX IF NOT EXISTS students_institution_registration_idx
  ON students(institution_id, registration) WHERE registration <> '';

-- O número de chamada já tem restrição única por turma na tabela de matrículas.

-- Escola preferida para cabeçalhos das provas. Há no máximo uma por usuário.
ALTER TABLE educator_schools ADD COLUMN IF NOT EXISTS is_header_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS educator_schools_one_header_default_idx
  ON educator_schools(user_id) WHERE is_header_default;
