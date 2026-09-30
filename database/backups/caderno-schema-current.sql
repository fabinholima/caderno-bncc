--
-- PostgreSQL database dump
--

\restrict JUIYxJGFdvjguL8FlEkQTzKupy4dbzNNzfBI6O7xvvBIjgKrQjSdxXv2m7E7HgZ

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: difficulty_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.difficulty_level AS ENUM (
    'easy',
    'medium',
    'hard'
);


--
-- Name: question_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_status AS ENUM (
    'draft',
    'review',
    'approved',
    'archived'
);


--
-- Name: question_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_type AS ENUM (
    'single_choice',
    'multiple_choice',
    'short_answer',
    'essay'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alternatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alternatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    revision integer NOT NULL,
    stable_key text NOT NULL,
    content jsonb NOT NULL,
    is_correct boolean DEFAULT false NOT NULL,
    "position" integer NOT NULL
);


--
-- Name: COLUMN alternatives.is_correct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.alternatives.is_correct IS 'A cardinalidade de respostas corretas é validada pela aplicação conforme question_revisions.type.';


--
-- Name: application_report_render_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_report_render_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_snapshot_id uuid NOT NULL,
    renderer text DEFAULT 'context-lmtx'::text NOT NULL,
    template_version text DEFAULT 'class-report-v1'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    output_manifest jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT application_report_render_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: application_report_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_report_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    version integer NOT NULL,
    schema_version text DEFAULT '1.0'::text NOT NULL,
    snapshot jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scope_type text DEFAULT 'class'::text NOT NULL,
    student_id uuid,
    CONSTRAINT application_report_snapshots_scope_check CHECK ((((scope_type = 'class'::text) AND (student_id IS NULL)) OR ((scope_type = 'student'::text) AND (student_id IS NOT NULL)))),
    CONSTRAINT application_report_snapshots_scope_type_check CHECK ((scope_type = ANY (ARRAY['class'::text, 'student'::text]))),
    CONSTRAINT application_report_snapshots_version_check CHECK ((version > 0))
);


--
-- Name: COLUMN application_report_snapshots.snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_report_snapshots.snapshot IS 'Fotografia estatística imutável usada para reproduzir o relatório da turma.';


--
-- Name: application_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    student_id uuid NOT NULL,
    assessment_version_id uuid NOT NULL,
    qr_payload text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assessment_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    assessment_id uuid NOT NULL,
    class_id uuid NOT NULL,
    scheduled_at timestamp with time zone,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessment_applications_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'open'::text, 'closed'::text, 'cancelled'::text])))
);


--
-- Name: assessment_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    configuration jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessment_presets_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)))
);


--
-- Name: TABLE assessment_presets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assessment_presets IS 'Configurações reutilizáveis de cabeçalho e impressão privadas por professor dentro da instituição.';


--
-- Name: assessment_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_version_id uuid NOT NULL,
    candidate jsonb DEFAULT '{}'::jsonb NOT NULL,
    responses jsonb NOT NULL,
    result jsonb NOT NULL,
    score numeric(8,2) DEFAULT 0 NOT NULL,
    max_score numeric(8,2) DEFAULT 0 NOT NULL,
    requires_manual_review boolean DEFAULT false NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE assessment_submissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assessment_submissions IS 'Respostas vinculadas a uma versão imutável da avaliação; o resultado automático usa o gabarito congelado dessa versão.';


--
-- Name: assessment_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    code text NOT NULL,
    seed bigint NOT NULL,
    snapshot jsonb NOT NULL,
    answer_key jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN assessment_versions.snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.assessment_versions.snapshot IS 'Fotografia imutável de conteúdo, ordem, pontos e metadados entregue ao renderizador.';


--
-- Name: assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    title text NOT NULL,
    subject text NOT NULL,
    grade text NOT NULL,
    instructions text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'frozen'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    institution_id uuid,
    user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: billing_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    plan_id text NOT NULL,
    months integer NOT NULL,
    amount_cents integer NOT NULL,
    provider_id text,
    checkout_url text,
    status text DEFAULT 'creating'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_contracts_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT billing_contracts_months_check CHECK ((months = ANY (ARRAY[1, 12])))
);


--
-- Name: billing_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_payments (
    provider_id text NOT NULL,
    contract_id uuid NOT NULL,
    status text NOT NULL,
    amount_cents integer NOT NULL,
    paid_at timestamp with time zone,
    access_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    refund_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT billing_payments_refund_cents_check CHECK ((refund_cents >= 0))
);


--
-- Name: billing_refund_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_refund_events (
    id bigint NOT NULL,
    payment_id text NOT NULL,
    cumulative_cents integer NOT NULL,
    amount_cents integer NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_refund_events_amount_cents_check CHECK ((amount_cents > 0))
);


--
-- Name: billing_refund_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.billing_refund_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: billing_refund_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.billing_refund_events_id_seq OWNED BY public.billing_refund_events.id;


--
-- Name: card_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_scans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    mime_type text NOT NULL,
    image_data bytea NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    application_student_id uuid,
    result jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    submission_id uuid,
    parent_scan_id uuid,
    source_page integer DEFAULT 1 NOT NULL,
    source_pages integer DEFAULT 1 NOT NULL,
    review_image_data bytea,
    CONSTRAINT card_scans_check CHECK ((source_pages >= source_page)),
    CONSTRAINT card_scans_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'application/pdf'::text]))),
    CONSTRAINT card_scans_source_page_check CHECK ((source_page >= 1)),
    CONSTRAINT card_scans_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'review'::text, 'failed'::text])))
);


--
-- Name: COLUMN card_scans.submission_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.card_scans.submission_id IS 'Correção gerada automaticamente após uma leitura OMR sem ambiguidades.';


--
-- Name: COLUMN card_scans.parent_scan_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.card_scans.parent_scan_id IS 'Upload PDF original; as demais páginas são resultados filhos independentes.';


--
-- Name: COLUMN card_scans.review_image_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.card_scans.review_image_data IS 'Imagem PNG normalizada da página, mantida para conferência humana e reprocessamento.';


