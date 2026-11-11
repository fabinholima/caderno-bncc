-- Folhas de redação com QR por aluno e envio das folhas escaneadas em lote.
-- O QR da folha identifica a produção (essay_application_students); o
-- worker OMR lê o QR de cada página enviada e a anexa à produção certa.
-- As imagens ficam no armazenamento de objetos, nunca no banco.

ALTER TABLE essay_application_students ADD COLUMN qr_code text;

-- Código aleatório e não sequencial (alfanumérico maiúsculo: QR menor).
UPDATE essay_application_students
   SET qr_code = 'CBR1:' || upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 20))
 WHERE qr_code IS NULL;

ALTER TABLE essay_application_students
  ALTER COLUMN qr_code SET DEFAULT 'CBR1:' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
  ALTER COLUMN qr_code SET NOT NULL;

CREATE UNIQUE INDEX essay_application_students_qr_code_idx
  ON essay_application_students (qr_code);

-- Cada linha é um arquivo enviado (status queued) ou uma página dele já lida.
CREATE TABLE essay_scan_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES essay_applications(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES essay_scan_pages(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  original_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','application/pdf')),
  -- Arquivo enviado (removido depois da leitura) e imagem da página.
  source_ref text,
  page_ref text,
  page_mime_type text,
  source_page integer,
  source_pages integer,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','attached','unmatched','failed','discarded')),
  entry_id uuid REFERENCES essay_application_students(id) ON DELETE SET NULL,
  submission_file_id uuid REFERENCES essay_submission_files(id) ON DELETE SET NULL,
  message text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX essay_scan_pages_queue_idx ON essay_scan_pages (created_at)
  WHERE status IN ('queued','processing');
CREATE INDEX essay_scan_pages_application_idx
  ON essay_scan_pages (application_id, created_at);
