-- Resultados provisórios, publicação autorizada pelo professor e
-- acompanhamento de baixo rendimento. Migração aditiva: nenhuma tabela
-- existente perde colunas ou dados.
--
-- card_scans continua guardando o estado da leitura da imagem; a publicação
-- fica em assessment_results. Uma imagem processada não é um resultado
-- autorizado: o aluno só vê assessment_results.published_version_id.

-- Regras por aplicação. O resultado guarda uma cópia da regra usada.
CREATE TABLE IF NOT EXISTS application_result_settings (
  application_id uuid PRIMARY KEY REFERENCES assessment_applications(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  min_expected_percent numeric(5,2) CHECK (min_expected_percent BETWEEN 0 AND 100),
  -- O que o aluno vê em cada questão: só o resumo, as próprias respostas,
  -- ou respostas e gabarito.
  release_policy text NOT NULL DEFAULT 'summary'
    CHECK (release_policy IN ('summary','answers','answers_and_key')),
  annulled_questions integer[] NOT NULL DEFAULT '{}',
  -- Sem regra definida não há como pontuar uma questão anulada.
  annulled_policy text CHECK (annulled_policy IN ('exclude','award_full')),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(annulled_questions) = 0 OR annulled_policy IS NOT NULL)
);

-- Percentual mínimo padrão da instituição, de uma escola ou de uma disciplina.
-- A aplicação pode sobrescrever em application_result_settings.
CREATE TABLE IF NOT EXISTS performance_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  school_id uuid REFERENCES educator_schools(id) ON DELETE CASCADE,
  subject text CHECK (subject IS NULL OR length(trim(subject)) BETWEEN 2 AND 80),
  min_expected_percent numeric(5,2) NOT NULL CHECK (min_expected_percent BETWEEN 0 AND 100),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS performance_thresholds_scope_idx ON performance_thresholds
  (institution_id, COALESCE(school_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(lower(subject), ''));

-- Um resultado por aluno em cada aplicação: reenvios criam novas versões,
-- nunca outra nota.
CREATE TABLE IF NOT EXISTS assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_student_id uuid NOT NULL UNIQUE REFERENCES application_students(id) ON DELETE CASCADE,
  current_version_id uuid,
  published_version_id uuid,
  processing_status text NOT NULL DEFAULT 'processing'
    CHECK (processing_status IN ('processing','needs_review','ready','failed')),
  -- republish_required: há uma versão mais nova que a publicada; o aluno
  -- continua vendo a publicada até nova autorização.
  publication_status text NOT NULL DEFAULT 'unpublished'
    CHECK (publication_status IN ('unpublished','published','republish_required')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((publication_status = 'unpublished') = (published_version_id IS NULL))
);
CREATE INDEX IF NOT EXISTS assessment_results_institution_idx
  ON assessment_results(institution_id, publication_status, processing_status);

-- Versões imutáveis. Contagens consideram apenas questões objetivas:
-- correct + incorrect + blank + invalid + review_pending = valid_count.
-- Discursivas sem nota ficam em manual_pending_count.
CREATE TABLE IF NOT EXISTS assessment_result_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES assessment_results(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  source text NOT NULL CHECK (source IN ('omr','manual_review','recalculation','legacy')),
  card_scan_id uuid REFERENCES card_scans(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES assessment_submissions(id) ON DELETE SET NULL,
  assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE RESTRICT,
  -- encode(sha256(convert_to(answer_key::text,'UTF8')),'hex'), sempre
  -- calculado no PostgreSQL para que versões novas e antigas sejam comparáveis.
  answer_key_sha256 text NOT NULL CHECK (answer_key_sha256 ~ '^[0-9a-f]{64}$'),
  scoring_rule jsonb NOT NULL,
  items jsonb NOT NULL,
  question_count integer NOT NULL CHECK (question_count >= 0),
  annulled_count integer NOT NULL DEFAULT 0 CHECK (annulled_count >= 0),
  valid_count integer NOT NULL CHECK (valid_count >= 0),
  correct_count integer NOT NULL CHECK (correct_count >= 0),
  incorrect_count integer NOT NULL CHECK (incorrect_count >= 0),
  blank_count integer NOT NULL CHECK (blank_count >= 0),
  invalid_count integer NOT NULL CHECK (invalid_count >= 0),
  review_pending_count integer NOT NULL CHECK (review_pending_count >= 0),
  manual_pending_count integer NOT NULL DEFAULT 0 CHECK (manual_pending_count >= 0),
  percent numeric(5,2) CHECK (percent BETWEEN 0 AND 100),
  -- Nula enquanto houver pendência ou sem regra de pontuação.
  score numeric(8,2),
  max_score numeric(8,2),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_id, version_number),
  CHECK (correct_count + incorrect_count + blank_count + invalid_count + review_pending_count = valid_count)
);
CREATE INDEX IF NOT EXISTS assessment_result_versions_scan_idx
  ON assessment_result_versions(card_scan_id) WHERE card_scan_id IS NOT NULL;

ALTER TABLE assessment_results DROP CONSTRAINT IF EXISTS assessment_results_current_version_fk;
ALTER TABLE assessment_results ADD CONSTRAINT assessment_results_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES assessment_result_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE assessment_results DROP CONSTRAINT IF EXISTS assessment_results_published_version_fk;
ALTER TABLE assessment_results ADD CONSTRAINT assessment_results_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES assessment_result_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- Autorizações de lançamento. Autorizar de novo a mesma versão não cria
-- outro lançamento; só uma publicação fica ativa por resultado.
CREATE TABLE IF NOT EXISTS assessment_result_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES assessment_results(id) ON DELETE CASCADE,
  result_version_id uuid NOT NULL UNIQUE REFERENCES assessment_result_versions(id) ON DELETE RESTRICT,
  authorized_by uuid REFERENCES users(id) ON DELETE SET NULL,
  authorizer_name text NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  batch_id uuid,
  legacy boolean NOT NULL DEFAULT false,
  -- authorizer_name preserva a identificação se a conta for removida.
  superseded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS assessment_result_publications_active_idx
  ON assessment_result_publications(result_id) WHERE superseded_at IS NULL;

-- Nenhuma versão com leitura duvidosa ou discursiva sem nota é publicada,
-- mesmo que uma rota futura esqueça a verificação.
CREATE OR REPLACE FUNCTION assert_result_version_publishable() RETURNS trigger AS $$
DECLARE pending integer; owner uuid;
BEGIN
  SELECT review_pending_count + manual_pending_count, result_id INTO pending, owner
  FROM assessment_result_versions WHERE id = NEW.result_version_id;
  IF owner IS DISTINCT FROM NEW.result_id THEN
    RAISE EXCEPTION 'A versão não pertence a este resultado.' USING ERRCODE = '23514';
  END IF;
  IF pending > 0 THEN
    RAISE EXCEPTION 'O resultado tem questões pendentes de revisão.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS assessment_result_publications_publishable ON assessment_result_publications;
CREATE TRIGGER assessment_result_publications_publishable
  BEFORE INSERT ON assessment_result_publications
  FOR EACH ROW EXECUTE FUNCTION assert_result_version_publishable();

-- Alterações manuais de respostas, com a leitura original preservada.
CREATE TABLE IF NOT EXISTS assessment_result_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES assessment_results(id) ON DELETE CASCADE,
  from_version_id uuid REFERENCES assessment_result_versions(id) ON DELETE RESTRICT,
  to_version_id uuid NOT NULL REFERENCES assessment_result_versions(id) ON DELETE RESTRICT,
  question_number integer NOT NULL CHECK (question_number > 0),
  previous_labels text[] NOT NULL DEFAULT '{}',
  new_labels text[] NOT NULL DEFAULT '{}',
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_result_changes_result_idx
  ON assessment_result_changes(result_id, changed_at DESC);

-- Acompanhamento de baixo rendimento. Cada registro é uma nova entrada; o
-- mais recente representa a situação atual e os anteriores formam o histórico.
-- Os motivos são sempre escolhidos pelo professor.
CREATE TABLE IF NOT EXISTS performance_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  result_id uuid NOT NULL REFERENCES assessment_results(id) ON DELETE CASCADE,
  result_version_id uuid REFERENCES assessment_result_versions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending','justified')),
  reasons text[] NOT NULL DEFAULT '{}' CHECK (reasons <@ ARRAY[
    'content_comprehension','reading_interpretation','attendance','prior_content',
    'incomplete_assessment','application_incident','other']::text[]),
  other_reason text CHECK (other_reason IS NULL OR length(other_reason) <= 1000),
  actions text[] NOT NULL DEFAULT '{}' CHECK (actions <@ ARRAY[
    'content_review','targeted_exercises','individual_support','recovery','new_assessment']::text[]),
  -- Nunca exibido ao aluno.
  internal_note text CHECK (internal_note IS NULL OR length(internal_note) <= 4000),
  -- Exibido ao aluno somente com student_guidance_published = true.
  student_guidance text CHECK (student_guidance IS NULL OR length(student_guidance) <= 4000),
  student_guidance_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'pending' OR cardinality(reasons) > 0),
  CHECK (NOT ('other' = ANY(reasons)) OR length(trim(coalesce(other_reason, ''))) > 0),
  CHECK (NOT student_guidance_published OR length(trim(coalesce(student_guidance, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS performance_followups_result_idx
  ON performance_followups(result_id, created_at DESC);

-- Resultados que o aluno já via antes desta migração continuam visíveis:
-- cada um vira a versão 1, publicada como legado. Correções com revisão
-- manual pendente permanecem sem publicação, como já estavam para o aluno.
-- Só considera cartões sem resultado: o código novo sempre cria um. A função
-- fica disponível para converter cartões concluídos pelo worker antigo
-- durante a troca de versão (services/api/backfill-legacy-results.mjs).
CREATE OR REPLACE FUNCTION publish_legacy_scan_results() RETURNS integer AS $$
DECLARE r record; result uuid; version uuid; converted integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (cs.application_student_id)
           cs.id scan_id, cs.application_student_id, cs.completed_at, aa.institution_id,
           sub.id submission_id, sub.assessment_version_id, sub.result, sub.score, sub.max_score,
           encode(sha256(convert_to(av.answer_key::text, 'UTF8')), 'hex') key_hash
    FROM card_scans cs
    JOIN assessment_submissions sub ON sub.id = cs.submission_id
    JOIN application_students aps ON aps.id = cs.application_student_id
    JOIN assessment_applications aa ON aa.id = aps.application_id
    JOIN assessment_versions av ON av.id = sub.assessment_version_id
    WHERE cs.status = 'completed' AND NOT sub.requires_manual_review
      AND NOT EXISTS (SELECT 1 FROM assessment_results ar WHERE ar.application_student_id = cs.application_student_id)
    ORDER BY cs.application_student_id, cs.completed_at DESC
  LOOP
    INSERT INTO assessment_results(institution_id, application_student_id, processing_status, created_at)
    VALUES (r.institution_id, r.application_student_id, 'ready', r.completed_at)
    RETURNING id INTO result;
    WITH items AS (
      SELECT item,
        CASE
          WHEN item->>'status' = 'correct' THEN 'correct'
          WHEN item->>'status' = 'unanswered' OR coalesce(jsonb_array_length(item->'selectedLabels'), 0) = 0 THEN 'blank'
          WHEN jsonb_array_length(item->'selectedLabels') > 1
               AND coalesce(jsonb_array_length(item->'correctLabels'), 0) <= 1 THEN 'invalid'
          ELSE 'incorrect'
        END kind
      FROM jsonb_array_elements(coalesce(r.result->'items', '[]'::jsonb)) item
      WHERE item ? 'correctLabels'
    ), counts AS (
      SELECT count(*)::int total,
             count(*) FILTER (WHERE kind = 'correct')::int correct,
             count(*) FILTER (WHERE kind = 'incorrect')::int incorrect,
             count(*) FILTER (WHERE kind = 'blank')::int blank,
             count(*) FILTER (WHERE kind = 'invalid')::int invalid,
             coalesce(jsonb_agg(item || jsonb_build_object('status', kind)), '[]'::jsonb) items
      FROM items
    )
    INSERT INTO assessment_result_versions(
      result_id, version_number, source, card_scan_id, submission_id, assessment_version_id,
      answer_key_sha256, scoring_rule, items, question_count, valid_count, correct_count,
      incorrect_count, blank_count, invalid_count, review_pending_count, percent, score, max_score, created_at)
    SELECT result, 1, 'legacy', r.scan_id, r.submission_id, r.assessment_version_id, r.key_hash,
           '{"kind":"points_sum","annulledQuestions":[],"annulledPolicy":null,"legacy":true}'::jsonb,
           c.items, jsonb_array_length(coalesce(r.result->'items', '[]'::jsonb)), c.total, c.correct,
           c.incorrect, c.blank, c.invalid, 0,
           CASE WHEN c.total > 0 THEN round(c.correct * 100.0 / c.total, 2) END,
           r.score, r.max_score, r.completed_at
    FROM counts c
    RETURNING id INTO version;
    INSERT INTO assessment_result_publications(result_id, result_version_id, authorizer_name, authorized_at, legacy)
    VALUES (result, version, 'Publicado antes da autorização no aplicativo', r.completed_at, true);
    UPDATE assessment_results
    SET current_version_id = version, published_version_id = version, publication_status = 'published'
    WHERE id = result;
    converted := converted + 1;
  END LOOP;
  RETURN converted;
END $$ LANGUAGE plpgsql;
SELECT publish_legacy_scan_results();

COMMENT ON TABLE assessment_results IS
  'Resultado de um aluno em uma aplicação. O aluno vê somente published_version_id.';
COMMENT ON TABLE assessment_result_versions IS
  'Versões imutáveis do resultado, ligadas ao gabarito (hash) e à regra de pontuação usados.';
COMMENT ON TABLE assessment_result_publications IS
  'Autorizações de lançamento: quem autorizou, quando e qual versão foi publicada.';