--
-- Name: class_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_enrollments (
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    number integer,
    CONSTRAINT class_enrollments_number_check CHECK ((number > 0))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    grade text NOT NULL,
    school_year integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classes_school_year_check CHECK (((school_year >= 2000) AND (school_year <= 2100)))
);


--
-- Name: curriculum_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    curriculum_version text DEFAULT 'BNCC-2018'::text NOT NULL,
    source_key text NOT NULL,
    name text NOT NULL,
    stage text NOT NULL,
    source_metadata jsonb
);


--
-- Name: curriculum_competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_competencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    area_id uuid NOT NULL,
    source_key text NOT NULL,
    number integer NOT NULL,
    description text NOT NULL,
    source_metadata jsonb,
    CONSTRAINT curriculum_competencies_number_check CHECK ((number > 0))
);


--
-- Name: TABLE curriculum_competencies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.curriculum_competencies IS 'Competências específicas oficiais, usadas no Ensino Médio em vez de objetos de conhecimento.';


--
-- Name: curriculum_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    curriculum_version text DEFAULT 'BNCC-2018'::text NOT NULL,
    code text NOT NULL,
    stage text NOT NULL,
    subject text NOT NULL,
    grade_range text NOT NULL,
    description text NOT NULL,
    knowledge_object_id uuid,
    dataset_version text,
    validity_status text,
    source_metadata jsonb
);


--
-- Name: COLUMN curriculum_skills.knowledge_object_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.curriculum_skills.knowledge_object_id IS 'Classificação curricular; a questão continua ligada à habilidade por question_skills.';


--
-- Name: curriculum_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    curriculum_version text DEFAULT 'BNCC-2018'::text NOT NULL,
    name text NOT NULL,
    stage text NOT NULL,
    source_key text
);


--
-- Name: educator_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.educator_profiles (
    user_id uuid NOT NULL,
    professional_role text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    subjects text[] DEFAULT '{}'::text[] NOT NULL,
    grades text[] DEFAULT '{}'::text[] NOT NULL,
    stages text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT educator_profiles_professional_role_check CHECK ((professional_role = ANY (ARRAY['teacher'::text, 'coordinator'::text])))
);


--
-- Name: educator_schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.educator_schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    school_type text NOT NULL,
    cnpj text DEFAULT ''::text NOT NULL,
    inep text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    postal_code text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    logo_data_url text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: exam_import_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_import_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_import_id uuid NOT NULL,
    kind text NOT NULL,
    file_name text NOT NULL,
    mime_type text DEFAULT 'application/pdf'::text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    file_data bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_provider text DEFAULT 'database'::text NOT NULL,
    storage_key text,
    CONSTRAINT exam_import_documents_kind_check CHECK ((kind = ANY (ARRAY['exam'::text, 'answer_key'::text]))),
    CONSTRAINT exam_import_documents_mime_type_check CHECK ((mime_type = 'application/pdf'::text)),
    CONSTRAINT exam_import_documents_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT exam_import_documents_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT exam_import_documents_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['database'::text, 'filesystem'::text, 'object_storage'::text])))
);


--
-- Name: exam_import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_import_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    exam_import_id uuid NOT NULL,
    requested_by uuid,
    job_type text DEFAULT 'extract'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT 'queued'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    cancellation_requested boolean DEFAULT false NOT NULL,
    provider text,
    model text,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prompt_version text,
    CONSTRAINT exam_import_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['extract'::text, 'ai_analysis'::text]))),
    CONSTRAINT exam_import_jobs_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
    CONSTRAINT exam_import_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN exam_import_jobs.prompt_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exam_import_jobs.prompt_version IS 'Versao auditavel do prompt usado em analises assistidas por IA.';


--
-- Name: exam_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    created_by uuid NOT NULL,
    source_institution text NOT NULL,
    source_year integer NOT NULL,
    exam_type text NOT NULL,
    subject_mode text NOT NULL,
    primary_subject text,
    source_url text,
    rights_status text DEFAULT 'pending_review'::text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    detected_questions integer DEFAULT 0 NOT NULL,
    reviewed_questions integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    extracted_candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT exam_imports_detected_questions_check CHECK ((detected_questions >= 0)),
    CONSTRAINT exam_imports_exam_type_check CHECK ((exam_type = ANY (ARRAY['vestibular'::text, 'concurso'::text, 'enem'::text, 'simulado'::text, 'other'::text]))),
    CONSTRAINT exam_imports_reviewed_questions_check CHECK ((reviewed_questions >= 0)),
    CONSTRAINT exam_imports_rights_status_check CHECK ((rights_status = ANY (ARRAY['pending_review'::text, 'authorized'::text, 'public_license'::text, 'citation_only'::text, 'restricted'::text, 'blocked'::text]))),
    CONSTRAINT exam_imports_source_year_check CHECK (((source_year >= 1900) AND (source_year <= 2100))),
    CONSTRAINT exam_imports_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'queued'::text, 'extracting'::text, 'extracted'::text, 'needs_review'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT exam_imports_subject_mode_check CHECK ((subject_mode = ANY (ARRAY['single'::text, 'multidisciplinary'::text])))
);


--
-- Name: TABLE exam_imports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.exam_imports IS 'Área editorial isolada para provas anteriores; nenhum item é publicado automaticamente.';


--
-- Name: COLUMN exam_imports.rights_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exam_imports.rights_status IS 'Decisão editorial sobre permissão de uso antes de qualquer publicação.';


--
-- Name: COLUMN exam_imports.extracted_candidates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exam_imports.extracted_candidates IS 'Questões candidatas extraídas do PDF, ainda sujeitas à revisão do professor.';


--
-- Name: institution_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    token_hash text NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT institution_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'coordinator'::text, 'teacher'::text])))
);


--
-- Name: institution_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_subscriptions (
    institution_id uuid NOT NULL,
    plan_id text NOT NULL,
    status text DEFAULT 'trialing'::text NOT NULL,
    period_started_at timestamp with time zone DEFAULT date_trunc('month'::text, now()) NOT NULL,
    period_ends_at timestamp with time zone DEFAULT (date_trunc('month'::text, now()) + '1 mon'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT institution_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text])))
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    name text NOT NULL,
    grade_range text NOT NULL,
    description text,
    source_key text,
    source_metadata jsonb
);


