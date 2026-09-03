CREATE TABLE assessment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  candidate jsonb NOT NULL DEFAULT '{}'::jsonb,
  responses jsonb NOT NULL,
  result jsonb NOT NULL,
  score numeric(8,2) NOT NULL DEFAULT 0,
  max_score numeric(8,2) NOT NULL DEFAULT 0,
  requires_manual_review boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assessment_submissions_version_idx
  ON assessment_submissions (assessment_version_id, submitted_at DESC);

COMMENT ON TABLE assessment_submissions IS
  'Respostas vinculadas a uma versão imutável da avaliação; o resultado automático usa o gabarito congelado dessa versão.';
