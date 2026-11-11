-- Gestão Acadêmica, fase 2: encerramento do ano letivo.
--
-- Em ano letivo encerrado ou arquivado, notas e aplicações das turmas desse
-- ano ficam somente para consulta: não se cria nem se altera resultado,
-- versão de nota, publicação ou aplicação. Correções excepcionais (por
-- exemplo, exclusão total ou descarte pelo administrador) ligam, dentro da
-- própria transação,
--   SET LOCAL ufaprova.allow_closed_year_changes = 'on';
-- e ficam no audit_log. Reabrir o ano (somente administrador) libera tudo.

ALTER TABLE academic_events DROP CONSTRAINT IF EXISTS academic_events_event_type_check;
ALTER TABLE academic_events ADD CONSTRAINT academic_events_event_type_check CHECK (event_type IN (
  'enrollment_created','enrollment_closed','outcome_changed',
  'year_created','year_updated','year_status_changed','year_closed',
  'promotion','retention','transfer_out','transfer_in','graduation',
  'reversal','year_reopened'));

-- Ano da turma está fechado para alterações?
CREATE OR REPLACE FUNCTION class_year_locked(target_class uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
    WHERE c.id = target_class AND ay.status IN ('closing','closed','archived'))
$$;

CREATE OR REPLACE FUNCTION closed_year_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_class uuid;
  row_data record := COALESCE(NEW, OLD);
BEGIN
  IF current_setting('ufaprova.allow_closed_year_changes', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_TABLE_NAME = 'assessment_applications' THEN
    target_class := row_data.class_id;
  ELSIF TG_TABLE_NAME = 'assessment_results' THEN
    SELECT aa.class_id INTO target_class
    FROM application_students aps JOIN assessment_applications aa ON aa.id = aps.application_id
    WHERE aps.id = row_data.application_student_id;
  ELSE
    -- assessment_result_versions e assessment_result_publications
    SELECT aa.class_id INTO target_class
    FROM assessment_results ar
    JOIN application_students aps ON aps.id = ar.application_student_id
    JOIN assessment_applications aa ON aa.id = aps.application_id
    WHERE ar.id = row_data.result_id;
  END IF;
  IF target_class IS NOT NULL AND class_year_locked(target_class) THEN
    RAISE EXCEPTION 'O ano letivo desta turma está encerrado: provas e notas ficam somente para consulta. Peça ao administrador a reabertura excepcional.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS assessment_applications_closed_year_trg ON assessment_applications;
CREATE TRIGGER assessment_applications_closed_year_trg
  BEFORE INSERT OR UPDATE ON assessment_applications
  FOR EACH ROW EXECUTE FUNCTION closed_year_guard();
DROP TRIGGER IF EXISTS assessment_results_closed_year_trg ON assessment_results;
CREATE TRIGGER assessment_results_closed_year_trg
  BEFORE INSERT OR UPDATE OR DELETE ON assessment_results
  FOR EACH ROW EXECUTE FUNCTION closed_year_guard();
DROP TRIGGER IF EXISTS assessment_result_versions_closed_year_trg ON assessment_result_versions;
CREATE TRIGGER assessment_result_versions_closed_year_trg
  BEFORE INSERT OR DELETE ON assessment_result_versions
  FOR EACH ROW EXECUTE FUNCTION closed_year_guard();
DROP TRIGGER IF EXISTS assessment_result_publications_closed_year_trg ON assessment_result_publications;
CREATE TRIGGER assessment_result_publications_closed_year_trg
  BEFORE INSERT OR UPDATE OR DELETE ON assessment_result_publications
  FOR EACH ROW EXECUTE FUNCTION closed_year_guard();