--
-- Name: TABLE knowledge_objects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.knowledge_objects IS 'Objeto de conhecimento reutilizável ao qual uma ou mais habilidades curriculares podem estar ligadas.';


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    institution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'coordinator'::text, 'teacher'::text])))
);


--
-- Name: oauth_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_login_attempts (
    state_hash text NOT NULL,
    browser_hash text NOT NULL,
    verifier text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    cpf_hash text
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pedagogical_discipline_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedagogical_discipline_skills (
    discipline_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    tagged_by uuid NOT NULL,
    rationale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pedagogical_disciplines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedagogical_disciplines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    area_id uuid NOT NULL,
    name text NOT NULL,
    stage text DEFAULT 'Ensino Médio'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pedagogical_disciplines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pedagogical_disciplines IS 'Camada pedagógica institucional; não altera a classificação normativa da BNCC.';


--
-- Name: pedagogical_topic_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedagogical_topic_skills (
    topic_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pedagogical_topic_skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pedagogical_topic_skills IS 'Relação pedagógica institucional entre conteúdos e habilidades oficiais; não altera a BNCC.';


--
-- Name: pedagogical_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedagogical_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    discipline_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    grade_range text,
    active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT pedagogical_topics_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 120))),
    CONSTRAINT pedagogical_topics_position_check CHECK (("position" > 0))
);


--
-- Name: TABLE pedagogical_topics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pedagogical_topics IS 'Hierarquia institucional de tópicos e subtópicos usada para classificar e filtrar questões.';


--
-- Name: COLUMN pedagogical_topics.grade_range; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedagogical_topics.grade_range IS 'Seriação pedagógica institucional; não representa seriação oficial das habilidades da BNCC do Ensino Médio.';


--
-- Name: portal_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_settings (
    id integer NOT NULL,
    question_bank_id uuid NOT NULL,
    CONSTRAINT portal_settings_id_check CHECK ((id = 1))
);


--
-- Name: question_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_revisions (
    question_id uuid NOT NULL,
    revision integer NOT NULL,
    type public.question_type DEFAULT 'single_choice'::public.question_type NOT NULL,
    statement jsonb NOT NULL,
    explanation jsonb,
    difficulty public.difficulty_level DEFAULT 'medium'::public.difficulty_level NOT NULL,
    default_points numeric(8,2) DEFAULT 1 NOT NULL,
    subject text NOT NULL,
    grade text NOT NULL,
    source_institution text,
    source_license text,
    authored_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_year smallint,
    knowledge_topic text,
    pedagogical_topic_id uuid,
    CONSTRAINT question_revisions_default_points_check CHECK ((default_points >= (0)::numeric)),
    CONSTRAINT question_revisions_source_year_check CHECK (((source_year IS NULL) OR ((source_year >= 1900) AND (source_year <= 2100))))
);


--
-- Name: TABLE question_revisions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.question_revisions IS 'Conteúdo versionado e reutilizável; não contém decisões de layout da prova.';


--
-- Name: COLUMN question_revisions.source_institution; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.question_revisions.source_institution IS 'Instituição ou banca de origem da questão, como ENEM, FUVEST, UEMS ou UFMS.';


--
-- Name: COLUMN question_revisions.source_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.question_revisions.source_year IS 'Ano da prova de origem; pertence à revisão da questão e não à disciplina.';


--
-- Name: COLUMN question_revisions.knowledge_topic; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.question_revisions.knowledge_topic IS 'Tema ou objeto pedagógico informado pelo professor; não altera a taxonomia oficial da BNCC.';


--
-- Name: question_saeb_descriptors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_saeb_descriptors (
    question_id uuid NOT NULL,
    revision integer NOT NULL,
    descriptor_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: question_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_skills (
    question_id uuid NOT NULL,
    revision integer NOT NULL,
    skill_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    public_code text NOT NULL,
    current_revision integer DEFAULT 1 NOT NULL,
    status public.question_status DEFAULT 'draft'::public.question_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    duplicate_of_question_id uuid,
    duplicate_detected_at timestamp with time zone,
    duplicate_reason text
);


--
-- Name: render_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.render_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_version_id uuid NOT NULL,
    renderer text DEFAULT 'context-lmtx'::text NOT NULL,
    template_version text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    output_manifest jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    application_student_id uuid,
    CONSTRAINT render_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: saeb_descriptors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saeb_descriptors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    matrix_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    "position" integer NOT NULL,
    source_metadata jsonb,
    CONSTRAINT saeb_descriptors_position_check CHECK (("position" > 0))
);


--
-- Name: TABLE saeb_descriptors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.saeb_descriptors IS 'Descritores oficiais do Saeb; não representam a totalidade do currículo escolar.';


--
-- Name: saeb_matrices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saeb_matrices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_key text NOT NULL,
    name text NOT NULL,
    stage text NOT NULL,
    subject text NOT NULL,
    grade_range text NOT NULL,
    version text NOT NULL,
    source_url text NOT NULL,
    source_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saeb_matrices_stage_check CHECK ((stage = ANY (ARRAY['Ensino Fundamental'::text, 'Ensino Médio'::text])))
);


--
-- Name: TABLE saeb_matrices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.saeb_matrices IS 'Matrizes de referência do Saeb para as etapas avaliadas, mantidas separadas do currículo BNCC.';


--
-- Name: saeb_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saeb_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    matrix_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT saeb_topics_position_check CHECK (("position" > 0))
);


--
-- Name: skill_competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_competencies (
    skill_id uuid NOT NULL,
    competency_id uuid NOT NULL
);


--
-- Name: skill_knowledge_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_knowledge_objects (
    skill_id uuid NOT NULL,
    knowledge_object_id uuid NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    CONSTRAINT skill_knowledge_objects_position_check CHECK (("position" > 0))
);


