--
-- PostgreSQL database dump
--

\restrict XxgKEiFsTqVyglNIB3Q4UNz2O2Y6m6zWYd5CnaWbKn4xEywSl5zRIXVNmLRamdv

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
    'archived',
    'needs_adjustments'
);


--
-- Name: question_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_type AS ENUM (
    'single_choice',
    'multiple_choice',
    'short_answer',
    'essay',
    'true_false'
);


--
-- Name: assert_result_version_publishable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_result_version_publishable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
END $$;


--
-- Name: publish_legacy_scan_results(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_legacy_scan_results() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
END $$;


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
-- Name: application_result_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_result_settings (
    application_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    min_expected_percent numeric(5,2),
    release_policy text DEFAULT 'summary'::text NOT NULL,
    annulled_questions integer[] DEFAULT '{}'::integer[] NOT NULL,
    annulled_policy text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT application_result_settings_annulled_policy_check CHECK ((annulled_policy = ANY (ARRAY['exclude'::text, 'award_full'::text]))),
    CONSTRAINT application_result_settings_check CHECK (((cardinality(annulled_questions) = 0) OR (annulled_policy IS NOT NULL))),
    CONSTRAINT application_result_settings_min_expected_percent_check CHECK (((min_expected_percent >= (0)::numeric) AND (min_expected_percent <= (100)::numeric))),
    CONSTRAINT application_result_settings_release_policy_check CHECK ((release_policy = ANY (ARRAY['summary'::text, 'answers'::text, 'answers_and_key'::text])))
);


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
-- Name: assessment_result_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_result_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    result_id uuid NOT NULL,
    from_version_id uuid,
    to_version_id uuid NOT NULL,
    question_number integer NOT NULL,
    previous_labels text[] DEFAULT '{}'::text[] NOT NULL,
    new_labels text[] DEFAULT '{}'::text[] NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessment_result_changes_question_number_check CHECK ((question_number > 0))
);


--
-- Name: assessment_result_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_result_publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    result_id uuid NOT NULL,
    result_version_id uuid NOT NULL,
    authorized_by uuid,
    authorizer_name text NOT NULL,
    authorized_at timestamp with time zone DEFAULT now() NOT NULL,
    batch_id uuid,
    legacy boolean DEFAULT false NOT NULL,
    superseded_at timestamp with time zone
);


--
-- Name: TABLE assessment_result_publications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assessment_result_publications IS 'Autorizações de lançamento: quem autorizou, quando e qual versão foi publicada.';


--
-- Name: assessment_result_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_result_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    result_id uuid NOT NULL,
    version_number integer NOT NULL,
    source text NOT NULL,
    card_scan_id uuid,
    submission_id uuid,
    assessment_version_id uuid NOT NULL,
    answer_key_sha256 text NOT NULL,
    scoring_rule jsonb NOT NULL,
    items jsonb NOT NULL,
    question_count integer NOT NULL,
    annulled_count integer DEFAULT 0 NOT NULL,
    valid_count integer NOT NULL,
    correct_count integer NOT NULL,
    incorrect_count integer NOT NULL,
    blank_count integer NOT NULL,
    invalid_count integer NOT NULL,
    review_pending_count integer NOT NULL,
    manual_pending_count integer DEFAULT 0 NOT NULL,
    percent numeric(5,2),
    score numeric(8,2),
    max_score numeric(8,2),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessment_result_versions_annulled_count_check CHECK ((annulled_count >= 0)),
    CONSTRAINT assessment_result_versions_answer_key_sha256_check CHECK ((answer_key_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT assessment_result_versions_blank_count_check CHECK ((blank_count >= 0)),
    CONSTRAINT assessment_result_versions_check CHECK ((((((correct_count + incorrect_count) + blank_count) + invalid_count) + review_pending_count) = valid_count)),
    CONSTRAINT assessment_result_versions_correct_count_check CHECK ((correct_count >= 0)),
    CONSTRAINT assessment_result_versions_incorrect_count_check CHECK ((incorrect_count >= 0)),
    CONSTRAINT assessment_result_versions_invalid_count_check CHECK ((invalid_count >= 0)),
    CONSTRAINT assessment_result_versions_manual_pending_count_check CHECK ((manual_pending_count >= 0)),
    CONSTRAINT assessment_result_versions_percent_check CHECK (((percent >= (0)::numeric) AND (percent <= (100)::numeric))),
    CONSTRAINT assessment_result_versions_question_count_check CHECK ((question_count >= 0)),
    CONSTRAINT assessment_result_versions_review_pending_count_check CHECK ((review_pending_count >= 0)),
    CONSTRAINT assessment_result_versions_source_check CHECK ((source = ANY (ARRAY['omr'::text, 'manual_review'::text, 'recalculation'::text, 'legacy'::text]))),
    CONSTRAINT assessment_result_versions_valid_count_check CHECK ((valid_count >= 0)),
    CONSTRAINT assessment_result_versions_version_number_check CHECK ((version_number > 0))
);


--
-- Name: TABLE assessment_result_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assessment_result_versions IS 'Versões imutáveis do resultado, ligadas ao gabarito (hash) e à regra de pontuação usados.';


--
-- Name: assessment_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    application_student_id uuid NOT NULL,
    current_version_id uuid,
    published_version_id uuid,
    processing_status text DEFAULT 'processing'::text NOT NULL,
    publication_status text DEFAULT 'unpublished'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessment_results_check CHECK (((publication_status = 'unpublished'::text) = (published_version_id IS NULL))),
    CONSTRAINT assessment_results_processing_status_check CHECK ((processing_status = ANY (ARRAY['processing'::text, 'needs_review'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT assessment_results_publication_status_check CHECK ((publication_status = ANY (ARRAY['unpublished'::text, 'published'::text, 'republish_required'::text])))
);


--
-- Name: TABLE assessment_results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assessment_results IS 'Resultado de um aluno em uma aplicação. O aluno vê somente published_version_id.';


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
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    revision integer DEFAULT 0 NOT NULL
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
-- Name: assessment_workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    created_by uuid NOT NULL,
    configuration jsonb NOT NULL,
    assessment_id uuid,
    pinned boolean DEFAULT false NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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
-- Name: auth_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rate_limits (
    key_hash text NOT NULL,
    attempts integer NOT NULL,
    window_ends_at timestamp with time zone NOT NULL,
    CONSTRAINT auth_rate_limits_attempts_check CHECK ((attempts > 0)),
    CONSTRAINT auth_rate_limits_key_hash_check CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text))
);


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
    coupon_id uuid,
    coupon_code text,
    base_amount_cents integer,
    discount_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT billing_contracts_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT billing_contracts_discount_cents_check CHECK ((discount_cents >= 0)),
    CONSTRAINT billing_contracts_months_check CHECK ((months = ANY (ARRAY[1, 12])))
);


--
-- Name: billing_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value integer NOT NULL,
    plan_id text,
    cycle_months integer,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    max_redemptions integer,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_coupons_check CHECK (((discount_type <> 'percent'::text) OR (discount_value <= 100))),
    CONSTRAINT billing_coupons_check1 CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT billing_coupons_code_check CHECK ((code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'::text)),
    CONSTRAINT billing_coupons_cycle_months_check CHECK ((cycle_months = ANY (ARRAY[1, 12]))),
    CONSTRAINT billing_coupons_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))),
    CONSTRAINT billing_coupons_discount_value_check CHECK ((discount_value > 0)),
    CONSTRAINT billing_coupons_max_redemptions_check CHECK (((max_redemptions IS NULL) OR (max_redemptions > 0)))
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
    upload_sha256 text,
    expected_application_id uuid,
    discarded_at timestamp with time zone,
    discarded_by uuid,
    image_ref text,
    review_image_ref text,
    CONSTRAINT card_scans_check CHECK ((source_pages >= source_page)),
    CONSTRAINT card_scans_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'application/pdf'::text]))),
    CONSTRAINT card_scans_source_page_check CHECK ((source_page >= 1)),
    CONSTRAINT card_scans_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'review'::text, 'failed'::text, 'discarded'::text])))
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
-- Name: class_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    code_hash text NOT NULL,
    code_hint text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone,
    school_id uuid
);


