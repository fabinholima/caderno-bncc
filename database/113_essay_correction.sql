-- Correção de redações: modelos de correção (rubricas) em dados, produções
-- dos alunos (texto digitado, fotos e PDFs), transcrições, correções da IA e
-- do professor, fila de processamento e publicação.
--
-- Arquivos enviados ficam no armazenamento de objetos (ou em pasta local em
-- desenvolvimento); o banco guarda só a referência e os metadados.

-- 1. Modelos de correção ------------------------------------------------------
-- criteria: [{id, numeral, title, maxScore, levels:[{score, descriptor}],
--             observations:[{id, label, tone, options?:[{id,label,tone}]}]}]
-- Sem institution_id = modelo do sistema, visível a todas as instituições.
CREATE TABLE essay_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  max_score integer NOT NULL CHECK (max_score > 0),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'array'),
  annulment_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (institution_id, code, version)
);

-- Matriz de referência do Enem: títulos e descritores dos níveis conforme
-- "A redação no Enem 2023 – Cartilha do participante" (Inep). As marcações
-- (observations) são apoio pedagógico do UFA Prova e não alteram a nota.
INSERT INTO essay_rubrics (code, name, version, description, source, max_score, criteria, annulment_reasons)
VALUES ('enem', 'Enem — Matriz de referência da redação', 1,
  'Cinco competências de 0 a 200 pontos, em níveis de 40 em 40. Nota total de 0 a 1000.',
  'Inep — A redação no Enem 2023: cartilha do participante. https://download.inep.gov.br/publicacoes/institucionais/avaliacoes_e_exames_da_educacao_basica/a_redacao_no_enem_2023_cartilha_do_participante.pdf',
  1000,
  $rubric$[
  {"id":"c1","numeral":"I","maxScore":200,
   "title":"Demonstrar domínio da modalidade escrita formal da língua portuguesa.",
   "levels":[
    {"score":200,"descriptor":"Demonstra excelente domínio da modalidade escrita formal da língua portuguesa e de escolha de registro. Desvios gramaticais ou de convenções da escrita serão aceitos somente como excepcionalidade e quando não caracterizarem reincidência."},
    {"score":160,"descriptor":"Demonstra bom domínio da modalidade escrita formal da língua portuguesa e de escolha de registro, com poucos desvios gramaticais e de convenções da escrita."},
    {"score":120,"descriptor":"Demonstra domínio mediano da modalidade escrita formal da língua portuguesa e de escolha de registro, com alguns desvios gramaticais e de convenções da escrita."},
    {"score":80,"descriptor":"Demonstra domínio insuficiente da modalidade escrita formal da língua portuguesa, com muitos desvios gramaticais, de escolha de registro e de convenções da escrita."},
    {"score":40,"descriptor":"Demonstra domínio precário da modalidade escrita formal da língua portuguesa, de forma sistemática, com diversificados e frequentes desvios gramaticais, de escolha de registro e de convenções da escrita."},
    {"score":0,"descriptor":"Demonstra desconhecimento da modalidade escrita formal da língua portuguesa."}],
   "observations":[
    {"id":"norma-adequada","label":"Adequação à norma escrita formal","tone":"positive"},
    {"id":"desvios-gramaticais","label":"Desvios gramaticais","tone":"attention"},
    {"id":"concordancia","label":"Problemas de concordância","tone":"attention"},
    {"id":"regencia","label":"Problemas de regência","tone":"attention"},
    {"id":"pontuacao","label":"Problemas de pontuação","tone":"attention"},
    {"id":"acentuacao","label":"Problemas de acentuação","tone":"attention"},
    {"id":"ortografia","label":"Problemas de ortografia","tone":"attention"},
    {"id":"sintaxe","label":"Problemas de construção sintática","tone":"attention"}]},
  {"id":"c2","numeral":"II","maxScore":200,
   "title":"Compreender a proposta de redação e aplicar conceitos das várias áreas de conhecimento para desenvolver o tema, dentro dos limites estruturais do texto dissertativo-argumentativo em prosa.",
   "levels":[
    {"score":200,"descriptor":"Desenvolve o tema por meio de argumentação consistente, a partir de um repertório sociocultural produtivo, e apresenta excelente domínio do texto dissertativo-argumentativo."},
    {"score":160,"descriptor":"Desenvolve o tema por meio de argumentação consistente e apresenta bom domínio do texto dissertativo-argumentativo, com proposição, argumentação e conclusão."},
    {"score":120,"descriptor":"Desenvolve o tema por meio de argumentação previsível e apresenta domínio mediano do texto dissertativo-argumentativo, com proposição, argumentação e conclusão."},
    {"score":80,"descriptor":"Desenvolve o tema recorrendo à cópia de trechos dos textos motivadores ou apresenta domínio insuficiente do texto dissertativo-argumentativo, não atendendo à estrutura com proposição, argumentação e conclusão."},
    {"score":40,"descriptor":"Apresenta o assunto, tangenciando o tema, ou demonstra domínio precário do texto dissertativo-argumentativo, com traços constantes de outros tipos textuais."},
    {"score":0,"descriptor":"Fuga ao tema/não atendimento à estrutura dissertativo-argumentativa. Nestes casos a redação recebe nota zero e é anulada."}],
   "observations":[
    {"id":"tema-integral","label":"Atendimento integral ao tema","tone":"positive"},
    {"id":"tema-parcial","label":"Atendimento parcial ao tema","tone":"attention"},
    {"id":"tangenciamento","label":"Tangenciamento","tone":"attention"},
    {"id":"fuga-tema","label":"Fuga ao tema","tone":"attention"},
    {"id":"repertorio-pertinente","label":"Uso pertinente de repertório","tone":"positive"},
    {"id":"repertorio-pouco-produtivo","label":"Repertório pouco produtivo","tone":"attention"},
    {"id":"desenvolvimento-insuficiente","label":"Desenvolvimento insuficiente","tone":"attention"}]},
  {"id":"c3","numeral":"III","maxScore":200,
   "title":"Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista.",
   "levels":[
    {"score":200,"descriptor":"Apresenta informações, fatos e opiniões relacionados ao tema proposto, de forma consistente e organizada, configurando autoria, em defesa de um ponto de vista."},
    {"score":160,"descriptor":"Apresenta informações, fatos e opiniões relacionados ao tema, de forma organizada, com indícios de autoria, em defesa de um ponto de vista."},
    {"score":120,"descriptor":"Apresenta informações, fatos e opiniões relacionados ao tema, limitados aos argumentos dos textos motivadores e pouco organizados, em defesa de um ponto de vista."},
    {"score":80,"descriptor":"Apresenta informações, fatos e opiniões relacionados ao tema, mas desorganizados ou contraditórios e limitados aos argumentos dos textos motivadores, em defesa de um ponto de vista."},
    {"score":40,"descriptor":"Apresenta informações, fatos e opiniões pouco relacionados ao tema ou incoerentes e sem defesa de um ponto de vista."},
    {"score":0,"descriptor":"Apresenta informações, fatos e opiniões não relacionados ao tema e sem defesa de um ponto de vista."}],
   "observations":[
    {"id":"argumentos-pertinentes","label":"Argumentos pertinentes","tone":"positive"},
    {"id":"argumentos-pouco-desenvolvidos","label":"Argumentos pouco desenvolvidos","tone":"attention"},
    {"id":"argumentacao-inconsistente","label":"Argumentação inconsistente","tone":"attention"},
    {"id":"sem-progressao","label":"Ausência de progressão argumentativa","tone":"attention"},
    {"id":"contradicoes","label":"Contradições","tone":"attention"},
    {"id":"repertorio-pertinente","label":"Repertório pertinente","tone":"positive"},
    {"id":"repertorio-pouco-relacionado","label":"Repertório pouco relacionado ao tema","tone":"attention"},
    {"id":"sem-fundamentacao","label":"Informações sem fundamentação","tone":"attention"},
    {"id":"organizacao-adequada","label":"Organização adequada","tone":"positive"},
    {"id":"organizacao-insuficiente","label":"Organização insuficiente","tone":"attention"}]},
  {"id":"c4","numeral":"IV","maxScore":200,
   "title":"Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação.",
   "levels":[
    {"score":200,"descriptor":"Articula bem as partes do texto e apresenta repertório diversificado de recursos coesivos."},
    {"score":160,"descriptor":"Articula as partes do texto com poucas inadequações e apresenta repertório diversificado de recursos coesivos."},
    {"score":120,"descriptor":"Articula as partes do texto, de forma mediana, com inadequações, e apresenta repertório pouco diversificado de recursos coesivos."},
    {"score":80,"descriptor":"Articula as partes do texto, de forma insuficiente, com muitas inadequações, e apresenta repertório limitado de recursos coesivos."},
    {"score":40,"descriptor":"Articula as partes do texto de forma precária."},
    {"score":0,"descriptor":"Não articula as informações."}],
   "observations":[
    {"id":"conectivos-adequados","label":"Uso adequado de conectivos","tone":"positive"},
    {"id":"repeticao","label":"Repetição excessiva","tone":"attention"},
    {"id":"referenciacao","label":"Problemas de referenciação","tone":"attention"},
    {"id":"articulacao-periodos","label":"Falhas na articulação entre períodos","tone":"attention"},
    {"id":"articulacao-paragrafos","label":"Falhas na articulação entre parágrafos","tone":"attention"},
    {"id":"coesivos-inadequados","label":"Uso inadequado de mecanismos coesivos","tone":"attention"}]},
  {"id":"c5","numeral":"V","maxScore":200,
   "title":"Elaborar proposta de intervenção para o problema abordado, respeitando os direitos humanos.",
   "levels":[
    {"score":200,"descriptor":"Elabora muito bem proposta de intervenção, detalhada, relacionada ao tema e articulada à discussão desenvolvida no texto."},
    {"score":160,"descriptor":"Elabora bem proposta de intervenção relacionada ao tema e articulada à discussão desenvolvida no texto."},
    {"score":120,"descriptor":"Elabora, de forma mediana, proposta de intervenção relacionada ao tema e articulada à discussão desenvolvida no texto."},
    {"score":80,"descriptor":"Elabora, de forma insuficiente, proposta de intervenção relacionada ao tema, ou não articulada com a discussão desenvolvida no texto."},
    {"score":40,"descriptor":"Apresenta proposta de intervenção vaga, precária ou relacionada apenas ao assunto."},
    {"score":0,"descriptor":"Não apresenta proposta de intervenção ou apresenta proposta não relacionada ao tema ou ao assunto."}],
   "observations":[
    {"id":"agente","label":"Agente","tone":"neutral","options":[
      {"id":"adequado","label":"Presente e adequado","tone":"positive"},
      {"id":"insuficiente","label":"Presente, mas insuficiente","tone":"attention"},
      {"id":"ausente","label":"Ausente","tone":"attention"},
      {"id":"inadequado","label":"Inadequado","tone":"attention"}]},
    {"id":"acao","label":"Ação","tone":"neutral","options":[
      {"id":"adequado","label":"Presente e adequado","tone":"positive"},
      {"id":"insuficiente","label":"Presente, mas insuficiente","tone":"attention"},
      {"id":"ausente","label":"Ausente","tone":"attention"},
      {"id":"inadequado","label":"Inadequado","tone":"attention"}]},
    {"id":"meio","label":"Meio ou modo de execução","tone":"neutral","options":[
      {"id":"adequado","label":"Presente e adequado","tone":"positive"},
      {"id":"insuficiente","label":"Presente, mas insuficiente","tone":"attention"},
      {"id":"ausente","label":"Ausente","tone":"attention"},
      {"id":"inadequado","label":"Inadequado","tone":"attention"}]},
    {"id":"finalidade","label":"Finalidade","tone":"neutral","options":[
      {"id":"adequado","label":"Presente e adequado","tone":"positive"},
      {"id":"insuficiente","label":"Presente, mas insuficiente","tone":"attention"},
      {"id":"ausente","label":"Ausente","tone":"attention"},
      {"id":"inadequado","label":"Inadequado","tone":"attention"}]},
    {"id":"detalhamento","label":"Detalhamento","tone":"neutral","options":[
      {"id":"adequado","label":"Presente e adequado","tone":"positive"},
      {"id":"insuficiente","label":"Presente, mas insuficiente","tone":"attention"},
      {"id":"ausente","label":"Ausente","tone":"attention"},
      {"id":"inadequado","label":"Inadequado","tone":"attention"}]}]}
  ]$rubric$::jsonb,
  $reasons$[
    {"id":"fuga-tema","label":"Fuga total ao tema"},
    {"id":"tipo-textual","label":"Não obediência ao tipo dissertativo-argumentativo"},
    {"id":"ate-7-linhas","label":"Texto com até 7 linhas"},
    {"id":"copia-motivadores","label":"Texto composto apenas por cópia dos textos motivadores"},
    {"id":"parte-desconectada","label":"Parte do texto deliberadamente desconectada do tema"},
    {"id":"improprios","label":"Impropérios, desenhos ou outras formas propositais de anulação"},
    {"id":"lingua-estrangeira","label":"Texto predominantemente em língua estrangeira"},
    {"id":"em-branco","label":"Folha de redação em branco"},
    {"id":"ilegivel","label":"Letra ilegível"}
  ]$reasons$::jsonb);