--
-- Name: TABLE skill_knowledge_objects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skill_knowledge_objects IS 'Relação N:N oficial entre habilidades e objetos de conhecimento da BNCC.';


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    registration text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id text NOT NULL,
    name text NOT NULL,
    monthly_assessments integer NOT NULL,
    max_students integer NOT NULL,
    storage_mb integer NOT NULL,
    concurrent_renders integer NOT NULL,
    concurrent_imports integer DEFAULT 1 NOT NULL,
    CONSTRAINT subscription_plans_concurrent_imports_check CHECK ((concurrent_imports > 0)),
    CONSTRAINT subscription_plans_concurrent_renders_check CHECK ((concurrent_renders > 0)),
    CONSTRAINT subscription_plans_max_students_check CHECK ((max_students > 0)),
    CONSTRAINT subscription_plans_monthly_assessments_check CHECK ((monthly_assessments > 0)),
    CONSTRAINT subscription_plans_storage_mb_check CHECK ((storage_mb > 0))
);


--
-- Name: usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_events (
    id bigint NOT NULL,
    institution_id uuid NOT NULL,
    user_id uuid,
    kind text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_events_kind_check CHECK ((kind = ANY (ARRAY['assessment'::text, 'render'::text, 'omr'::text, 'storage'::text]))),
    CONSTRAINT usage_events_quantity_check CHECK ((quantity > 0))
);


--
-- Name: usage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usage_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usage_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_events_id_seq OWNED BY public.usage_events.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    global_bank boolean DEFAULT false NOT NULL,
    last_ip inet,
    user_agent text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    active boolean DEFAULT true NOT NULL,
    google_subject text,
    cpf_hash text,
    portal_admin boolean DEFAULT false NOT NULL,
    portal_editor boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: billing_refund_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refund_events ALTER COLUMN id SET DEFAULT nextval('public.billing_refund_events_id_seq'::regclass);


--
-- Name: usage_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events ALTER COLUMN id SET DEFAULT nextval('public.usage_events_id_seq'::regclass);


--
-- Name: alternatives alternatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternatives
    ADD CONSTRAINT alternatives_pkey PRIMARY KEY (id);


--
-- Name: alternatives alternatives_question_id_revision_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternatives
    ADD CONSTRAINT alternatives_question_id_revision_position_key UNIQUE (question_id, revision, "position");


--
-- Name: alternatives alternatives_question_id_revision_stable_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternatives
    ADD CONSTRAINT alternatives_question_id_revision_stable_key_key UNIQUE (question_id, revision, stable_key);


--
-- Name: application_report_render_jobs application_report_render_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_report_render_jobs
    ADD CONSTRAINT application_report_render_jobs_pkey PRIMARY KEY (id);


--
-- Name: application_report_snapshots application_report_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_report_snapshots
    ADD CONSTRAINT application_report_snapshots_pkey PRIMARY KEY (id);


--
-- Name: application_students application_students_application_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_students
    ADD CONSTRAINT application_students_application_id_student_id_key UNIQUE (application_id, student_id);


--
-- Name: application_students application_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_students
    ADD CONSTRAINT application_students_pkey PRIMARY KEY (id);


--
-- Name: application_students application_students_qr_payload_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_students
    ADD CONSTRAINT application_students_qr_payload_key UNIQUE (qr_payload);


--
-- Name: assessment_applications assessment_applications_assessment_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_applications
    ADD CONSTRAINT assessment_applications_assessment_id_class_id_key UNIQUE (assessment_id, class_id);


--
-- Name: assessment_applications assessment_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_applications
    ADD CONSTRAINT assessment_applications_pkey PRIMARY KEY (id);


--
-- Name: assessment_presets assessment_presets_institution_id_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_presets
    ADD CONSTRAINT assessment_presets_institution_id_user_id_name_key UNIQUE (institution_id, user_id, name);


--
-- Name: assessment_presets assessment_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_presets
    ADD CONSTRAINT assessment_presets_pkey PRIMARY KEY (id);


--
-- Name: assessment_submissions assessment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_submissions
    ADD CONSTRAINT assessment_submissions_pkey PRIMARY KEY (id);


--
-- Name: assessment_versions assessment_versions_assessment_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_versions
    ADD CONSTRAINT assessment_versions_assessment_id_code_key UNIQUE (assessment_id, code);


--
-- Name: assessment_versions assessment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_versions
    ADD CONSTRAINT assessment_versions_pkey PRIMARY KEY (id);


--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: billing_contracts billing_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_contracts
    ADD CONSTRAINT billing_contracts_pkey PRIMARY KEY (id);


--
-- Name: billing_contracts billing_contracts_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_contracts
    ADD CONSTRAINT billing_contracts_provider_id_key UNIQUE (provider_id);


--
-- Name: billing_payments billing_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_pkey PRIMARY KEY (provider_id);


--
-- Name: billing_refund_events billing_refund_events_payment_id_cumulative_cents_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refund_events
    ADD CONSTRAINT billing_refund_events_payment_id_cumulative_cents_key UNIQUE (payment_id, cumulative_cents);


--
-- Name: billing_refund_events billing_refund_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refund_events
    ADD CONSTRAINT billing_refund_events_pkey PRIMARY KEY (id);


--
-- Name: card_scans card_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_pkey PRIMARY KEY (id);


--
-- Name: card_scans card_scans_submission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_submission_id_key UNIQUE (submission_id);


--
-- Name: class_enrollments class_enrollments_class_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_class_id_number_key UNIQUE (class_id, number);


--
-- Name: class_enrollments class_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (class_id, student_id);


--
-- Name: classes classes_institution_id_name_school_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_institution_id_name_school_year_key UNIQUE (institution_id, name, school_year);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: curriculum_areas curriculum_areas_curriculum_version_source_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_areas
    ADD CONSTRAINT curriculum_areas_curriculum_version_source_key_key UNIQUE (curriculum_version, source_key);


--
-- Name: curriculum_areas curriculum_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_areas
    ADD CONSTRAINT curriculum_areas_pkey PRIMARY KEY (id);


--
-- Name: curriculum_competencies curriculum_competencies_area_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_competencies
    ADD CONSTRAINT curriculum_competencies_area_id_number_key UNIQUE (area_id, number);


--
-- Name: curriculum_competencies curriculum_competencies_area_id_source_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_competencies
    ADD CONSTRAINT curriculum_competencies_area_id_source_key_key UNIQUE (area_id, source_key);


--
-- Name: curriculum_competencies curriculum_competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_competencies
    ADD CONSTRAINT curriculum_competencies_pkey PRIMARY KEY (id);