--
-- Name: class_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    invite_id uuid,
    institution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    student_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    source text DEFAULT 'invite'::text NOT NULL,
    CONSTRAINT class_join_requests_source_check CHECK (((source = ANY (ARRAY['invite'::text, 'access_code'::text])) AND ((source = 'access_code'::text) OR (invite_id IS NOT NULL)))),
    CONSTRAINT class_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: class_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_memberships (
    class_id uuid NOT NULL,
    user_id uuid NOT NULL,
    access_role text NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_memberships_access_role_check CHECK ((access_role = ANY (ARRAY['owner'::text, 'teacher'::text, 'coordinator'::text])))
);


--
-- Name: class_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_subjects (
    class_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_subjects_subject_check CHECK (((length(TRIM(BOTH FROM subject)) >= 2) AND (length(TRIM(BOTH FROM subject)) <= 80)))
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
    school_id uuid,
    school_stage_id uuid,
    shift text DEFAULT ''::text NOT NULL,
    created_by uuid,
    archived_at timestamp with time zone,
    copied_from_class_id uuid,
    CONSTRAINT classes_school_year_check CHECK (((school_year >= 2000) AND (school_year <= 2100))),
    CONSTRAINT classes_shift_check CHECK ((shift = ANY (ARRAY[''::text, 'manha'::text, 'tarde'::text, 'noite'::text, 'integral'::text])))
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
    source_key text,
    source_metadata jsonb
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
    selfie_data_url text DEFAULT ''::text NOT NULL,
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_header_default boolean DEFAULT false NOT NULL
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: escolas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escolas (
    inep_code text NOT NULL,
    name text NOT NULL,
    name_normalized text NOT NULL,
    school_type text DEFAULT ''::text NOT NULL,
    cnpj text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    address_number text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    state character(2) NOT NULL,
    postal_code text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    census_year integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT escolas_inep_code_check CHECK ((inep_code ~ '^[0-9]{8}$'::text)),
    CONSTRAINT escolas_school_type_check CHECK ((school_type = ANY (ARRAY[''::text, 'federal'::text, 'estadual'::text, 'municipal'::text, 'privada'::text]))),
    CONSTRAINT escolas_state_check CHECK ((state = ANY (ARRAY['AC'::bpchar, 'AL'::bpchar, 'AP'::bpchar, 'AM'::bpchar, 'BA'::bpchar, 'CE'::bpchar, 'DF'::bpchar, 'ES'::bpchar, 'GO'::bpchar, 'MA'::bpchar, 'MT'::bpchar, 'MS'::bpchar, 'MG'::bpchar, 'PA'::bpchar, 'PB'::bpchar, 'PR'::bpchar, 'PE'::bpchar, 'PI'::bpchar, 'RJ'::bpchar, 'RN'::bpchar, 'RS'::bpchar, 'RO'::bpchar, 'RR'::bpchar, 'SC'::bpchar, 'SP'::bpchar, 'SE'::bpchar, 'TO'::bpchar])))
);


--
-- Name: essay_application_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.essay_application_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    student_id uuid NOT NULL,
    student_number integer,
    status text DEFAULT 'pending'::text NOT NULL,
    submission_storage_key text,
    submission_mime_type text,
    submitted_at timestamp with time zone,
    competency_scores jsonb,
    total_score integer,
    feedback text DEFAULT ''::text NOT NULL,
    corrected_by uuid,
    corrected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT essay_application_students_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'in_review'::text, 'corrected'::text, 'absent'::text]))),
    CONSTRAINT essay_application_students_submission_mime_type_check CHECK (((submission_mime_type IS NULL) OR (submission_mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'application/pdf'::text])))),
    CONSTRAINT essay_application_students_total_score_check CHECK (((total_score IS NULL) OR ((total_score >= 0) AND (total_score <= 1000))))
);


