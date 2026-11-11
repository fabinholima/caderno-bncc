import { pool } from './db.mjs';
import { ownsClass, ownsScan, ownsStudent } from './ownership.mjs';

// Indicadores da Gestão Acadêmica e histórico acadêmico do aluno.
// Tudo é calculado a partir dos dados reais (anos letivos, matrículas
// históricas, cartões e resultados); nada é estimado no frontend.

const fail = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

const num = (value) => Number(value ?? 0);
const percentOrNull = (value) => (value == null ? null : Number(value));

/**
 * Painel da instituição. Gestão (admin, coordenação, portal) vê a
 * instituição inteira; o professor vê só suas turmas e alunos (ownerId).
 */
export async function academicDashboard(identity, ownerId) {
  if (!identity || identity.role === 'student')
    throw fail('Este recurso é exclusivo de professores e gestores.', 403);
  const values = [identity.institutionId, ownerId];
  const [counts, outcomes, years, pending] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT count(*) FROM students s WHERE s.institution_id=$1 AND s.active AND ${ownsStudent('s', '$2')}) students,
         (SELECT count(*) FROM memberships m WHERE m.institution_id=$1 AND m.role IN ('admin','coordinator','teacher')
            AND m.status='active' AND $2::uuid IS NULL) teachers,
         (SELECT count(*) FROM classes c WHERE c.institution_id=$1 AND c.status='active' AND ${ownsClass('c', '$2')}) active_classes,
         (SELECT count(*) FROM classes c WHERE c.institution_id=$1 AND c.status<>'active' AND ${ownsClass('c', '$2')}) closed_classes,
         (SELECT count(*) FROM student_enrollments se JOIN classes c ON c.id=se.class_id
            WHERE se.institution_id=$1 AND se.status='active' AND ${ownsClass('c', '$2')}) active_enrollments,
         (SELECT count(*) FROM academic_years ay WHERE ay.institution_id=$1) academic_years`,
      values,
    ),
    pool.query(
      `SELECT se.academic_outcome outcome,count(*) n
       FROM student_enrollments se LEFT JOIN classes c ON c.id=se.class_id
       WHERE se.institution_id=$1 AND ($2::uuid IS NULL OR (c.id IS NOT NULL AND ${ownsClass('c', '$2')}))
       GROUP BY se.academic_outcome`,
      values,
    ),
    pool.query(
      `SELECT ay.year,ay.status,
              count(se.id) FILTER (WHERE se.status='active') active_enrollments,
              count(se.id) total_enrollments,
              count(DISTINCT c.id) classes
       FROM academic_years ay
       LEFT JOIN classes c ON c.academic_year_id=ay.id AND ${ownsClass('c', '$2')}
       LEFT JOIN student_enrollments se ON se.class_id=c.id
       WHERE ay.institution_id=$1
       GROUP BY ay.id ORDER BY ay.year`,
      values,
    ),
    pool.query(
      `SELECT
         (SELECT count(*) FROM card_scans cs WHERE cs.institution_id=$1 AND cs.status='review' AND ${ownsScan('cs', '$2')}) scans_in_review,
         (SELECT count(*) FROM card_scans cs WHERE cs.institution_id=$1 AND cs.status IN ('queued','processing') AND ${ownsScan('cs', '$2')}) scans_processing,
         (SELECT count(*) FROM assessment_results ar
            JOIN application_students aps ON aps.id=ar.application_student_id
            JOIN assessment_applications aa ON aa.id=aps.application_id
            JOIN classes c ON c.id=aa.class_id
            WHERE ar.institution_id=$1 AND ar.processing_status='ready'
              AND ar.publication_status IN ('unpublished','republish_required') AND ${ownsClass('c', '$2')}) results_unpublished,
         (SELECT count(*) FROM student_enrollments se JOIN classes c ON c.id=se.class_id
            JOIN academic_years ay ON ay.id=se.academic_year_id
            WHERE se.institution_id=$1 AND se.status='active' AND se.academic_outcome='pending'
              AND ay.end_date IS NOT NULL AND ay.end_date < current_date AND ${ownsClass('c', '$2')}) enrollments_without_outcome`,
      values,
    ),
  ]);
  const c = counts.rows[0];
  const byOutcome = Object.fromEntries(
    outcomes.rows.map((row) => [row.outcome, num(row.n)]),
  );
  const p = pending.rows[0];
  return {
    scope: ownerId ? 'teacher' : 'institution',
    students: num(c.students),
    // Professor não vê a equipe da instituição.
    teachers: ownerId ? null : num(c.teachers),
    activeClasses: num(c.active_classes),
    closedClasses: num(c.closed_classes),
    activeEnrollments: num(c.active_enrollments),
    academicYears: num(c.academic_years),
    outcomes: {
      promoted: byOutcome.promoted ?? 0,
      retained: byOutcome.retained ?? 0,
      transferred: byOutcome.transferred ?? 0,
      graduated: byOutcome.graduated ?? 0,
      dropped: byOutcome.dropped ?? 0,
      pending: byOutcome.pending ?? 0,
    },
    pending: {
      scansInReview: num(p.scans_in_review),
      scansProcessing: num(p.scans_processing),
      resultsUnpublished: num(p.results_unpublished),
      enrollmentsWithoutOutcome: num(p.enrollments_without_outcome),
    },
    years: years.rows.map((row) => ({
      year: row.year,
      status: row.status,
      classes: num(row.classes),
      activeEnrollments: num(row.active_enrollments),
      totalEnrollments: num(row.total_enrollments),
    })),
  };
}

/**
 * Provas da matrícula com o resultado. `published` limita à versão
 * publicada (visão do aluno); a equipe vê a versão atual.
 */
async function enrollmentResults(enrollments, { published }) {
  const classIds = enrollments.map((e) => e.class_id).filter(Boolean);
  const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
  if (!classIds.length) return new Map();
  const version = published ? 'ar.published_version_id' : 'ar.current_version_id';
  const rows = await pool.query(
    `SELECT aa.class_id,aps.student_id,a.title,a.subject,aa.scheduled_at,
            v.percent,v.score,v.max_score,v.correct_count,v.valid_count,
            ar.id result_id,ar.publication_status
     FROM application_students aps
     JOIN assessment_applications aa ON aa.id=aps.application_id AND aa.status<>'cancelled'
     JOIN assessments a ON a.id=aa.assessment_id
     LEFT JOIN assessment_results ar ON ar.application_student_id=aps.id
     LEFT JOIN assessment_result_versions v ON v.id=${version}
     WHERE aa.class_id=ANY($1::uuid[]) AND aps.student_id=ANY($2::uuid[])
       ${published ? 'AND v.id IS NOT NULL' : ''}
     ORDER BY aa.scheduled_at NULLS LAST,a.title`,
    [classIds, studentIds],
  );
  const map = new Map();
  for (const row of rows.rows) {
    const key = `${row.class_id}:${row.student_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      resultId: row.result_id,
      title: row.title,
      subject: row.subject,
      scheduledAt: row.scheduled_at,
      percent: percentOrNull(row.percent),
      score: row.score == null ? null : Number(row.score),
      maxScore: row.max_score == null ? null : Number(row.max_score),
      correctCount: row.correct_count,
      validCount: row.valid_count,
      published: row.publication_status === 'published',
    });
  }
  return map;
}