--
-- Name: curriculum_skills curriculum_skills_curriculum_version_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_skills
    ADD CONSTRAINT curriculum_skills_curriculum_version_code_key UNIQUE (curriculum_version, code);


--
-- Name: curriculum_skills curriculum_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_skills
    ADD CONSTRAINT curriculum_skills_pkey PRIMARY KEY (id);


--
-- Name: curriculum_subjects curriculum_subjects_curriculum_version_name_stage_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_subjects
    ADD CONSTRAINT curriculum_subjects_curriculum_version_name_stage_key UNIQUE (curriculum_version, name, stage);


--
-- Name: curriculum_subjects curriculum_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_subjects
    ADD CONSTRAINT curriculum_subjects_pkey PRIMARY KEY (id);


--
-- Name: educator_profiles educator_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.educator_profiles
    ADD CONSTRAINT educator_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: educator_schools educator_schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.educator_schools
    ADD CONSTRAINT educator_schools_pkey PRIMARY KEY (id);


--
-- Name: exam_import_documents exam_import_documents_exam_import_id_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_documents
    ADD CONSTRAINT exam_import_documents_exam_import_id_kind_key UNIQUE (exam_import_id, kind);


--
-- Name: exam_import_documents exam_import_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_documents
    ADD CONSTRAINT exam_import_documents_pkey PRIMARY KEY (id);


--
-- Name: exam_import_jobs exam_import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_jobs
    ADD CONSTRAINT exam_import_jobs_pkey PRIMARY KEY (id);


--
-- Name: exam_imports exam_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_imports
    ADD CONSTRAINT exam_imports_pkey PRIMARY KEY (id);


--
-- Name: institution_invitations institution_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_invitations
    ADD CONSTRAINT institution_invitations_pkey PRIMARY KEY (id);


--
-- Name: institution_invitations institution_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_invitations
    ADD CONSTRAINT institution_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: institution_subscriptions institution_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_subscriptions
    ADD CONSTRAINT institution_subscriptions_pkey PRIMARY KEY (institution_id);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: institutions institutions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_slug_key UNIQUE (slug);


--
-- Name: knowledge_objects knowledge_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_objects
    ADD CONSTRAINT knowledge_objects_pkey PRIMARY KEY (id);


--
-- Name: knowledge_objects knowledge_objects_subject_id_name_grade_range_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_objects
    ADD CONSTRAINT knowledge_objects_subject_id_name_grade_range_key UNIQUE (subject_id, name, grade_range);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (institution_id, user_id);


--
-- Name: oauth_login_attempts oauth_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_login_attempts
    ADD CONSTRAINT oauth_login_attempts_pkey PRIMARY KEY (state_hash);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: pedagogical_discipline_skills pedagogical_discipline_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_discipline_skills
    ADD CONSTRAINT pedagogical_discipline_skills_pkey PRIMARY KEY (discipline_id, skill_id);


--
-- Name: pedagogical_disciplines pedagogical_disciplines_institution_id_area_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_disciplines
    ADD CONSTRAINT pedagogical_disciplines_institution_id_area_id_name_key UNIQUE (institution_id, area_id, name);


--
-- Name: pedagogical_disciplines pedagogical_disciplines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_disciplines
    ADD CONSTRAINT pedagogical_disciplines_pkey PRIMARY KEY (id);


--
-- Name: pedagogical_topic_skills pedagogical_topic_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topic_skills
    ADD CONSTRAINT pedagogical_topic_skills_pkey PRIMARY KEY (topic_id, skill_id);


--
-- Name: pedagogical_topics pedagogical_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topics
    ADD CONSTRAINT pedagogical_topics_pkey PRIMARY KEY (id);


--
-- Name: portal_settings portal_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_settings
    ADD CONSTRAINT portal_settings_pkey PRIMARY KEY (id);


--
-- Name: portal_settings portal_settings_question_bank_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_settings
    ADD CONSTRAINT portal_settings_question_bank_id_key UNIQUE (question_bank_id);


--
-- Name: question_revisions question_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_revisions
    ADD CONSTRAINT question_revisions_pkey PRIMARY KEY (question_id, revision);


--
-- Name: question_saeb_descriptors question_saeb_descriptors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_saeb_descriptors
    ADD CONSTRAINT question_saeb_descriptors_pkey PRIMARY KEY (question_id, revision, descriptor_id);


--
-- Name: question_skills question_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_skills
    ADD CONSTRAINT question_skills_pkey PRIMARY KEY (question_id, revision, skill_id);


--
-- Name: questions questions_institution_id_public_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_institution_id_public_code_key UNIQUE (institution_id, public_code);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: render_jobs render_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.render_jobs
    ADD CONSTRAINT render_jobs_pkey PRIMARY KEY (id);


--
-- Name: saeb_descriptors saeb_descriptors_matrix_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_descriptors
    ADD CONSTRAINT saeb_descriptors_matrix_id_code_key UNIQUE (matrix_id, code);


--
-- Name: saeb_descriptors saeb_descriptors_matrix_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_descriptors
    ADD CONSTRAINT saeb_descriptors_matrix_id_position_key UNIQUE (matrix_id, "position");


--
-- Name: saeb_descriptors saeb_descriptors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_descriptors
    ADD CONSTRAINT saeb_descriptors_pkey PRIMARY KEY (id);


--
-- Name: saeb_matrices saeb_matrices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_matrices
    ADD CONSTRAINT saeb_matrices_pkey PRIMARY KEY (id);


--
-- Name: saeb_matrices saeb_matrices_source_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_matrices
    ADD CONSTRAINT saeb_matrices_source_key_key UNIQUE (source_key);


--
-- Name: saeb_topics saeb_topics_matrix_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_topics
    ADD CONSTRAINT saeb_topics_matrix_id_code_key UNIQUE (matrix_id, code);


--
-- Name: saeb_topics saeb_topics_matrix_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_topics
    ADD CONSTRAINT saeb_topics_matrix_id_position_key UNIQUE (matrix_id, "position");


--
-- Name: saeb_topics saeb_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_topics
    ADD CONSTRAINT saeb_topics_pkey PRIMARY KEY (id);


--
-- Name: skill_competencies skill_competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_competencies
    ADD CONSTRAINT skill_competencies_pkey PRIMARY KEY (skill_id, competency_id);


