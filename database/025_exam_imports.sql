CREATE TABLE IF NOT EXISTS exam_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  source_institution text NOT NULL,
  source_year integer NOT NULL CHECK (source_year BETWEEN 1900 AND 2100),
  exam_type text NOT NULL CHECK (exam_type IN ('vestibular','concurso','enem','simulado','other')),
  subject_mode text NOT NULL CHECK (subject_mode IN ('single','multidisciplinary')),
  primary_subject text,
  source_url text,
  rights_status text NOT NULL DEFAULT 'pending_review'
    CHECK (rights_status IN ('pending_review','authorized','public_license','citation_only','restricted','blocked')),
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','queued','extracting','extracted','needs_review','failed','cancelled')),
  detected_questions integer NOT NULL DEFAULT 0 CHECK (detected_questions >= 0),
  reviewed_questions integer NOT NULL DEFAULT 0 CHECK (reviewed_questions >= 0),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_import_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_import_id uuid NOT NULL REFERENCES exam_imports(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('exam','answer_key')),
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf' CHECK (mime_type = 'application/pdf'),
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_import_id, kind)
);

CREATE INDEX IF NOT EXISTS exam_imports_tenant_status_idx
  ON exam_imports (institution_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS exam_import_documents_import_idx
  ON exam_import_documents (exam_import_id, kind);

COMMENT ON TABLE exam_imports IS
  'Área editorial isolada para provas anteriores; nenhum item é publicado automaticamente.';
COMMENT ON COLUMN exam_imports.rights_status IS
  'Decisão editorial sobre permissão de uso antes de qualquer publicação.';
