import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { ownsStudent } from './ownership.mjs';

// Gestão Acadêmica, fase 1: anos letivos e histórico de matrículas.
// A autorização é sempre feita aqui no backend; a interface só reflete.

const fail = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

/** Administração e coordenação da instituição (ou administrador do portal). */
export function canManageAcademicYears(identity) {
  return Boolean(
    identity?.portalAdmin ||
    ['admin', 'coordinator'].includes(identity?.role),
  );
}

function requireManager(identity) {
  if (!canManageAcademicYears(identity))
    throw fail(
      'Somente a administração ou a coordenação da instituição gerencia anos letivos.',
      403,
    );
}

function requireStaff(identity) {
  if (!identity || identity.role === 'student')
    throw fail('Este recurso é exclusivo de professores e gestores.', 403);
}

/** Converte erros das regras do banco (triggers) em respostas HTTP. */
function translateDatabaseError(error) {
  if (error?.code === '23514' || error?.code === '23503')
    return fail(error.message, 409);
  if (error?.code === '42501') return fail(error.message, 403);
  if (error?.code === '23505')
    return fail('Já existe um ano letivo com esse ano nesta instituição.', 409);
  return error;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use datas no formato AAAA-MM-DD.')
  .nullable()
  .optional();

export const academicYearCreateSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    startDate: isoDate,
    endDate: isoDate,
  })
  .strict()
  .refine(
    (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
    'A data de início deve ser anterior à data de término.',
  );

export const academicYearUpdateSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    // Encerrar e arquivar exigem o fluxo de encerramento (fase 2).
    status: z.enum(['planning', 'active']).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.startDate !== undefined ||
      v.endDate !== undefined ||
      v.status !== undefined,
    'Informe o período ou a situação do ano letivo.',
  );

function yearFromRow(row) {
  return {
    id: row.id,
    year: row.year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    classCount: Number(row.class_count ?? 0),
    activeEnrollmentCount: Number(row.active_enrollment_count ?? 0),
  };
}

const yearColumns = `ay.id,ay.year,to_char(ay.start_date,'YYYY-MM-DD') start_date,
  to_char(ay.end_date,'YYYY-MM-DD') end_date,ay.status,ay.created_at,ay.closed_at,
  (SELECT count(*) FROM classes c WHERE c.academic_year_id=ay.id) class_count,
  (SELECT count(*) FROM student_enrollments se WHERE se.academic_year_id=ay.id AND se.status='active') active_enrollment_count`;

export async function listAcademicYears(identity) {
  requireStaff(identity);
  const r = await pool.query(
    `SELECT ${yearColumns} FROM academic_years ay WHERE ay.institution_id=$1 ORDER BY ay.year DESC`,
    [identity.institutionId],
  );
  return r.rows.map(yearFromRow);
}

async function audit(client, identity, action, entityId, before, after, reason) {
  await client.query(
    `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,before_data,after_data,reason)
     VALUES($1,$2,$3,'academic_year',$4,$5,$6,$7)`,
    [
      identity.institutionId,
      identity.userId ?? null,
      action,
      entityId,
      before,
      after,
      reason ?? '',
    ],
  );
}