--
-- Name: essay_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.essay_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    prompt_id uuid NOT NULL,
    class_id uuid NOT NULL,
    created_by uuid NOT NULL,
    applied_on date NOT NULL,
    due_at timestamp with time zone,
    status text DEFAULT 'scheduled'::text NOT NULL,
    available_to_students boolean DEFAULT false NOT NULL,
    sheet_options jsonb DEFAULT '{}'::jsonb NOT NULL,
    prompt_snapshot jsonb NOT NULL,
    prompt_revision integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT essay_applications_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'open'::text, 'closed'::text, 'cancelled'::text])))
);


--
-- Name: essay_motivating_texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.essay_motivating_texts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prompt_id uuid NOT NULL,
    "position" integer NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content jsonb DEFAULT '[]'::jsonb NOT NULL,
    author text DEFAULT ''::text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    bibliographic_reference text DEFAULT ''::text NOT NULL,
    url text DEFAULT ''::text NOT NULL,
    image_data_url text DEFAULT ''::text NOT NULL,
    image_alt text DEFAULT ''::text NOT NULL,
    image_caption text DEFAULT ''::text NOT NULL,
    image_width text DEFAULT 'large'::text NOT NULL,
    CONSTRAINT essay_motivating_texts_content_check CHECK ((jsonb_typeof(content) = 'array'::text)),
    CONSTRAINT essay_motivating_texts_image_width_check CHECK ((image_width = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text, 'full'::text]))),
    CONSTRAINT essay_motivating_texts_position_check CHECK (("position" > 0))
);


--
-- Name: essay_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.essay_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text NOT NULL,
    theme text NOT NULL,
    thematic_axis text DEFAULT ''::text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    reference_institution text DEFAULT ''::text NOT NULL,
    reference_year integer,
    essay_type text DEFAULT 'dissertativo-argumentativo'::text NOT NULL,
    production_command text DEFAULT ''::text NOT NULL,
    student_guidance text DEFAULT ''::text NOT NULL,
    min_lines integer DEFAULT 7 NOT NULL,
    max_lines integer DEFAULT 30 NOT NULL,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    duplicated_from uuid,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT essay_prompts_check CHECK ((min_lines <= max_lines)),
    CONSTRAINT essay_prompts_max_lines_check CHECK (((max_lines >= 5) AND (max_lines <= 90))),
    CONSTRAINT essay_prompts_min_lines_check CHECK (((min_lines >= 1) AND (min_lines <= 90))),
    CONSTRAINT essay_prompts_reference_year_check CHECK (((reference_year IS NULL) OR ((reference_year >= 1900) AND (reference_year <= 2100)))),
    CONSTRAINT essay_prompts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT essay_prompts_theme_check CHECK (((length(TRIM(BOTH FROM theme)) >= 3) AND (length(TRIM(BOTH FROM theme)) <= 400))),
    CONSTRAINT essay_prompts_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 3) AND (length(TRIM(BOTH FROM title)) <= 200)))
);


--
-- Name: etapas_escola; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etapas_escola (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    etapa text NOT NULL,
    ano_agrupamento text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT etapas_escola_etapa_check CHECK ((etapa = ANY (ARRAY['infantil'::text, 'fundamental_iniciais'::text, 'fundamental_finais'::text, 'medio'::text, 'eja'::text, 'tecnico'::text])))
);


--
-- Name: exam_ai_daily_admissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_ai_daily_admissions (
    usage_day date NOT NULL,
    exam_import_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    CONSTRAINT exam_import_documents_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['database'::text, 'filesystem'::text, 'object_storage'::text, 's3'::text])))
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
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_provider text,
    CONSTRAINT exam_import_jobs_ai_provider_check CHECK ((ai_provider = ANY (ARRAY['gemini'::text, 'deepseek'::text, 'openai'::text, 'local_demo'::text]))),
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
-- Name: google_session_exchange_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_session_exchange_codes (
    code_hash text NOT NULL,
    session_id uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:02:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'coordinator'::text, 'teacher'::text, 'student'::text])))
);