--
-- Name: skill_knowledge_objects skill_knowledge_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_knowledge_objects
    ADD CONSTRAINT skill_knowledge_objects_pkey PRIMARY KEY (skill_id, knowledge_object_id);


--
-- Name: skill_knowledge_objects skill_knowledge_objects_skill_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_knowledge_objects
    ADD CONSTRAINT skill_knowledge_objects_skill_id_position_key UNIQUE (skill_id, "position");


--
-- Name: students students_institution_id_registration_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_institution_id_registration_key UNIQUE (institution_id, registration);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: usage_events usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_subject_key UNIQUE (google_subject);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: application_report_render_jobs_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_report_render_jobs_queue_idx ON public.application_report_render_jobs USING btree (status, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: application_report_snapshots_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_report_snapshots_application_idx ON public.application_report_snapshots USING btree (application_id, version DESC);


--
-- Name: application_report_snapshots_scope_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX application_report_snapshots_scope_version_idx ON public.application_report_snapshots USING btree (application_id, scope_type, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid), version);


--
-- Name: application_students_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_students_application_idx ON public.application_students USING btree (application_id);


--
-- Name: applications_institution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_institution_idx ON public.assessment_applications USING btree (institution_id, created_at DESC);


--
-- Name: assessment_presets_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_presets_owner_idx ON public.assessment_presets USING btree (institution_id, user_id, updated_at DESC);


--
-- Name: assessment_submissions_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_submissions_version_idx ON public.assessment_submissions USING btree (assessment_version_id, submitted_at DESC);


--
-- Name: audit_log_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_tenant_idx ON public.audit_log USING btree (institution_id, created_at DESC);


--
-- Name: billing_one_open_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_one_open_contract ON public.billing_contracts USING btree (institution_id) WHERE (status <> 'cancelled'::text);


--
-- Name: card_scans_application_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_application_student_idx ON public.card_scans USING btree (application_student_id, completed_at DESC);


--
-- Name: card_scans_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_parent_idx ON public.card_scans USING btree (parent_scan_id, source_page);


--
-- Name: card_scans_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_queue_idx ON public.card_scans USING btree (status, created_at);


--
-- Name: classes_institution_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_institution_year_idx ON public.classes USING btree (institution_id, school_year DESC);


--
-- Name: curriculum_skills_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curriculum_skills_object_idx ON public.curriculum_skills USING btree (knowledge_object_id);


--
-- Name: curriculum_subjects_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX curriculum_subjects_source_key_idx ON public.curriculum_subjects USING btree (curriculum_version, source_key) WHERE (source_key IS NOT NULL);


--
-- Name: educator_schools_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX educator_schools_user_idx ON public.educator_schools USING btree (user_id);


--
-- Name: exam_import_documents_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_import_documents_import_idx ON public.exam_import_documents USING btree (exam_import_id, kind);


--
-- Name: exam_import_jobs_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX exam_import_jobs_active_idx ON public.exam_import_jobs USING btree (exam_import_id, job_type) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: exam_import_jobs_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_import_jobs_claim_idx ON public.exam_import_jobs USING btree (status, created_at);


--
-- Name: exam_imports_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_imports_tenant_status_idx ON public.exam_imports USING btree (institution_id, status, created_at DESC);


--
-- Name: knowledge_objects_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_objects_source_key_idx ON public.knowledge_objects USING btree (subject_id, source_key) WHERE (source_key IS NOT NULL);


--
-- Name: knowledge_objects_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_objects_subject_idx ON public.knowledge_objects USING btree (subject_id, grade_range);


--
-- Name: one_primary_saeb_descriptor_per_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_primary_saeb_descriptor_per_revision ON public.question_saeb_descriptors USING btree (question_id, revision) WHERE is_primary;


--
-- Name: one_primary_skill_per_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_primary_skill_per_revision ON public.question_skills USING btree (question_id, revision) WHERE is_primary;


--
-- Name: pedagogical_discipline_skills_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedagogical_discipline_skills_skill_idx ON public.pedagogical_discipline_skills USING btree (skill_id, discipline_id);


--
-- Name: pedagogical_topic_skills_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedagogical_topic_skills_skill_idx ON public.pedagogical_topic_skills USING btree (skill_id, topic_id);


--
-- Name: pedagogical_topics_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedagogical_topics_active_idx ON public.pedagogical_topics USING btree (institution_id, discipline_id, active, grade_range);


--
-- Name: pedagogical_topics_child_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedagogical_topics_child_unique ON public.pedagogical_topics USING btree (parent_id, lower(name)) WHERE (parent_id IS NOT NULL);


--
-- Name: pedagogical_topics_discipline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedagogical_topics_discipline_idx ON public.pedagogical_topics USING btree (institution_id, discipline_id, parent_id, "position");


--
-- Name: pedagogical_topics_root_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pedagogical_topics_root_unique ON public.pedagogical_topics USING btree (discipline_id, lower(name)) WHERE (parent_id IS NULL);


--
-- Name: question_revisions_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_revisions_source_idx ON public.question_revisions USING btree (source_institution, source_year);


--
-- Name: question_skills_skill_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_skills_skill_idx ON public.question_skills USING btree (skill_id);


--
-- Name: questions_duplicate_of_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_duplicate_of_idx ON public.questions USING btree (duplicate_of_question_id) WHERE (duplicate_of_question_id IS NOT NULL);


--
-- Name: questions_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_search_idx ON public.question_revisions USING gin (to_tsvector('portuguese'::regconfig, (statement)::text));


--
-- Name: questions_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_tenant_status_idx ON public.questions USING btree (institution_id, status, updated_at DESC);


--
-- Name: render_jobs_application_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX render_jobs_application_student_idx ON public.render_jobs USING btree (application_student_id) WHERE (application_student_id IS NOT NULL);


--
-- Name: saeb_descriptors_matrix_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saeb_descriptors_matrix_topic_idx ON public.saeb_descriptors USING btree (matrix_id, topic_id, "position");


--
-- Name: skill_competencies_competency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_competencies_competency_idx ON public.skill_competencies USING btree (competency_id, skill_id);


