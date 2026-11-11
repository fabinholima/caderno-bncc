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
        `UPDATE classes SET status='archived' WHERE academic_year_id=$1 AND status='active'`,
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
        `UPDATE classes SET status='active' WHERE academic_year_id=$1 AND status='archived' AND archived_at IS NULL`,
        [yearId],
      );
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