-- 2. Aplicação: modelo de correção congelado, modalidades e IA ---------------
ALTER TABLE essay_applications
  ADD COLUMN rubric_id uuid REFERENCES essay_rubrics(id) ON DELETE RESTRICT,
  ADD COLUMN rubric_snapshot jsonb,
  ADD COLUMN opens_at timestamptz,
  ADD COLUMN submission_modes text[] NOT NULL DEFAULT ARRAY['typed','upload']
    CHECK (submission_modes <@ ARRAY['typed','upload']),
  ADD COLUMN ai_assist boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_feedback_visible boolean NOT NULL DEFAULT false;

UPDATE essay_applications a
   SET rubric_id = r.id,
       rubric_snapshot = jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name,
         'version', r.version, 'maxScore', r.max_score, 'criteria', r.criteria,
         'annulmentReasons', r.annulment_reasons)
  FROM essay_rubrics r
 WHERE r.institution_id IS NULL AND r.code = 'enem' AND r.version = 1;

-- 3. Situação de cada aluno na aplicação ----------------------------------------
ALTER TABLE essay_application_students
  DROP CONSTRAINT essay_application_students_status_check;
UPDATE essay_application_students SET status = CASE status
  WHEN 'in_review' THEN 'grading' WHEN 'corrected' THEN 'awaiting_approval' ELSE status END;