--
-- Name: mobile_google_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_google_login_attempts (
    id uuid NOT NULL,
    ticket_hash text NOT NULL,
    token_hash text NOT NULL,
    state_hash text,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    account_type text DEFAULT 'educator'::text NOT NULL,
    CONSTRAINT mobile_google_login_attempts_account_type_check CHECK ((account_type = ANY (ARRAY['educator'::text, 'student'::text]))),
    CONSTRAINT mobile_google_login_attempts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT mobile_google_login_attempts_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: mobile_mutations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mobile_mutations (
    institution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    kind text NOT NULL,
    entity_id uuid NOT NULL,
    payload_hash text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mobile_mutations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mobile_mutations IS 'Receipts for durable mobile corrections; replaying a request returns its original result.';


--
-- Name: oauth_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_login_attempts (
    state_hash text NOT NULL,
    browser_hash text NOT NULL,
    verifier text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    cpf_hash text,
    account_type text DEFAULT 'educator'::text NOT NULL,
    purpose text DEFAULT 'login'::text NOT NULL,
    user_id uuid,
    CONSTRAINT oauth_login_attempts_account_type_check CHECK ((account_type = ANY (ARRAY['educator'::text, 'student'::text]))),
    CONSTRAINT oauth_login_attempts_purpose_check CHECK ((purpose = ANY (ARRAY['login'::text, 'link'::text])))
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
-- Name: pedagogical_topic_cleanup_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedagogical_topic_cleanup_backups (
    topic_id uuid NOT NULL,
    migration text NOT NULL,
    topic jsonb NOT NULL,
    skill_links jsonb NOT NULL,
    removed_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    source_reference text,
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
-- Name: performance_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    result_id uuid NOT NULL,
    result_version_id uuid,
    status text NOT NULL,
    reasons text[] DEFAULT '{}'::text[] NOT NULL,
    other_reason text,
    actions text[] DEFAULT '{}'::text[] NOT NULL,
    internal_note text,
    student_guidance text,
    student_guidance_published boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT performance_followups_actions_check CHECK ((actions <@ ARRAY['content_review'::text, 'targeted_exercises'::text, 'individual_support'::text, 'recovery'::text, 'new_assessment'::text])),
    CONSTRAINT performance_followups_check CHECK (((status = 'pending'::text) OR (cardinality(reasons) > 0))),
    CONSTRAINT performance_followups_check1 CHECK (((NOT ('other'::text = ANY (reasons))) OR (length(TRIM(BOTH FROM COALESCE(other_reason, ''::text))) > 0))),
    CONSTRAINT performance_followups_check2 CHECK (((NOT student_guidance_published) OR (length(TRIM(BOTH FROM COALESCE(student_guidance, ''::text))) > 0))),
    CONSTRAINT performance_followups_internal_note_check CHECK (((internal_note IS NULL) OR (length(internal_note) <= 4000))),
    CONSTRAINT performance_followups_other_reason_check CHECK (((other_reason IS NULL) OR (length(other_reason) <= 1000))),
    CONSTRAINT performance_followups_reasons_check CHECK ((reasons <@ ARRAY['content_comprehension'::text, 'reading_interpretation'::text, 'attendance'::text, 'prior_content'::text, 'incomplete_assessment'::text, 'application_incident'::text, 'other'::text])),
    CONSTRAINT performance_followups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'justified'::text]))),
    CONSTRAINT performance_followups_student_guidance_check CHECK (((student_guidance IS NULL) OR (length(student_guidance) <= 4000)))
);


--
-- Name: performance_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    school_id uuid,
    subject text,
    min_expected_percent numeric(5,2) NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT performance_thresholds_min_expected_percent_check CHECK (((min_expected_percent >= (0)::numeric) AND (min_expected_percent <= (100)::numeric))),
    CONSTRAINT performance_thresholds_subject_check CHECK (((subject IS NULL) OR ((length(TRIM(BOTH FROM subject)) >= 2) AND (length(TRIM(BOTH FROM subject)) <= 80))))
);


--
-- Name: portal_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portal_settings (
    id integer NOT NULL,
    question_bank_id uuid NOT NULL,
    maintenance_enabled boolean DEFAULT false NOT NULL,
    maintenance_message text DEFAULT 'Estamos realizando melhorias no UfaProva. Volte em breve.'::text NOT NULL,
    CONSTRAINT portal_settings_id_check CHECK ((id = 1))
);


--
-- Name: question_editor_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_editor_drafts (
    id uuid NOT NULL,
    institution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    payload jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT question_editor_drafts_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT question_editor_drafts_version_check CHECK ((version > 0))
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
    recommend_single_column boolean DEFAULT false NOT NULL,
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
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: student_account_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_account_links (
    institution_id uuid NOT NULL,
    user_id uuid NOT NULL,
    student_id uuid NOT NULL,
    linked_by uuid NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    registration text DEFAULT ''::text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    access_code text,
    teacher_id uuid,
    selfie_data_url text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'ativo'::text,
    adapted_exam boolean DEFAULT false NOT NULL,
    birth_date date,
    observation text DEFAULT ''::text NOT NULL,
    access_code_used_at timestamp with time zone,
    CONSTRAINT students_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'transferido'::text, 'remanejado'::text, 'atestado'::text, 'regime_domiciliar'::text])))
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
    monthly_price_cents integer,
    annual_price_cents integer,
    CONSTRAINT subscription_plans_annual_price_cents_check CHECK (((annual_price_cents IS NULL) OR (annual_price_cents > 0))),
    CONSTRAINT subscription_plans_concurrent_imports_check CHECK ((concurrent_imports > 0)),
    CONSTRAINT subscription_plans_concurrent_renders_check CHECK ((concurrent_renders > 0)),
    CONSTRAINT subscription_plans_max_students_check CHECK ((max_students > 0)),
    CONSTRAINT subscription_plans_monthly_assessments_check CHECK ((monthly_assessments > 0)),
    CONSTRAINT subscription_plans_monthly_price_cents_check CHECK (((monthly_price_cents IS NULL) OR (monthly_price_cents > 0))),
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
    user_agent text,
    active_institution_id uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash text,
    active boolean DEFAULT true NOT NULL,
    google_subject text,
    cpf_hash text,
    portal_admin boolean DEFAULT false NOT NULL,
    portal_editor boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    email_verification_required boolean DEFAULT false NOT NULL,
    account_type text DEFAULT 'educator'::text NOT NULL,
    CONSTRAINT users_account_type_check CHECK ((account_type = ANY (ARRAY['educator'::text, 'student'::text]))),
    CONSTRAINT users_email_required_check CHECK (((email IS NOT NULL) OR (account_type = 'student'::text)))
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
-- Name: application_result_settings application_result_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_result_settings
    ADD CONSTRAINT application_result_settings_pkey PRIMARY KEY (application_id);


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
-- Name: assessment_result_changes assessment_result_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_changes
    ADD CONSTRAINT assessment_result_changes_pkey PRIMARY KEY (id);


--
-- Name: assessment_result_publications assessment_result_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_publications
    ADD CONSTRAINT assessment_result_publications_pkey PRIMARY KEY (id);


--
-- Name: assessment_result_publications assessment_result_publications_result_version_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_publications
    ADD CONSTRAINT assessment_result_publications_result_version_id_key UNIQUE (result_version_id);


--
-- Name: assessment_result_versions assessment_result_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_pkey PRIMARY KEY (id);


