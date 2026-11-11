-- Gestão Acadêmica, fase 1: ano letivo como entidade, matrícula com histórico
-- e eventos acadêmicos imutáveis.
--
-- Compatibilidade: class_enrollments continua sendo a lista operacional da
-- turma (correção de cartões, app mobile, aplicações e relatórios seguem
-- lendo dela). student_enrollments é o registro histórico, alimentado por
-- triggers a partir de class_enrollments; tirar o aluno da turma encerra a
-- matrícula histórica em vez de apagá-la. classes.school_year também fica,
-- e o academic_year_id é preenchido automaticamente a partir dele.
--
-- Exclusão: as tabelas novas usam ON DELETE RESTRICT. Registros históricos
-- (matrículas e eventos) não podem ser apagados; a única exceção é a limpeza
-- explícita de dados de teste/suporte com
--   SET LOCAL ufaprova.allow_history_purge = 'on';

-- 1. Anos letivos -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','closing','closed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (institution_id, year),
  -- Necessária para as FKs compostas que impedem misturar instituições.
  UNIQUE (institution_id, id),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  CHECK (status NOT IN ('closed','archived') OR closed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS academic_years_institution_status_idx
  ON academic_years(institution_id, status);

-- Um ano letivo existente para cada (instituição, school_year) já usado.
-- Nenhum é encerrado automaticamente: encerrar bloqueia resultados e exige o
-- fluxo de encerramento (fase 2). Todos entram como 'active'.
INSERT INTO academic_years(institution_id, year, status, created_at)
SELECT institution_id, school_year, 'active', min(created_at)
FROM classes
GROUP BY institution_id, school_year
ON CONFLICT (institution_id, year) DO NOTHING;

-- 2. Turmas ligadas ao ano letivo -----------------------------------------
ALTER TABLE classes ADD COLUMN IF NOT EXISTS academic_year_id uuid;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;
ALTER TABLE classes ADD CONSTRAINT classes_status_check
  CHECK (status IN ('active','closed','archived'));
-- Turmas já arquivadas mantêm o estado.
UPDATE classes SET status = 'archived' WHERE archived_at IS NOT NULL AND status = 'active';

UPDATE classes c SET academic_year_id = ay.id
FROM academic_years ay
WHERE c.academic_year_id IS NULL
  AND ay.institution_id = c.institution_id AND ay.year = c.school_year;

ALTER TABLE classes ALTER COLUMN academic_year_id SET NOT NULL;
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_academic_year_fkey;
ALTER TABLE classes ADD CONSTRAINT classes_academic_year_fkey
  FOREIGN KEY (institution_id, academic_year_id)
  REFERENCES academic_years(institution_id, id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS classes_academic_year_idx ON classes(academic_year_id);
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_institution_id_unique_pair;
ALTER TABLE classes ADD CONSTRAINT classes_institution_id_unique_pair UNIQUE (institution_id, id);

-- Mantém academic_year_id coerente com school_year e impede reutilizar uma
-- turma em outro ano letivo depois que ela tem matrículas ou provas.
CREATE OR REPLACE FUNCTION classes_sync_academic_year() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  year_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.school_year IS DISTINCT FROM OLD.school_year THEN
    IF EXISTS (SELECT 1 FROM student_enrollments WHERE class_id = OLD.id)
       OR EXISTS (SELECT 1 FROM assessment_applications WHERE class_id = OLD.id) THEN
      RAISE EXCEPTION 'A turma já tem matrículas ou provas e não pode mudar de ano letivo. Crie uma nova turma.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.academic_year_id := NULL;
  END IF;
  IF NEW.academic_year_id IS NULL THEN
    INSERT INTO academic_years(institution_id, year, status, created_by)
    VALUES (NEW.institution_id, NEW.school_year, 'active', NEW.created_by)
    ON CONFLICT (institution_id, year) DO NOTHING;
    SELECT id INTO year_id FROM academic_years
    WHERE institution_id = NEW.institution_id AND year = NEW.school_year;
    NEW.academic_year_id := year_id;
  ELSE
    SELECT year INTO NEW.school_year FROM academic_years
    WHERE id = NEW.academic_year_id AND institution_id = NEW.institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ano letivo não pertence à instituição da turma.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM academic_years WHERE id = NEW.academic_year_id
             AND status IN ('closed','archived'))
     AND (TG_OP = 'INSERT' OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id) THEN
    RAISE EXCEPTION 'O ano letivo % está encerrado; não é possível incluir turmas nele.', NEW.school_year
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS classes_sync_academic_year_trg ON classes;
CREATE TRIGGER classes_sync_academic_year_trg
  BEFORE INSERT OR UPDATE OF school_year, academic_year_id ON classes
  FOR EACH ROW EXECUTE FUNCTION classes_sync_academic_year();

-- 3. Matrículas históricas ------------------------------------------------
CREATE TABLE IF NOT EXISTS student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- SET NULL só cobre a exclusão de turma vazia criada por engano (turmas com
  -- provas não podem ser excluídas). O retrato da turma fica nas colunas
  -- class_name/grade_level.
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  academic_year_id uuid NOT NULL,
  class_name text NOT NULL,
  grade_level text NOT NULL,
  enrollment_number text NOT NULL DEFAULT '',
  call_number integer CHECK (call_number > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','transferred','dropped','cancelled')),
  academic_outcome text NOT NULL DEFAULT 'pending'
    CHECK (academic_outcome IN ('pending','promoted','retained','transferred',
                                'dropped','recovery','graduated','cancelled')),
  entry_date date NOT NULL DEFAULT current_date,
  exit_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, academic_year_id)
    REFERENCES academic_years(institution_id, id) ON DELETE RESTRICT,
  CHECK (exit_date IS NULL OR exit_date >= entry_date),
  CHECK ((status = 'active') = (exit_date IS NULL))
);
-- Uma única matrícula ativa por aluno em cada turma.
CREATE UNIQUE INDEX IF NOT EXISTS student_enrollments_active_class_idx
  ON student_enrollments(student_id, class_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS student_enrollments_student_idx
  ON student_enrollments(student_id, entry_date);
CREATE INDEX IF NOT EXISTS student_enrollments_year_idx
  ON student_enrollments(academic_year_id, status);
CREATE INDEX IF NOT EXISTS student_enrollments_class_idx
  ON student_enrollments(class_id) WHERE class_id IS NOT NULL;

-- 4. Eventos acadêmicos (somente inclusão) ---------------------------------
CREATE TABLE IF NOT EXISTS academic_events (
  id bigserial PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id uuid REFERENCES students(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES student_enrollments(id) ON DELETE RESTRICT,
  academic_year_id uuid REFERENCES academic_years(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'enrollment_created','enrollment_closed','outcome_changed',
    'year_created','year_updated','year_status_changed',
    'promotion','retention','transfer_out','transfer_in','graduation',
    'reversal','year_reopened')),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  before_data jsonb,
  after_data jsonb,
  reverses_event_id bigint REFERENCES academic_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS academic_events_student_idx
  ON academic_events(student_id, created_at);
CREATE INDEX IF NOT EXISTS academic_events_institution_idx
  ON academic_events(institution_id, created_at);

-- Bloqueia exclusão de histórico e alteração de eventos.
CREATE OR REPLACE FUNCTION academic_history_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('ufaprova.allow_history_purge', true) = 'on' THEN
    RETURN COALESCE(OLD, NEW);
  END IF;
  IF TG_TABLE_NAME = 'academic_events' THEN
    RAISE EXCEPTION 'Eventos acadêmicos não podem ser alterados nem excluídos; registre uma reversão.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RAISE EXCEPTION 'Matrículas históricas não podem ser excluídas; encerre a matrícula.'
    USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS academic_events_guard_trg ON academic_events;
CREATE TRIGGER academic_events_guard_trg
  BEFORE UPDATE OR DELETE ON academic_events
  FOR EACH ROW EXECUTE FUNCTION academic_history_guard();
DROP TRIGGER IF EXISTS student_enrollments_guard_trg ON student_enrollments;
CREATE TRIGGER student_enrollments_guard_trg
  BEFORE DELETE ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION academic_history_guard();

-- Matrícula encerrada não volta a ficar ativa por UPDATE direto: reabertura
-- é uma nova matrícula ou uma reversão administrativa registrada (fase 3).
CREATE OR REPLACE FUNCTION student_enrollments_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.student_id <> NEW.student_id OR OLD.institution_id <> NEW.institution_id
     OR OLD.academic_year_id <> NEW.academic_year_id OR OLD.entry_date <> NEW.entry_date THEN
    RAISE EXCEPTION 'Aluno, instituição, ano letivo e data de entrada da matrícula são imutáveis.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'active' AND NEW.status = 'active'
     AND current_setting('ufaprova.allow_enrollment_reversal', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Matrícula encerrada só pode ser reativada por reversão administrativa.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS student_enrollments_before_update_trg ON student_enrollments;
CREATE TRIGGER student_enrollments_before_update_trg
  BEFORE UPDATE ON student_enrollments
  FOR EACH ROW EXECUTE FUNCTION student_enrollments_before_update();

-- Backfill: cada linha atual de class_enrollments vira uma matrícula ativa.
INSERT INTO student_enrollments(student_id, institution_id, class_id, academic_year_id,
  class_name, grade_level, enrollment_number, call_number, entry_date, created_at)
SELECT ce.student_id, c.institution_id, c.id, c.academic_year_id, c.name, c.grade,
       s.registration, ce.number, c.created_at::date, c.created_at
FROM class_enrollments ce
JOIN classes c ON c.id = ce.class_id
JOIN students s ON s.id = ce.student_id
WHERE NOT EXISTS (
  SELECT 1 FROM student_enrollments se
  WHERE se.student_id = ce.student_id AND se.class_id = ce.class_id AND se.status = 'active');

-- 5. Sincronização class_enrollments -> student_enrollments ----------------
CREATE OR REPLACE FUNCTION class_enrollments_sync_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  enrollment student_enrollments%ROWTYPE;
  actor uuid := nullif(current_setting('ufaprova.actor_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
               WHERE c.id = NEW.class_id AND ay.status IN ('closed','archived')) THEN
      RAISE EXCEPTION 'O ano letivo desta turma está encerrado; não é possível matricular alunos.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO student_enrollments(student_id, institution_id, class_id, academic_year_id,
      class_name, grade_level, enrollment_number, call_number, created_by)
    SELECT NEW.student_id, c.institution_id, c.id, c.academic_year_id, c.name, c.grade,
           s.registration, NEW.number, actor
    FROM classes c JOIN students s ON s.id = NEW.student_id
    WHERE c.id = NEW.class_id
    ON CONFLICT (student_id, class_id) WHERE status = 'active' DO NOTHING
    RETURNING * INTO enrollment;
    IF enrollment.id IS NOT NULL THEN
      INSERT INTO academic_events(institution_id, student_id, enrollment_id, academic_year_id,
        event_type, actor_id, after_data)
      VALUES (enrollment.institution_id, enrollment.student_id, enrollment.id,
        enrollment.academic_year_id, 'enrollment_created', actor,
        jsonb_build_object('class_id', enrollment.class_id, 'class_name', enrollment.class_name));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE student_enrollments SET call_number = NEW.number
    WHERE student_id = NEW.student_id AND class_id = NEW.class_id AND status = 'active';
    RETURN NEW;
  END IF;
  -- DELETE: encerra (não apaga) a matrícula histórica.
  UPDATE student_enrollments SET
    status = CASE WHEN academic_outcome IN ('pending','recovery','cancelled') THEN 'cancelled'
                  WHEN academic_outcome = 'transferred' THEN 'transferred'
                  WHEN academic_outcome = 'dropped' THEN 'dropped'
                  ELSE 'completed' END,
    exit_date = greatest(current_date, entry_date)
  WHERE student_id = OLD.student_id AND class_id = OLD.class_id AND status = 'active'
  RETURNING * INTO enrollment;
  IF enrollment.id IS NOT NULL THEN
    INSERT INTO academic_events(institution_id, student_id, enrollment_id, academic_year_id,
      event_type, actor_id, after_data)
    VALUES (enrollment.institution_id, enrollment.student_id, enrollment.id,
      enrollment.academic_year_id, 'enrollment_closed', actor,
      jsonb_build_object('status', enrollment.status, 'class_name', enrollment.class_name));
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS class_enrollments_sync_history_trg ON class_enrollments;
CREATE TRIGGER class_enrollments_sync_history_trg
  AFTER INSERT OR UPDATE OF number OR DELETE ON class_enrollments
  FOR EACH ROW EXECUTE FUNCTION class_enrollments_sync_history();

-- 6. Vínculos institucionais com período (sem apagar o histórico) ----------
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_status_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('pending','active','revoked'));
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT current_date;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- 7. Auditoria com antes/depois e motivo -----------------------------------
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS before_data jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS after_data jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity_type, entity_id);

-- 8. Validação: aborta a migração se o backfill ficou incompleto.
DO $$
DECLARE missing_years bigint; missing_enrollments bigint;
BEGIN
  SELECT count(*) INTO missing_years FROM classes WHERE academic_year_id IS NULL;
  SELECT count(*) INTO missing_enrollments FROM class_enrollments ce
  WHERE NOT EXISTS (SELECT 1 FROM student_enrollments se
                    WHERE se.student_id = ce.student_id AND se.class_id = ce.class_id
                      AND se.status = 'active');
  IF missing_years > 0 OR missing_enrollments > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % turmas sem ano letivo, % matrículas sem histórico',
      missing_years, missing_enrollments;
  END IF;
END $$;
