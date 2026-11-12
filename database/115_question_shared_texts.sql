-- Texto-base compartilhado: um texto (crônica, poema, charge, reportagem...)
-- cadastrado uma vez e usado por várias questões. Na prova ele é impresso uma
-- única vez antes do grupo, com o título "Texto para os itens X a Y" calculado
-- pela numeração final. Provas já geradas guardam uma cópia no snapshot.
CREATE TABLE question_shared_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 300),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'array'),
  source text NOT NULL DEFAULT '' CHECK (char_length(source) <= 500),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX question_shared_texts_institution_idx
  ON question_shared_texts (institution_id, updated_at DESC);

-- Cada revisão da questão aponta para o texto-base que usa (opcional).
ALTER TABLE question_revisions
  ADD COLUMN shared_text_id uuid REFERENCES question_shared_texts(id) ON DELETE RESTRICT;

CREATE INDEX question_revisions_shared_text_idx
  ON question_revisions (shared_text_id)
  WHERE shared_text_id IS NOT NULL;