--
-- Name: skill_knowledge_objects_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX skill_knowledge_objects_object_idx ON public.skill_knowledge_objects USING btree (knowledge_object_id, skill_id);


--
-- Name: students_institution_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_institution_name_idx ON public.students USING btree (institution_id, name);


--
-- Name: usage_events_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_events_period_idx ON public.usage_events USING btree (institution_id, created_at);


--
-- Name: user_sessions_last_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_last_ip_idx ON public.user_sessions USING btree (last_ip);


--
-- Name: user_sessions_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_token_idx ON public.user_sessions USING btree (token_hash);


--
-- Name: users_cpf_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_cpf_hash_unique ON public.users USING btree (cpf_hash) WHERE (cpf_hash IS NOT NULL);


--
-- Name: alternatives alternatives_question_id_revision_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alternatives
    ADD CONSTRAINT alternatives_question_id_revision_fkey FOREIGN KEY (question_id, revision) REFERENCES public.question_revisions(question_id, revision) ON DELETE CASCADE;


--
-- Name: application_report_render_jobs application_report_render_jobs_report_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_report_render_jobs
    ADD CONSTRAINT application_report_render_jobs_report_snapshot_id_fkey FOREIGN KEY (report_snapshot_id) REFERENCES public.application_report_snapshots(id) ON DELETE CASCADE;


--
-- Name: application_report_snapshots application_report_snapshots_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_report_snapshots
    ADD CONSTRAINT application_report_snapshots_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.assessment_applications(id) ON DELETE CASCADE;


--
-- Name: application_report_snapshots application_report_snapshots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_report_snapshots
    ADD CONSTRAINT application_report_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: application_report_snapshots application_report_snapshots_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_report_snapshots
    ADD CONSTRAINT application_report_snapshots_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: application_students application_students_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_students
    ADD CONSTRAINT application_students_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.assessment_applications(id) ON DELETE CASCADE;


--
-- Name: application_students application_students_assessment_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_students
    ADD CONSTRAINT application_students_assessment_version_id_fkey FOREIGN KEY (assessment_version_id) REFERENCES public.assessment_versions(id) ON DELETE RESTRICT;


--
-- Name: application_students application_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_students
    ADD CONSTRAINT application_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: assessment_applications assessment_applications_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_applications
    ADD CONSTRAINT assessment_applications_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: assessment_applications assessment_applications_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_applications
    ADD CONSTRAINT assessment_applications_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;


--
-- Name: assessment_applications assessment_applications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_applications
    ADD CONSTRAINT assessment_applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assessment_applications assessment_applications_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_applications
    ADD CONSTRAINT assessment_applications_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: assessment_presets assessment_presets_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_presets
    ADD CONSTRAINT assessment_presets_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: assessment_presets assessment_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_presets
    ADD CONSTRAINT assessment_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: assessment_submissions assessment_submissions_assessment_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_submissions
    ADD CONSTRAINT assessment_submissions_assessment_version_id_fkey FOREIGN KEY (assessment_version_id) REFERENCES public.assessment_versions(id) ON DELETE CASCADE;


--
-- Name: assessment_versions assessment_versions_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_versions
    ADD CONSTRAINT assessment_versions_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assessments assessments_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: billing_contracts billing_contracts_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_contracts
    ADD CONSTRAINT billing_contracts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: billing_contracts billing_contracts_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_contracts
    ADD CONSTRAINT billing_contracts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: billing_payments billing_payments_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.billing_contracts(id);


--
-- Name: billing_refund_events billing_refund_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refund_events
    ADD CONSTRAINT billing_refund_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.billing_payments(provider_id);


--
-- Name: card_scans card_scans_application_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_application_student_id_fkey FOREIGN KEY (application_student_id) REFERENCES public.application_students(id) ON DELETE SET NULL;


--
-- Name: card_scans card_scans_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: card_scans card_scans_parent_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_parent_scan_id_fkey FOREIGN KEY (parent_scan_id) REFERENCES public.card_scans(id) ON DELETE CASCADE;


--
-- Name: card_scans card_scans_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.assessment_submissions(id) ON DELETE SET NULL;


--
-- Name: card_scans card_scans_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: class_enrollments class_enrollments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_enrollments class_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_enrollments
    ADD CONSTRAINT class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: classes classes_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: curriculum_competencies curriculum_competencies_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_competencies
    ADD CONSTRAINT curriculum_competencies_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.curriculum_areas(id) ON DELETE CASCADE;


--
-- Name: curriculum_skills curriculum_skills_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_skills
    ADD CONSTRAINT curriculum_skills_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id);


--
-- Name: educator_profiles educator_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.educator_profiles
    ADD CONSTRAINT educator_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: educator_schools educator_schools_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.educator_schools
    ADD CONSTRAINT educator_schools_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exam_import_documents exam_import_documents_exam_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_documents
    ADD CONSTRAINT exam_import_documents_exam_import_id_fkey FOREIGN KEY (exam_import_id) REFERENCES public.exam_imports(id) ON DELETE CASCADE;


--
-- Name: exam_import_jobs exam_import_jobs_exam_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_jobs
    ADD CONSTRAINT exam_import_jobs_exam_import_id_fkey FOREIGN KEY (exam_import_id) REFERENCES public.exam_imports(id) ON DELETE CASCADE;