ALTER TABLE essay_application_students
  ADD CONSTRAINT essay_application_students_status_check CHECK (status IN (
    'pending','draft','submitted','awaiting_ocr','awaiting_ai','awaiting_grading',
    'grading','awaiting_approval','published','returned','absent')),
  -- As colunas reservadas na 106 viram tabelas próprias (abaixo).
  DROP COLUMN submission_storage_key,
  DROP COLUMN submission_mime_type,
  DROP COLUMN competency_scores,
  DROP COLUMN feedback,
  DROP COLUMN corrected_by,
  DROP COLUMN corrected_at,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX essay_application_students_status_idx
  ON essay_application_students (application_id, status);

-- 4. Produções -------------------------------------------------------------------
-- Uma produção por tentativa; a devolução para reescrita abre outra tentativa.
CREATE TABLE essay_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  application_student_id uuid NOT NULL REFERENCES essay_application_students(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  mode text NOT NULL CHECK (mode IN ('typed','upload','teacher_scan')),
  typed_text text NOT NULL DEFAULT '' CHECK (length(typed_text) <= 20000),
  word_count integer NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','returned')),
  revision integer NOT NULL DEFAULT 1,
  return_reason text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_student_id, attempt)
);

CREATE TABLE essay_submission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES essay_submissions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_ref text NOT NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX essay_submission_files_submission_idx ON essay_submission_files (submission_id, position);