--
-- Name: assessment_result_versions assessment_result_versions_result_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_result_id_version_number_key UNIQUE (result_id, version_number);


--
-- Name: assessment_results assessment_results_application_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_application_student_id_key UNIQUE (application_student_id);


--
-- Name: assessment_results assessment_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_pkey PRIMARY KEY (id);


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
-- Name: assessment_workspaces assessment_workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_workspaces
    ADD CONSTRAINT assessment_workspaces_pkey PRIMARY KEY (id);


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
-- Name: auth_rate_limits auth_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_rate_limits
    ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (key_hash);


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
-- Name: billing_coupons billing_coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_coupons
    ADD CONSTRAINT billing_coupons_code_key UNIQUE (code);


--
-- Name: billing_coupons billing_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_coupons
    ADD CONSTRAINT billing_coupons_pkey PRIMARY KEY (id);


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
-- Name: class_invites class_invites_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invites
    ADD CONSTRAINT class_invites_code_hash_key UNIQUE (code_hash);


--
-- Name: class_invites class_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invites
    ADD CONSTRAINT class_invites_pkey PRIMARY KEY (id);


--
-- Name: class_join_requests class_join_requests_class_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_class_id_user_id_key UNIQUE (class_id, user_id);


--
-- Name: class_join_requests class_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_pkey PRIMARY KEY (id);


--
-- Name: class_memberships class_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_memberships
    ADD CONSTRAINT class_memberships_pkey PRIMARY KEY (class_id, user_id);


--
-- Name: class_subjects class_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_pkey PRIMARY KEY (class_id, teacher_id, subject);


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
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: escolas escolas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escolas
    ADD CONSTRAINT escolas_pkey PRIMARY KEY (inep_code);


--
-- Name: essay_application_students essay_application_students_application_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_application_students
    ADD CONSTRAINT essay_application_students_application_id_student_id_key UNIQUE (application_id, student_id);


--
-- Name: essay_application_students essay_application_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_application_students
    ADD CONSTRAINT essay_application_students_pkey PRIMARY KEY (id);


--
-- Name: essay_applications essay_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_applications
    ADD CONSTRAINT essay_applications_pkey PRIMARY KEY (id);


--
-- Name: essay_motivating_texts essay_motivating_texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_motivating_texts
    ADD CONSTRAINT essay_motivating_texts_pkey PRIMARY KEY (id);


--
-- Name: essay_motivating_texts essay_motivating_texts_prompt_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_motivating_texts
    ADD CONSTRAINT essay_motivating_texts_prompt_id_position_key UNIQUE (prompt_id, "position") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: essay_prompts essay_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_prompts
    ADD CONSTRAINT essay_prompts_pkey PRIMARY KEY (id);


--
-- Name: etapas_escola etapas_escola_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_escola
    ADD CONSTRAINT etapas_escola_pkey PRIMARY KEY (id);


--
-- Name: etapas_escola etapas_escola_school_id_etapa_ano_agrupamento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_escola
    ADD CONSTRAINT etapas_escola_school_id_etapa_ano_agrupamento_key UNIQUE (school_id, etapa, ano_agrupamento);


--
-- Name: exam_ai_daily_admissions exam_ai_daily_admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_ai_daily_admissions
    ADD CONSTRAINT exam_ai_daily_admissions_pkey PRIMARY KEY (usage_day, exam_import_id);


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
-- Name: google_session_exchange_codes google_session_exchange_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_session_exchange_codes
    ADD CONSTRAINT google_session_exchange_codes_pkey PRIMARY KEY (code_hash);


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
-- Name: mobile_google_login_attempts mobile_google_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_google_login_attempts
    ADD CONSTRAINT mobile_google_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: mobile_google_login_attempts mobile_google_login_attempts_state_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_google_login_attempts
    ADD CONSTRAINT mobile_google_login_attempts_state_hash_key UNIQUE (state_hash);


--
-- Name: mobile_google_login_attempts mobile_google_login_attempts_ticket_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_google_login_attempts
    ADD CONSTRAINT mobile_google_login_attempts_ticket_hash_key UNIQUE (ticket_hash);


--
-- Name: mobile_mutations mobile_mutations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_mutations
    ADD CONSTRAINT mobile_mutations_pkey PRIMARY KEY (institution_id, user_id, request_id);


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
-- Name: pedagogical_topic_cleanup_backups pedagogical_topic_cleanup_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedagogical_topic_cleanup_backups
    ADD CONSTRAINT pedagogical_topic_cleanup_backups_pkey PRIMARY KEY (topic_id);


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
-- Name: performance_followups performance_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_followups
    ADD CONSTRAINT performance_followups_pkey PRIMARY KEY (id);


--
-- Name: performance_thresholds performance_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_thresholds
    ADD CONSTRAINT performance_thresholds_pkey PRIMARY KEY (id);


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
-- Name: question_editor_drafts question_editor_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_editor_drafts
    ADD CONSTRAINT question_editor_drafts_pkey PRIMARY KEY (id);


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
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


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
-- Name: student_account_links student_account_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_account_links
    ADD CONSTRAINT student_account_links_pkey PRIMARY KEY (institution_id, user_id);


--
-- Name: student_account_links student_account_links_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_account_links
    ADD CONSTRAINT student_account_links_student_id_key UNIQUE (student_id);


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
-- Name: assessment_result_changes_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_result_changes_result_idx ON public.assessment_result_changes USING btree (result_id, changed_at DESC);


--
-- Name: assessment_result_publications_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX assessment_result_publications_active_idx ON public.assessment_result_publications USING btree (result_id) WHERE (superseded_at IS NULL);


--
-- Name: assessment_result_versions_scan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_result_versions_scan_idx ON public.assessment_result_versions USING btree (card_scan_id) WHERE (card_scan_id IS NOT NULL);