const enrollmentColumns = `se.id,se.student_id,se.class_id,se.class_name,se.grade_level,se.status,
  se.academic_outcome,to_char(se.entry_date,'YYYY-MM-DD') entry_date,
  to_char(se.exit_date,'YYYY-MM-DD') exit_date,ay.year,i.name institution_name,es.name school_name`;

function timeline(enrollments, results) {
  return enrollments.map((row) => {
    const assessments = row.class_id
      ? (results.get(`${row.class_id}:${row.student_id}`) ?? [])
      : [];
    const scored = assessments.filter((item) => item.percent != null);
    return {
      id: row.id,
      year: row.year,
      institutionName: row.institution_name,
      schoolName: row.school_name,
      className: row.class_name,
      gradeLevel: row.grade_level,
      status: row.status,
      academicOutcome: row.academic_outcome,
      entryDate: row.entry_date,
      exitDate: row.exit_date,
      assessments,
      // Média simples dos percentuais das provas com nota; null sem provas.
      averagePercent: scored.length
        ? Math.round(
            (scored.reduce((sum, item) => sum + item.percent, 0) /
              scored.length) *
              10,
          ) / 10
        : null,
    };
  });
}

/** Linha do tempo para a equipe (inclui notas ainda não publicadas). */
export async function studentTimeline(identity, studentId, ownerId) {
  if (!identity || identity.role === 'student')
    throw fail('Este recurso é exclusivo de professores e gestores.', 403);
  const student = await pool.query(
    `SELECT s.id,s.name,s.registration FROM students s
     WHERE s.id=$1 AND s.institution_id=$2 AND ${ownsStudent('s', '$3')}`,
    [studentId, identity.institutionId, ownerId],
  );
  if (!student.rowCount) throw fail('Aluno não encontrado.', 404);
  const enrollments = (
    await pool.query(
      `SELECT ${enrollmentColumns}
       FROM student_enrollments se
       JOIN academic_years ay ON ay.id=se.academic_year_id
       JOIN institutions i ON i.id=se.institution_id
       LEFT JOIN classes c ON c.id=se.class_id
       LEFT JOIN educator_schools es ON es.id=c.school_id
       WHERE se.student_id=$1 AND se.institution_id=$2
       ORDER BY ay.year,se.entry_date,se.created_at`,
      [studentId, identity.institutionId],
    )
  ).rows;
  return {
    student: student.rows[0],
    timeline: timeline(
      enrollments,
      await enrollmentResults(enrollments, { published: false }),
    ),
  };
}

/**
 * Meu histórico (conta de aluno): todas as matrículas dos cadastros
 * vinculados à conta, em qualquer instituição, com as notas publicadas.
 */
export async function myAcademicHistory(identity) {
  if (identity?.role !== 'student')
    throw fail('Esta opção está disponível apenas para alunos.', 403);
  const enrollments = (
    await pool.query(
      `SELECT ${enrollmentColumns}
       FROM student_account_links l
       JOIN student_enrollments se ON se.student_id=l.student_id AND se.institution_id=l.institution_id
       JOIN academic_years ay ON ay.id=se.academic_year_id
       JOIN institutions i ON i.id=se.institution_id
       LEFT JOIN classes c ON c.id=se.class_id
       LEFT JOIN educator_schools es ON es.id=c.school_id
       WHERE l.user_id=$1 AND se.status<>'cancelled'
       ORDER BY ay.year,se.entry_date,se.created_at`,
      [identity.userId],
    )
  ).rows;
  return timeline(
    enrollments,
    await enrollmentResults(enrollments, { published: true }),
  );
}