export async function createAcademicYear(identity, input) {
  requireManager(identity);
  const v = academicYearCreateSchema.parse(input);
  try {
    return await transaction(async (client) => {
      const r = await client.query(
        `INSERT INTO academic_years(institution_id,year,start_date,end_date,status,created_by)
         VALUES($1,$2,$3,$4,'planning',$5) RETURNING id`,
        [
          identity.institutionId,
          v.year,
          v.startDate ?? null,
          v.endDate ?? null,
          identity.userId ?? null,
        ],
      );
      const id = r.rows[0].id;
      const created = await client.query(
        `SELECT ${yearColumns} FROM academic_years ay WHERE ay.id=$1`,
        [id],
      );
      const after = yearFromRow(created.rows[0]);
      await audit(client, identity, 'academic_year.create', id, null, after);
      await client.query(
        `INSERT INTO academic_events(institution_id,academic_year_id,event_type,actor_id,after_data)
         VALUES($1,$2,'year_created',$3,$4)`,
        [identity.institutionId, id, identity.userId ?? null, after],
      );
      return after;
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

export async function updateAcademicYear(identity, yearId, input) {
  requireManager(identity);
  const v = academicYearUpdateSchema.parse(input);
  try {
    return await transaction(async (client) => {
      const current = await client.query(
        `SELECT ${yearColumns} FROM academic_years ay
         WHERE ay.id=$1 AND ay.institution_id=$2 FOR UPDATE OF ay`,
        [yearId, identity.institutionId],
      );
      // Ano de outra instituição responde como inexistente.
      if (!current.rowCount) throw fail('Ano letivo não encontrado.', 404);
      const before = yearFromRow(current.rows[0]);
      if (['closing', 'closed', 'archived'].includes(before.status))
        throw fail(
          'Ano letivo encerrado ou arquivado não pode ser editado; use a reabertura.',
          409,
        );
      const startDate =
        v.startDate !== undefined ? v.startDate : before.startDate;
      const endDate = v.endDate !== undefined ? v.endDate : before.endDate;
      if (startDate && endDate && startDate > endDate)
        throw fail(
          'A data de início deve ser anterior à data de término.',
          422,
        );
      const status = v.status ?? before.status;
      if (
        status === 'planning' &&
        before.status === 'active' &&
        before.activeEnrollmentCount > 0
      )
        throw fail(
          'O ano letivo tem matrículas ativas e não pode voltar para planejamento.',
          409,
        );
      await client.query(
        `UPDATE academic_years SET start_date=$2,end_date=$3,status=$4,updated_at=now() WHERE id=$1`,
        [yearId, startDate, endDate, status],
      );
      const updated = await client.query(
        `SELECT ${yearColumns} FROM academic_years ay WHERE ay.id=$1`,
        [yearId],
      );
      const after = yearFromRow(updated.rows[0]);
      await audit(
        client,
        identity,
        'academic_year.update',
        yearId,
        before,
        after,
        v.reason,
      );
      await client.query(
        `INSERT INTO academic_events(institution_id,academic_year_id,event_type,actor_id,reason,before_data,after_data)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          identity.institutionId,
          yearId,
          status !== before.status ? 'year_status_changed' : 'year_updated',
          identity.userId ?? null,
          v.reason ?? '',
          before,
          after,
        ],
      );
      return after;
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

async function lockYear(client, identity, yearId) {
  const current = await client.query(
    `SELECT ${yearColumns} FROM academic_years ay
     WHERE ay.id=$1 AND ay.institution_id=$2 FOR UPDATE OF ay`,
    [yearId, identity.institutionId],
  );
  if (!current.rowCount) throw fail('Ano letivo não encontrado.', 404);
  return yearFromRow(current.rows[0]);
}

async function reloadYear(client, yearId) {
  const r = await client.query(
    `SELECT ${yearColumns} FROM academic_years ay WHERE ay.id=$1`,
    [yearId],
  );
  return yearFromRow(r.rows[0]);
}

/**
 * Diagnóstico de encerramento. Pendências críticas impedem encerrar:
 * cartões na fila, em leitura ou em revisão e notas em processamento ou
 * revisão. Avisos não impedem, mas aparecem na confirmação.
 */
async function closingReport(db, yearId) {
  const r = await db.query(
    `WITH yc AS (SELECT id,name FROM classes WHERE academic_year_id=$1),
     apps AS (SELECT aa.id,aa.class_id FROM assessment_applications aa
              WHERE aa.class_id IN (SELECT id FROM yc) AND aa.status<>'cancelled'),
     aps AS (SELECT aps.id FROM application_students aps WHERE aps.application_id IN (SELECT id FROM apps))
     SELECT
       (SELECT count(*) FROM yc) classes,
       (SELECT count(*) FROM classes WHERE academic_year_id=$1 AND status='active') active_classes,
       (SELECT count(*) FROM student_enrollments WHERE academic_year_id=$1 AND status='active') active_enrollments,
       (SELECT count(*) FROM student_enrollments WHERE academic_year_id=$1 AND status='active' AND academic_outcome IN ('pending','recovery')) without_outcome,
       (SELECT count(*) FROM apps) applications,
       (SELECT count(*) FROM card_scans cs WHERE cs.status IN ('queued','processing')
          AND (cs.expected_application_id IN (SELECT id FROM apps) OR cs.application_student_id IN (SELECT id FROM aps))) scans_processing,
       (SELECT count(*) FROM card_scans cs WHERE cs.status='review'
          AND (cs.expected_application_id IN (SELECT id FROM apps) OR cs.application_student_id IN (SELECT id FROM aps))) scans_in_review,
       (SELECT count(*) FROM assessment_results ar WHERE ar.application_student_id IN (SELECT id FROM aps)
          AND ar.processing_status IN ('processing','needs_review','failed')) results_pending,
       (SELECT count(*) FROM assessment_results ar WHERE ar.application_student_id IN (SELECT id FROM aps)
          AND ar.processing_status='ready' AND ar.publication_status IN ('unpublished','republish_required')) results_unpublished`,
    [yearId],
  );
  const n = Object.fromEntries(
    Object.entries(r.rows[0]).map(([key, value]) => [key, Number(value)]),
  );
  const critical = [
    n.scans_processing && {
      code: 'scans_processing',
      count: n.scans_processing,
      message: 'cartão(ões) na fila ou em leitura automática',
      panel: 'correction',
    },
    n.scans_in_review && {
      code: 'scans_in_review',
      count: n.scans_in_review,
      message: 'cartão(ões) aguardando revisão da leitura',
      panel: 'correction',
    },
    n.results_pending && {
      code: 'results_pending',
      count: n.results_pending,
      message: 'nota(s) em processamento, revisão ou com falha',
      panel: 'results',
    },
  ].filter(Boolean);
  const warnings = [
    n.results_unpublished && {
      code: 'results_unpublished',
      count: n.results_unpublished,
      message:
        'nota(s) prontas e não publicadas: depois do encerramento o aluno só as verá se o ano for reaberto',
      panel: 'results',
    },
    n.without_outcome && {
      code: 'without_outcome',
      count: n.without_outcome,
      message:
        'matrícula(s) sem situação acadêmica definida (promovido, reprovado etc.): ficam registradas como "aguardando decisão"',
      panel: 'years',
    },
  ].filter(Boolean);
  return {
    classes: n.classes,
    activeClasses: n.active_classes,
    activeEnrollments: n.active_enrollments,
    enrollmentsWithoutOutcome: n.without_outcome,
    applications: n.applications,
    critical,
    warnings,
    canClose: critical.length === 0,
  };
}

export async function academicYearClosingCheck(identity, yearId) {
  requireManager(identity);
  const year = await pool.query(
    `SELECT ${yearColumns} FROM academic_years ay WHERE ay.id=$1 AND ay.institution_id=$2`,
    [yearId, identity.institutionId],
  );
  if (!year.rowCount) throw fail('Ano letivo não encontrado.', 404);
  return { year: yearFromRow(year.rows[0]), ...(await closingReport(pool, yearId)) };
}

/**
 * Encerra o ano letivo numa única transação: turmas passam a encerradas,
 * matrículas ativas viram registro histórico (concluídas) e as notas ficam
 * bloqueadas (migração 112). Exige digitar o ano como confirmação e falha
 * sem alterar nada se houver pendência crítica.
 */
export async function closeAcademicYear(identity, yearId, input = {}) {
  requireManager(identity);
  const v = z
    .object({
      confirmYear: z.number().int(),
      reason: z.string().trim().max(500).optional(),
    })
    .parse(input);
  try {
    return await transaction(async (client) => {
      const before = await lockYear(client, identity, yearId);
      if (v.confirmYear !== before.year)
        throw fail(
          `Para confirmar, informe o ano letivo ${before.year}.`,
          422,
        );
      if (!['planning', 'active'].includes(before.status))
        throw fail('Este ano letivo já está encerrado ou arquivado.', 409);
      // Impede novas leituras e notas enquanto o diagnóstico é refeito.
      await client.query(
        `UPDATE academic_years SET status='closing',updated_at=now() WHERE id=$1`,
        [yearId],
      );
      const report = await closingReport(client, yearId);
      if (!report.canClose)
        throw Object.assign(
          fail(
            'Há pendências críticas: resolva-as antes de encerrar o ano letivo.',
            409,
          ),
          { report },
        );
      const exitDate = before.endDate ?? null;
      const enrollments = await client.query(
        `UPDATE student_enrollments
         SET status='completed',
             exit_date=greatest(entry_date,LEAST(COALESCE($2::date,current_date),current_date))
         WHERE academic_year_id=$1 AND status='active' RETURNING id`,
        [yearId, exitDate],
      );
      const classes = await client.query(
        `UPDATE classes SET status='closed' WHERE academic_year_id=$1 AND status='active' RETURNING id`,
        [yearId],
      );
      await client.query(
        `UPDATE academic_years SET status='closed',closed_at=now(),closed_by=$2,updated_at=now() WHERE id=$1`,
        [yearId, identity.userId ?? null],
      );
      const after = await reloadYear(client, yearId);
      const summary = {
        classesClosed: classes.rowCount,
        enrollmentsCompleted: enrollments.rowCount,
        enrollmentsWithoutOutcome: report.enrollmentsWithoutOutcome,
        warnings: report.warnings,
      };
      await audit(
        client,
        identity,
        'academic_year.close',
        yearId,
        before,
        { ...after, summary },
        v.reason,
      );
      await client.query(
        `INSERT INTO academic_events(institution_id,academic_year_id,event_type,actor_id,reason,before_data,after_data)
         VALUES($1,$2,'year_closed',$3,$4,$5,$6)`,
        [
          identity.institutionId,
          yearId,
          identity.userId ?? null,
          v.reason ?? '',
          before,
          { ...after, summary },
        ],
      );
      const actor = identity.userId
        ? (
            await client.query('SELECT display_name FROM users WHERE id=$1', [
              identity.userId,
            ])
          ).rows[0]?.display_name
        : null;
      return { year: after, summary, closedBy: actor ?? null };
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

/** Exclui ano letivo cadastrado por engano: só sem turmas e sem matrículas. */
export async function deleteAcademicYear(identity, yearId) {
  requireManager(identity);
  try {
    return await transaction(async (client) => {
      const before = await lockYear(client, identity, yearId);
      const enrollments = await client.query(
        'SELECT count(*)::int n FROM student_enrollments WHERE academic_year_id=$1',
        [yearId],
      );
      if (before.classCount > 0 || enrollments.rows[0].n > 0)
        throw fail(
          'Este ano letivo tem turmas ou matrículas e não pode ser excluído. Arquive-o depois de encerrar as matrículas.',
          409,
        );
      // Só eventos do próprio ano (sem aluno): a exclusão fica no audit_log.
      await client.query("SET LOCAL ufaprova.allow_history_purge='on'");
      await client.query(
        'DELETE FROM academic_events WHERE academic_year_id=$1 AND student_id IS NULL',
        [yearId],
      );
      await client.query("SET LOCAL ufaprova.allow_history_purge='off'");
      await client.query('DELETE FROM academic_years WHERE id=$1', [yearId]);
      await audit(client, identity, 'academic_year.delete', yearId, before, null);
      return { id: yearId, deleted: true };
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

/**
 * Arquiva o ano letivo: ele sai das listas operacionais, as turmas ficam
 * arquivadas e não aceitam novas matrículas nem novas turmas. Exige que
 * nenhuma matrícula esteja ativa (encerre ou promova os alunos antes).
 */
export async function archiveAcademicYear(identity, yearId, input = {}) {
  requireManager(identity);
  const reason = z.string().trim().max(500).optional().parse(input?.reason);
  try {
    return await transaction(async (client) => {
      const before = await lockYear(client, identity, yearId);
      if (before.status === 'archived')
        throw fail('Este ano letivo já está arquivado.', 409);
      if (before.activeEnrollmentCount > 0)
        throw fail(
          `Ainda há ${before.activeEnrollmentCount} matrícula(s) ativa(s) neste ano letivo. Retire os alunos das turmas (ou promova-os) antes de arquivar.`,
          409,
        );
      await client.query(
        `UPDATE academic_years SET status='archived',closed_at=COALESCE(closed_at,now()),
           closed_by=COALESCE(closed_by,$2),updated_at=now() WHERE id=$1`,
        [yearId, identity.userId ?? null],
      );
      await client.query(
        `UPDATE classes SET status='archived' WHERE academic_year_id=$1 AND status IN ('active','closed')`,
        [yearId],
      );
      const after = await reloadYear(client, yearId);
      await audit(client, identity, 'academic_year.archive', yearId, before, after, reason);
      await client.query(
        `INSERT INTO academic_events(institution_id,academic_year_id,event_type,actor_id,reason,before_data,after_data)
         VALUES($1,$2,'year_status_changed',$3,$4,$5,$6)`,
        [identity.institutionId, yearId, identity.userId ?? null, reason ?? '', before, after],
      );
      return after;
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

/** Reabertura excepcional: somente administrador, com motivo registrado. */
export async function reopenAcademicYear(identity, yearId, input = {}) {
  if (!(identity?.portalAdmin || identity?.role === 'admin'))
    throw fail('Somente o administrador pode reabrir um ano letivo.', 403);
  const reason = z
    .string({ error: 'Informe o motivo da reabertura.' })
    .trim()
    .min(5, 'Informe o motivo da reabertura.')
    .max(500)
    .parse(input?.reason);
  try {
    return await transaction(async (client) => {
      const before = await lockYear(client, identity, yearId);
      if (!['closing', 'closed', 'archived'].includes(before.status))
        throw fail('Este ano letivo já está aberto.', 409);
      await client.query(
        `UPDATE academic_years SET status='active',closed_at=NULL,closed_by=NULL,updated_at=now() WHERE id=$1`,
        [yearId],
      );
      // Turmas arquivadas individualmente (archived_at) continuam arquivadas.
      await client.query(
        `UPDATE classes SET status='active' WHERE academic_year_id=$1 AND (status='closed' OR (status='archived' AND archived_at IS NULL))`,
        [yearId],
      );
      // Reversão administrativa: matrículas concluídas pelo encerramento e que
      // continuam na turma voltam a ficar ativas.
      await client.query("SET LOCAL ufaprova.allow_enrollment_reversal='on'");
      await client.query(
        `UPDATE student_enrollments se SET status='active',exit_date=NULL
         WHERE se.academic_year_id=$1 AND se.status='completed'
           AND EXISTS (SELECT 1 FROM class_enrollments ce
                       WHERE ce.class_id=se.class_id AND ce.student_id=se.student_id)`,
        [yearId],
      );
      await client.query("SET LOCAL ufaprova.allow_enrollment_reversal='off'");
      const after = await reloadYear(client, yearId);
      await audit(client, identity, 'academic_year.reopen', yearId, before, after, reason);
      await client.query(
        `INSERT INTO academic_events(institution_id,academic_year_id,event_type,actor_id,reason,before_data,after_data)
         VALUES($1,$2,'year_reopened',$3,$4,$5,$6)`,
        [identity.institutionId, yearId, identity.userId ?? null, reason, before, after],
      );
      return after;
    });
  } catch (error) {
    throw translateDatabaseError(error);
  }
}

/** Histórico acadêmico do aluno: matrículas (ativas e encerradas) e eventos. */
export async function getStudentHistory(identity, studentId, ownerId) {
  requireStaff(identity);
  const student = await pool.query(
    `SELECT s.id,s.name,s.registration FROM students s
     WHERE s.id=$1 AND s.institution_id=$2 AND ${ownsStudent('s', '$3')}`,
    [studentId, identity.institutionId, ownerId],
  );
  if (!student.rowCount) throw fail('Aluno não encontrado.', 404);
  const enrollments = await pool.query(
    `SELECT se.id,se.class_id,se.class_name,se.grade_level,se.enrollment_number,se.call_number,
            se.status,se.academic_outcome,to_char(se.entry_date,'YYYY-MM-DD') entry_date,
            to_char(se.exit_date,'YYYY-MM-DD') exit_date,ay.year,ay.status year_status
     FROM student_enrollments se JOIN academic_years ay ON ay.id=se.academic_year_id
     WHERE se.student_id=$1 AND se.institution_id=$2
     ORDER BY ay.year,se.entry_date,se.created_at`,
    [studentId, identity.institutionId],
  );
  const events = await pool.query(
    `SELECT e.id,e.enrollment_id,e.event_type,e.reason,e.created_at,u.display_name actor_name
     FROM academic_events e LEFT JOIN users u ON u.id=e.actor_id
     WHERE e.student_id=$1 AND e.institution_id=$2 ORDER BY e.created_at,e.id`,
    [studentId, identity.institutionId],
  );
  return {
    student: student.rows[0],
    enrollments: enrollments.rows.map((row) => ({
      id: row.id,
      classId: row.class_id,
      className: row.class_name,
      gradeLevel: row.grade_level,
      enrollmentNumber: row.enrollment_number,
      callNumber: row.call_number,
      status: row.status,
      academicOutcome: row.academic_outcome,
      entryDate: row.entry_date,
      exitDate: row.exit_date,
      year: row.year,
      yearStatus: row.year_status,
    })),
    events: events.rows.map((row) => ({
      id: Number(row.id),
      enrollmentId: row.enrollment_id,
      type: row.event_type,
      reason: row.reason,
      actorName: row.actor_name,
      createdAt: row.created_at,
    })),
  };
}
