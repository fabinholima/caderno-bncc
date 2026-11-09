-- Módulo de redação: biblioteca de temas, textos motivadores e aplicação das
-- propostas às turmas existentes. Migração aditiva: nenhuma tabela existente
-- é alterada.
--
-- O tema é editável. A aplicação congela uma cópia (prompt_snapshot), para que
-- o histórico e as folhas reimpressas não mudem quando o tema for revisado.

CREATE TABLE IF NOT EXISTS essay_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 200),
  theme text NOT NULL CHECK (length(trim(theme)) BETWEEN 3 AND 400),
  thematic_axis text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  reference_institution text NOT NULL DEFAULT '',
  reference_year integer CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2100),
  essay_type text NOT NULL DEFAULT 'dissertativo-argumentativo',
  production_command text NOT NULL DEFAULT '',
  student_guidance text NOT NULL DEFAULT '',
  min_lines integer NOT NULL DEFAULT 7 CHECK (min_lines BETWEEN 1 AND 90),
  max_lines integer NOT NULL DEFAULT 30 CHECK (max_lines BETWEEN 5 AND 90),
  keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  -- Tema de origem quando criado pela ação "duplicar".
  duplicated_from uuid REFERENCES essay_prompts(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_lines <= max_lines)
);
CREATE INDEX IF NOT EXISTS essay_prompts_institution_idx
  ON essay_prompts (institution_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS essay_prompts_owner_idx
  ON essay_prompts (institution_id, created_by, updated_at DESC);

-- Textos motivadores em ordem de apresentação. O conteúdo é uma lista de
-- blocos (parágrafo, título, citação, lista, tabela e imagem); imagens ficam
-- no próprio JSON como data URL PNG/JPEG validada pela API, como nas questões,
-- e só são entregues por rotas autenticadas.
CREATE TABLE IF NOT EXISTS essay_motivating_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES essay_prompts(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  title text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content) = 'array'),
  author text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  bibliographic_reference text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  image_data_url text NOT NULL DEFAULT '',
  image_alt text NOT NULL DEFAULT '',
  image_caption text NOT NULL DEFAULT '',
  image_width text NOT NULL DEFAULT 'large' CHECK (image_width IN ('small','medium','large','full')),
  UNIQUE (prompt_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Aplicação de um tema a uma turma já cadastrada (classes). Uma turma pode
-- receber o mesmo tema mais de uma vez (reescrita, recuperação).
CREATE TABLE IF NOT EXISTS essay_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES essay_prompts(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id),
  applied_on date NOT NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed','cancelled')),
  -- Liberada para o aluno consultar a proposta no portal.
  available_to_students boolean NOT NULL DEFAULT false,
  -- Modelo de folha e opções de impressão usados nas folhas individuais.
  sheet_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_snapshot jsonb NOT NULL,
  prompt_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS essay_applications_institution_idx
  ON essay_applications (institution_id, applied_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS essay_applications_class_idx ON essay_applications (class_id);
CREATE INDEX IF NOT EXISTS essay_applications_prompt_idx ON essay_applications (prompt_id);

-- Uma linha por aluno da turma no momento da aplicação. Hoje registra quem
-- recebeu folha individual; as colunas de entrega e correção ficam prontas para
-- o envio de fotos/digitalizações e a correção por competências do ENEM.
CREATE TABLE IF NOT EXISTS essay_application_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES essay_applications(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  student_number integer,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','in_review','corrected','absent')),
  submission_storage_key text,
  submission_mime_type text CHECK (submission_mime_type IS NULL OR submission_mime_type IN ('image/png','image/jpeg','application/pdf')),
  submitted_at timestamptz,
  -- {"c1":0..200,...,"c5":0..200}; total calculado na correção.
  competency_scores jsonb,
  total_score integer CHECK (total_score IS NULL OR total_score BETWEEN 0 AND 1000),
  feedback text NOT NULL DEFAULT '',
  corrected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  corrected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, student_id)
);
CREATE INDEX IF NOT EXISTS essay_application_students_student_idx
  ON essay_application_students (student_id);