--
-- Name: assessment_results_institution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_results_institution_idx ON public.assessment_results USING btree (institution_id, publication_status, processing_status);


--
-- Name: assessment_submissions_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_submissions_version_idx ON public.assessment_submissions USING btree (assessment_version_id, submitted_at DESC);


--
-- Name: assessment_workspaces_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_workspaces_owner ON public.assessment_workspaces USING btree (institution_id, created_by, updated_at DESC);


--
-- Name: audit_log_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_tenant_idx ON public.audit_log USING btree (institution_id, created_at DESC);


--
-- Name: auth_rate_limits_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_rate_limits_window_idx ON public.auth_rate_limits USING btree (window_ends_at);


--
-- Name: billing_contracts_coupon_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_contracts_coupon_idx ON public.billing_contracts USING btree (coupon_id) WHERE (coupon_id IS NOT NULL);


--
-- Name: billing_coupons_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_coupons_active_idx ON public.billing_coupons USING btree (active, starts_at, ends_at);


--
-- Name: billing_one_open_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_one_open_contract ON public.billing_contracts USING btree (institution_id) WHERE (status <> 'cancelled'::text);


--
-- Name: card_scans_application_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_application_student_idx ON public.card_scans USING btree (application_student_id, completed_at DESC);


--
-- Name: card_scans_expected_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_expected_application_idx ON public.card_scans USING btree (expected_application_id) WHERE (expected_application_id IS NOT NULL);


--
-- Name: card_scans_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_parent_idx ON public.card_scans USING btree (parent_scan_id, source_page);


--
-- Name: card_scans_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_scans_queue_idx ON public.card_scans USING btree (status, created_at);


--
-- Name: class_invites_active_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX class_invites_active_class_idx ON public.class_invites USING btree (class_id) WHERE active;


--
-- Name: class_join_requests_class_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_join_requests_class_status_idx ON public.class_join_requests USING btree (class_id, status, requested_at);


--
-- Name: class_join_requests_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_join_requests_student_idx ON public.class_join_requests USING btree (student_id) WHERE (student_id IS NOT NULL);


--
-- Name: class_join_requests_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_join_requests_user_idx ON public.class_join_requests USING btree (user_id, status);


--
-- Name: class_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_memberships_user_idx ON public.class_memberships USING btree (user_id, class_id);


--
-- Name: classes_creator_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_creator_year_idx ON public.classes USING btree (created_by, school_year DESC);


--
-- Name: classes_institution_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_institution_year_idx ON public.classes USING btree (institution_id, school_year DESC);


--
-- Name: classes_school_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_school_year_idx ON public.classes USING btree (school_id, school_year DESC);


--
-- Name: curriculum_skills_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curriculum_skills_object_idx ON public.curriculum_skills USING btree (knowledge_object_id);


--
-- Name: curriculum_subjects_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX curriculum_subjects_source_key_idx ON public.curriculum_subjects USING btree (curriculum_version, source_key) WHERE (source_key IS NOT NULL);


--
-- Name: educator_schools_one_header_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX educator_schools_one_header_default_idx ON public.educator_schools USING btree (user_id) WHERE is_header_default;


--
-- Name: educator_schools_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX educator_schools_user_idx ON public.educator_schools USING btree (user_id);


--
-- Name: email_verification_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_user_idx ON public.email_verification_tokens USING btree (user_id, created_at);


--
-- Name: escolas_name_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escolas_name_normalized_idx ON public.escolas USING btree (name_normalized text_pattern_ops);


--
-- Name: escolas_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escolas_state_idx ON public.escolas USING btree (state);


--
-- Name: escolas_state_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX escolas_state_name_idx ON public.escolas USING btree (state, name_normalized text_pattern_ops);


--
-- Name: essay_application_students_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX essay_application_students_student_idx ON public.essay_application_students USING btree (student_id);


--
-- Name: essay_applications_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX essay_applications_class_idx ON public.essay_applications USING btree (class_id);


--
-- Name: essay_applications_institution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX essay_applications_institution_idx ON public.essay_applications USING btree (institution_id, applied_on DESC, created_at DESC);


--
-- Name: essay_applications_prompt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX essay_applications_prompt_idx ON public.essay_applications USING btree (prompt_id);


--
-- Name: essay_prompts_institution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX essay_prompts_institution_idx ON public.essay_prompts USING btree (institution_id, status, updated_at DESC);


--
-- Name: essay_prompts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX essay_prompts_owner_idx ON public.essay_prompts USING btree (institution_id, created_by, updated_at DESC);


--
-- Name: etapas_escola_school_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etapas_escola_school_idx ON public.etapas_escola USING btree (school_id, etapa);


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
-- Name: exam_import_jobs_ready_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_import_jobs_ready_idx ON public.exam_import_jobs USING btree (next_attempt_at) WHERE (status = 'queued'::text);


--
-- Name: exam_imports_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exam_imports_tenant_status_idx ON public.exam_imports USING btree (institution_id, status, created_at DESC);


--
-- Name: google_session_exchange_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX google_session_exchange_expiry_idx ON public.google_session_exchange_codes USING btree (expires_at);


--
-- Name: knowledge_objects_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX knowledge_objects_source_key_idx ON public.knowledge_objects USING btree (subject_id, source_key) WHERE (source_key IS NOT NULL);


--
-- Name: knowledge_objects_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX knowledge_objects_subject_idx ON public.knowledge_objects USING btree (subject_id, grade_range);


--
-- Name: mobile_google_login_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mobile_google_login_expiry_idx ON public.mobile_google_login_attempts USING btree (expires_at);


--
-- Name: oauth_login_attempts_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oauth_login_attempts_user_id_idx ON public.oauth_login_attempts USING btree (user_id) WHERE (user_id IS NOT NULL);


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

CREATE UNIQUE INDEX pedagogical_topics_root_unique ON public.pedagogical_topics USING btree (discipline_id, lower(name), COALESCE(grade_range, ''::text)) WHERE (parent_id IS NULL);