-- 5. Texto reconhecido (OCR) e revisado pelo professor ----------------------------
CREATE TABLE essay_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES essay_submissions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  source text NOT NULL CHECK (source IN ('ai','teacher')),
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  text text NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  needs_review boolean NOT NULL DEFAULT false,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version)
);

-- 6. Correções (IA = sugestão; professor = decisão) ----------------------------------
-- scores: [{criterionId, score, observations:{id: true|optionId}, note, evidence:[...], feedback}]
CREATE TABLE essay_gradings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES essay_submissions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ai','teacher')),
  status text NOT NULL CHECK (status IN ('draft','final','superseded','rejected')),
  scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  annulment_reason text NOT NULL DEFAULT '',
  total integer CHECK (total IS NULL OR total >= 0),
  max_score integer NOT NULL,
  comments text NOT NULL DEFAULT '',
  strengths text NOT NULL DEFAULT '',
  improvements text NOT NULL DEFAULT '',
  rewrite_suggestions text NOT NULL DEFAULT '',
  -- Correção do professor feita a partir da sugestão da IA.
  based_on_grading_id uuid REFERENCES essay_gradings(id) ON DELETE SET NULL,
  transcription_id uuid REFERENCES essay_transcriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  prompt_version text NOT NULL DEFAULT '',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES users(id) ON DELETE SET NULL,
  finalized_at timestamptz
);
CREATE INDEX essay_gradings_submission_idx ON essay_gradings (submission_id, kind, created_at DESC);
-- No máximo uma correção do professor em andamento ou final por produção.
CREATE UNIQUE INDEX essay_gradings_teacher_current_idx
  ON essay_gradings (submission_id) WHERE kind = 'teacher' AND status IN ('draft','final');

ALTER TABLE essay_application_students
  ADD COLUMN published_grading_id uuid REFERENCES essay_gradings(id) ON DELETE SET NULL;

-- 7. Fila de processamento (OCR e sugestão da IA) ------------------------------------
-- locked_until é o prazo de posse: se o worker cair, o job volta para a fila.
CREATE TABLE essay_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES essay_submissions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ocr','ai_grading')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  -- Mesma produção + etapa + entrada: não processa (nem cobra) duas vezes.
  idempotency_key text NOT NULL UNIQUE,
  error_message text NOT NULL DEFAULT '',
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX essay_jobs_queue_idx ON essay_jobs (status, next_attempt_at);

-- 8. Uso da IA por instituição (tokens e custo estimado ficam em metadata) ---------
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_kind_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN ('assessment','render','omr','storage','ai'));