--
-- Name: exam_import_jobs exam_import_jobs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_jobs
    ADD CONSTRAINT exam_import_jobs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: exam_import_jobs exam_import_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_import_jobs
    ADD CONSTRAINT exam_import_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: exam_imports exam_imports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_imports
    ADD CONSTRAINT exam_imports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: exam_imports exam_imports_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_imports
    ADD CONSTRAINT exam_imports_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_invitations institution_invitations_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_invitations
    ADD CONSTRAINT institution_invitations_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_invitations institution_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_invitations
    ADD CONSTRAINT institution_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: institution_subscriptions institution_subscriptions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_subscriptions
    ADD CONSTRAINT institution_subscriptions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_subscriptions institution_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_subscriptions
    ADD CONSTRAINT institution_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: knowledge_objects knowledge_objects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_objects
    ADD CONSTRAINT knowledge_objects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.curriculum_subjects(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pedagogical_discipline_skills pedagogical_discipline_skills_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_discipline_skills
    ADD CONSTRAINT pedagogical_discipline_skills_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.pedagogical_disciplines(id) ON DELETE CASCADE;


--
-- Name: pedagogical_discipline_skills pedagogical_discipline_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_discipline_skills
    ADD CONSTRAINT pedagogical_discipline_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.curriculum_skills(id) ON DELETE CASCADE;


--
-- Name: pedagogical_discipline_skills pedagogical_discipline_skills_tagged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_discipline_skills
    ADD CONSTRAINT pedagogical_discipline_skills_tagged_by_fkey FOREIGN KEY (tagged_by) REFERENCES public.users(id);


--
-- Name: pedagogical_disciplines pedagogical_disciplines_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_disciplines
    ADD CONSTRAINT pedagogical_disciplines_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.curriculum_areas(id);


--
-- Name: pedagogical_disciplines pedagogical_disciplines_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_disciplines
    ADD CONSTRAINT pedagogical_disciplines_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: pedagogical_disciplines pedagogical_disciplines_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_disciplines
    ADD CONSTRAINT pedagogical_disciplines_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: pedagogical_topic_skills pedagogical_topic_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topic_skills
    ADD CONSTRAINT pedagogical_topic_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.curriculum_skills(id) ON DELETE CASCADE;


--
-- Name: pedagogical_topic_skills pedagogical_topic_skills_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topic_skills
    ADD CONSTRAINT pedagogical_topic_skills_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.pedagogical_topics(id) ON DELETE CASCADE;


--
-- Name: pedagogical_topics pedagogical_topics_discipline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topics
    ADD CONSTRAINT pedagogical_topics_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.pedagogical_disciplines(id) ON DELETE CASCADE;


--
-- Name: pedagogical_topics pedagogical_topics_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topics
    ADD CONSTRAINT pedagogical_topics_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: pedagogical_topics pedagogical_topics_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topics
    ADD CONSTRAINT pedagogical_topics_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.pedagogical_topics(id) ON DELETE CASCADE;


--
-- Name: pedagogical_topics pedagogical_topics_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topics
    ADD CONSTRAINT pedagogical_topics_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: portal_settings portal_settings_question_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_settings
    ADD CONSTRAINT portal_settings_question_bank_id_fkey FOREIGN KEY (question_bank_id) REFERENCES public.institutions(id);


--
-- Name: question_revisions question_revisions_authored_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_revisions
    ADD CONSTRAINT question_revisions_authored_by_fkey FOREIGN KEY (authored_by) REFERENCES public.users(id);


--
-- Name: question_revisions question_revisions_pedagogical_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_revisions
    ADD CONSTRAINT question_revisions_pedagogical_topic_id_fkey FOREIGN KEY (pedagogical_topic_id) REFERENCES public.pedagogical_topics(id) ON DELETE SET NULL;


--
-- Name: question_revisions question_revisions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_revisions
    ADD CONSTRAINT question_revisions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: question_saeb_descriptors question_saeb_descriptors_descriptor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_saeb_descriptors
    ADD CONSTRAINT question_saeb_descriptors_descriptor_id_fkey FOREIGN KEY (descriptor_id) REFERENCES public.saeb_descriptors(id);


--
-- Name: question_saeb_descriptors question_saeb_descriptors_question_id_revision_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_saeb_descriptors
    ADD CONSTRAINT question_saeb_descriptors_question_id_revision_fkey FOREIGN KEY (question_id, revision) REFERENCES public.question_revisions(question_id, revision) ON DELETE CASCADE;


--
-- Name: question_skills question_skills_question_id_revision_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_skills
    ADD CONSTRAINT question_skills_question_id_revision_fkey FOREIGN KEY (question_id, revision) REFERENCES public.question_revisions(question_id, revision) ON DELETE CASCADE;


--
-- Name: question_skills question_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_skills
    ADD CONSTRAINT question_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.curriculum_skills(id);


--
-- Name: questions questions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: questions questions_duplicate_of_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_duplicate_of_question_id_fkey FOREIGN KEY (duplicate_of_question_id) REFERENCES public.questions(id) ON DELETE RESTRICT;


--
-- Name: questions questions_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: render_jobs render_jobs_application_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.render_jobs
    ADD CONSTRAINT render_jobs_application_student_id_fkey FOREIGN KEY (application_student_id) REFERENCES public.application_students(id) ON DELETE CASCADE;


--
-- Name: render_jobs render_jobs_assessment_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.render_jobs
    ADD CONSTRAINT render_jobs_assessment_version_id_fkey FOREIGN KEY (assessment_version_id) REFERENCES public.assessment_versions(id) ON DELETE CASCADE;


--
-- Name: saeb_descriptors saeb_descriptors_matrix_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_descriptors
    ADD CONSTRAINT saeb_descriptors_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES public.saeb_matrices(id) ON DELETE CASCADE;


--
-- Name: saeb_descriptors saeb_descriptors_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_descriptors
    ADD CONSTRAINT saeb_descriptors_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.saeb_topics(id) ON DELETE CASCADE;


--
-- Name: saeb_topics saeb_topics_matrix_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saeb_topics
    ADD CONSTRAINT saeb_topics_matrix_id_fkey FOREIGN KEY (matrix_id) REFERENCES public.saeb_matrices(id) ON DELETE CASCADE;


--
-- Name: skill_competencies skill_competencies_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_competencies
    ADD CONSTRAINT skill_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.curriculum_competencies(id) ON DELETE CASCADE;


--
-- Name: skill_competencies skill_competencies_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_competencies
    ADD CONSTRAINT skill_competencies_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.curriculum_skills(id) ON DELETE CASCADE;


--
-- Name: skill_knowledge_objects skill_knowledge_objects_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_knowledge_objects
    ADD CONSTRAINT skill_knowledge_objects_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: skill_knowledge_objects skill_knowledge_objects_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_knowledge_objects
    ADD CONSTRAINT skill_knowledge_objects_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.curriculum_skills(id) ON DELETE CASCADE;


--
-- Name: students students_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: usage_events usage_events_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: usage_events usage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_events
    ADD CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict JUIYxJGFdvjguL8FlEkQTzKupy4dbzNNzfBI6O7xvvBIjgKrQjSdxXv2m7E7HgZ