--
-- Name: performance_followups_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX performance_followups_result_idx ON public.performance_followups USING btree (result_id, created_at DESC);


--
-- Name: performance_thresholds_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX performance_thresholds_scope_idx ON public.performance_thresholds USING btree (institution_id, COALESCE(school_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(lower(subject), ''::text));


--
-- Name: question_editor_drafts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_editor_drafts_owner_idx ON public.question_editor_drafts USING btree (institution_id, user_id, updated_at DESC) WHERE (completed_at IS NULL);


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
-- Name: students_access_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX students_access_code_unique ON public.students USING btree (lower(access_code));


--
-- Name: students_institution_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_institution_name_idx ON public.students USING btree (institution_id, name);


--
-- Name: students_institution_registration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX students_institution_registration_idx ON public.students USING btree (institution_id, registration) WHERE (registration <> ''::text);


--
-- Name: students_teacher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_teacher_idx ON public.students USING btree (teacher_id, institution_id);


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
-- Name: assessment_result_publications assessment_result_publications_publishable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_result_publications_publishable BEFORE INSERT ON public.assessment_result_publications FOR EACH ROW EXECUTE FUNCTION public.assert_result_version_publishable();


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
-- Name: application_result_settings application_result_settings_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_result_settings
    ADD CONSTRAINT application_result_settings_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.assessment_applications(id) ON DELETE CASCADE;


--
-- Name: application_result_settings application_result_settings_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_result_settings
    ADD CONSTRAINT application_result_settings_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: application_result_settings application_result_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_result_settings
    ADD CONSTRAINT application_result_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: assessment_result_changes assessment_result_changes_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_changes
    ADD CONSTRAINT assessment_result_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: assessment_result_changes assessment_result_changes_from_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_changes
    ADD CONSTRAINT assessment_result_changes_from_version_id_fkey FOREIGN KEY (from_version_id) REFERENCES public.assessment_result_versions(id) ON DELETE RESTRICT;


--
-- Name: assessment_result_changes assessment_result_changes_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_changes
    ADD CONSTRAINT assessment_result_changes_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.assessment_results(id) ON DELETE CASCADE;


--
-- Name: assessment_result_changes assessment_result_changes_to_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_changes
    ADD CONSTRAINT assessment_result_changes_to_version_id_fkey FOREIGN KEY (to_version_id) REFERENCES public.assessment_result_versions(id) ON DELETE RESTRICT;


--
-- Name: assessment_result_publications assessment_result_publications_authorized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_publications
    ADD CONSTRAINT assessment_result_publications_authorized_by_fkey FOREIGN KEY (authorized_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: assessment_result_publications assessment_result_publications_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_publications
    ADD CONSTRAINT assessment_result_publications_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.assessment_results(id) ON DELETE CASCADE;


--
-- Name: assessment_result_publications assessment_result_publications_result_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_publications
    ADD CONSTRAINT assessment_result_publications_result_version_id_fkey FOREIGN KEY (result_version_id) REFERENCES public.assessment_result_versions(id) ON DELETE RESTRICT;


--
-- Name: assessment_result_versions assessment_result_versions_assessment_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_assessment_version_id_fkey FOREIGN KEY (assessment_version_id) REFERENCES public.assessment_versions(id) ON DELETE RESTRICT;


--
-- Name: assessment_result_versions assessment_result_versions_card_scan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_card_scan_id_fkey FOREIGN KEY (card_scan_id) REFERENCES public.card_scans(id) ON DELETE SET NULL;


--
-- Name: assessment_result_versions assessment_result_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: assessment_result_versions assessment_result_versions_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.assessment_results(id) ON DELETE CASCADE;


--
-- Name: assessment_result_versions assessment_result_versions_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_result_versions
    ADD CONSTRAINT assessment_result_versions_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.assessment_submissions(id) ON DELETE SET NULL;


--
-- Name: assessment_results assessment_results_application_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_application_student_id_fkey FOREIGN KEY (application_student_id) REFERENCES public.application_students(id) ON DELETE CASCADE;


--
-- Name: assessment_results assessment_results_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_current_version_fk FOREIGN KEY (current_version_id) REFERENCES public.assessment_result_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: assessment_results assessment_results_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: assessment_results assessment_results_published_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_published_version_fk FOREIGN KEY (published_version_id) REFERENCES public.assessment_result_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


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
-- Name: assessment_workspaces assessment_workspaces_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_workspaces
    ADD CONSTRAINT assessment_workspaces_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id);


--
-- Name: assessment_workspaces assessment_workspaces_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_workspaces
    ADD CONSTRAINT assessment_workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: assessment_workspaces assessment_workspaces_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_workspaces
    ADD CONSTRAINT assessment_workspaces_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


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
-- Name: billing_contracts billing_contracts_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_contracts
    ADD CONSTRAINT billing_contracts_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.billing_coupons(id) ON DELETE SET NULL;


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
-- Name: billing_coupons billing_coupons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_coupons
    ADD CONSTRAINT billing_coupons_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: billing_coupons billing_coupons_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_coupons
    ADD CONSTRAINT billing_coupons_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


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
-- Name: card_scans card_scans_discarded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_discarded_by_fkey FOREIGN KEY (discarded_by) REFERENCES public.users(id);


--
-- Name: card_scans card_scans_expected_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_scans
    ADD CONSTRAINT card_scans_expected_application_id_fkey FOREIGN KEY (expected_application_id) REFERENCES public.assessment_applications(id) ON DELETE RESTRICT;


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
-- Name: class_invites class_invites_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invites
    ADD CONSTRAINT class_invites_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_invites class_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invites
    ADD CONSTRAINT class_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: class_invites class_invites_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invites
    ADD CONSTRAINT class_invites_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: class_invites class_invites_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_invites
    ADD CONSTRAINT class_invites_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.educator_schools(id) ON DELETE RESTRICT;


--
-- Name: class_join_requests class_join_requests_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_join_requests class_join_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id);


