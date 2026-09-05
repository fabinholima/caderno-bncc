CREATE TABLE assessment_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id, name)
);

CREATE INDEX assessment_presets_owner_idx
  ON assessment_presets (institution_id, user_id, updated_at DESC);

COMMENT ON TABLE assessment_presets IS
  'Configurações reutilizáveis de cabeçalho e impressão privadas por professor dentro da instituição.';