--
-- Name: class_join_requests class_join_requests_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: class_join_requests class_join_requests_invite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.class_invites(id) ON DELETE RESTRICT;


--
-- Name: class_join_requests class_join_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: class_join_requests class_join_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_join_requests
    ADD CONSTRAINT class_join_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: class_memberships class_memberships_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_memberships
    ADD CONSTRAINT class_memberships_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_memberships class_memberships_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_memberships
    ADD CONSTRAINT class_memberships_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: class_memberships class_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_memberships
    ADD CONSTRAINT class_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: classes classes_copied_from_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_copied_from_class_id_fkey FOREIGN KEY (copied_from_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- Name: classes classes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: classes classes_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.educator_schools(id) ON DELETE SET NULL;


--
-- Name: classes classes_school_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_stage_id_fkey FOREIGN KEY (school_stage_id) REFERENCES public.etapas_escola(id) ON DELETE SET NULL;


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
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: essay_application_students essay_application_students_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_application_students
    ADD CONSTRAINT essay_application_students_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.essay_applications(id) ON DELETE CASCADE;


--
-- Name: essay_application_students essay_application_students_corrected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_application_students
    ADD CONSTRAINT essay_application_students_corrected_by_fkey FOREIGN KEY (corrected_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: essay_application_students essay_application_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_application_students
    ADD CONSTRAINT essay_application_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: essay_applications essay_applications_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_applications
    ADD CONSTRAINT essay_applications_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;


--
-- Name: essay_applications essay_applications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_applications
    ADD CONSTRAINT essay_applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: essay_applications essay_applications_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_applications
    ADD CONSTRAINT essay_applications_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: essay_applications essay_applications_prompt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_applications
    ADD CONSTRAINT essay_applications_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.essay_prompts(id) ON DELETE RESTRICT;


--
-- Name: essay_motivating_texts essay_motivating_texts_prompt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_motivating_texts
    ADD CONSTRAINT essay_motivating_texts_prompt_id_fkey FOREIGN KEY (prompt_id) REFERENCES public.essay_prompts(id) ON DELETE CASCADE;


--
-- Name: essay_prompts essay_prompts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_prompts
    ADD CONSTRAINT essay_prompts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: essay_prompts essay_prompts_duplicated_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_prompts
    ADD CONSTRAINT essay_prompts_duplicated_from_fkey FOREIGN KEY (duplicated_from) REFERENCES public.essay_prompts(id) ON DELETE SET NULL;


--
-- Name: essay_prompts essay_prompts_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.essay_prompts
    ADD CONSTRAINT essay_prompts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: etapas_escola etapas_escola_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_escola
    ADD CONSTRAINT etapas_escola_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.educator_schools(id) ON DELETE CASCADE;


--
-- Name: exam_ai_daily_admissions exam_ai_daily_admissions_exam_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_ai_daily_admissions
    ADD CONSTRAINT exam_ai_daily_admissions_exam_import_id_fkey FOREIGN KEY (exam_import_id) REFERENCES public.exam_imports(id) ON DELETE CASCADE;


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
-- Name: google_session_exchange_codes google_session_exchange_codes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_session_exchange_codes
    ADD CONSTRAINT google_session_exchange_codes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_sessions(id) ON DELETE CASCADE;


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
-- Name: mobile_mutations mobile_mutations_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_mutations
    ADD CONSTRAINT mobile_mutations_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: mobile_mutations mobile_mutations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mobile_mutations
    ADD CONSTRAINT mobile_mutations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_login_attempts oauth_login_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_login_attempts
    ADD CONSTRAINT oauth_login_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


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
-- Name: performance_followups performance_followups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_followups
    ADD CONSTRAINT performance_followups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: performance_followups performance_followups_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_followups
    ADD CONSTRAINT performance_followups_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: performance_followups performance_followups_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_followups
    ADD CONSTRAINT performance_followups_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.assessment_results(id) ON DELETE CASCADE;


--
-- Name: performance_followups performance_followups_result_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_followups
    ADD CONSTRAINT performance_followups_result_version_id_fkey FOREIGN KEY (result_version_id) REFERENCES public.assessment_result_versions(id) ON DELETE RESTRICT;


--
-- Name: performance_thresholds performance_thresholds_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_thresholds
    ADD CONSTRAINT performance_thresholds_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: performance_thresholds performance_thresholds_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_thresholds
    ADD CONSTRAINT performance_thresholds_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.educator_schools(id) ON DELETE CASCADE;


--
-- Name: performance_thresholds performance_thresholds_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_thresholds
    ADD CONSTRAINT performance_thresholds_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: portal_settings portal_settings_question_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portal_settings
    ADD CONSTRAINT portal_settings_question_bank_id_fkey FOREIGN KEY (question_bank_id) REFERENCES public.institutions(id);


--
-- Name: question_editor_drafts question_editor_drafts_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_editor_drafts
    ADD CONSTRAINT question_editor_drafts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id);


--
-- Name: question_editor_drafts question_editor_drafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_editor_drafts
    ADD CONSTRAINT question_editor_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


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
-- Name: student_account_links student_account_links_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_account_links
    ADD CONSTRAINT student_account_links_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: student_account_links student_account_links_linked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_account_links
    ADD CONSTRAINT student_account_links_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES public.users(id);


--
-- Name: student_account_links student_account_links_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_account_links
    ADD CONSTRAINT student_account_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: student_account_links student_account_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_account_links
    ADD CONSTRAINT student_account_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: students students_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: students students_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: user_sessions user_sessions_active_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_active_institution_id_fkey FOREIGN KEY (active_institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict XxgKEiFsTqVyglNIB3Q4UNz2O2Y6m6zWYd5CnaWbKn4xEywSl5zRIXVNmLRamdv

