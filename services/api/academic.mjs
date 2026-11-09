import { z } from 'zod';
import crypto from 'node:crypto';
import { pool, transaction } from './db.mjs';
import { ownsApplication, ownsClass, ownsStudent } from './ownership.mjs';
import { assertInstitutionLimit } from './auth.mjs';
import { signQrId } from './qr-signing.mjs';
import { answerKeyStatus } from './assessment-results.mjs';
import { dataUrlMatchesSignature } from './file-signature.mjs';
export const classSchema = z.object({
  name: z.string().trim().min(1).max(80),
  grade: z.string().trim().min(2).max(40),
  schoolYear: z.number().int().min(2000).max(2100),
  // Escola de "Minhas escolas" do professor; obrigatória em turmas novas.
  schoolId: z.uuid({ error: 'Selecione a escola da turma.' }),
});
export const studentStatusSchema = z.enum([
  'ativo',
  'transferido',
  'remanejado',
  'atestado',
  'regime_domiciliar',
]);
export const studentUpdateSchema = z
  .object({
    status: studentStatusSchema.optional(),
    adaptedExam: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.status !== undefined || value.adaptedExam !== undefined,
    'Informe a situação ou a condição de prova adaptada.',
  );
export const studentSchema = z.object({
  status: studentStatusSchema.default('ativo'),
  adaptedExam: z.boolean().default(false),
  registration: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(160),
  // Foto do cadastro: o app e o portal reduzem para 320 px (cerca de 20 a 60 KB).
  selfieDataUrl: z
    .string()
    .max(140000)
    .refine(
      (v) =>
        !v ||
        (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) &&
          dataUrlMatchesSignature(v) &&
          Buffer.byteLength(v.split(',')[1], 'base64') <= 100000),
      'Use foto PNG/JPEG de até 100 KB.',
    )
    .default(''),
});
export const enrollmentSchema = z.object({
  studentId: z.uuid(),
  number: z.number().int().positive().optional(),
});
export const applicationSchema = z.object({
  assessmentId: z.uuid(),
  classId: z.uuid(),
  scheduledAt: z.iso.datetime().optional(),
  studentIds: z
    .array(z.uuid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
});
export async function listClasses({ institutionId, ownerId = null }) {
  const r = await pool.query({
    // Escola da própria turma; turmas antigas usam a escola do convite.
    text: `SELECT c.id,c.name,c.grade,c.school_year,es.id school_id,es.name school_name,
                  COUNT(ce.student_id)::int students
           FROM classes c
           LEFT JOIN class_enrollments ce ON ce.class_id=c.id
           LEFT JOIN class_invites ci ON ci.class_id=c.id AND ci.active
           LEFT JOIN educator_schools es ON es.id=coalesce(c.school_id,ci.school_id)
           WHERE c.institution_id=$1 AND ${ownsClass('c', '$2')}
           GROUP BY c.id,es.id,es.name
           ORDER BY c.school_year DESC,c.name`,
    values: [institutionId, ownerId],
  });
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    grade: x.grade,
    schoolYear: x.school_year,
    students: x.students,
    schoolId: x.school_id || null,
    schoolName: x.school_name || null,
  }));
}
export async function createClass({ institutionId, userId, input }) {
  const v = classSchema.parse(input);
  // A escola precisa ser uma das escolas cadastradas pelo próprio professor.
  const school = await pool.query(
    'SELECT id,name FROM educator_schools WHERE id=$1 AND user_id=$2',
    [v.schoolId, userId],
  );
  if (!school.rowCount)
    throw Object.assign(new Error('Escola não encontrada em Minhas escolas.'), {
      statusCode: 422,
    });
  const r = await pool.query({
    text: `INSERT INTO classes(institution_id,name,grade,school_year,school_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,grade,school_year`,
    values: [institutionId, v.name, v.grade, v.schoolYear, v.schoolId, userId],
  });
  return {
    ...r.rows[0],
    schoolYear: r.rows[0].school_year,
    schoolId: school.rows[0].id,
    schoolName: school.rows[0].name,
  };
}
export async function deleteClass({ institutionId, classId }) {
  return transaction(async (client) => {
    const schoolClass = await client.query(
      'SELECT id FROM classes WHERE id=$1 AND institution_id=$2 FOR UPDATE',
      [classId, institutionId],
    );
    if (!schoolClass.rowCount)
      throw Object.assign(new Error('Turma não encontrada.'), {
        statusCode: 404,
      });

    const applications = await client.query(
      'SELECT EXISTS(SELECT 1 FROM assessment_applications WHERE class_id=$1) AS linked',
      [classId],
    );
    if (applications.rows[0]?.linked)
      throw Object.assign(
        new Error(
          'Esta turma possui provas aplicadas ou histórico de respostas e não pode ser excluída.',
        ),
        { statusCode: 409 },
      );

    await client.query(
      'DELETE FROM classes WHERE id=$1 AND institution_id=$2',
      [classId, institutionId],
    );
    return { id: classId, deleted: true };
  });
}
export async function createStudent({
  institutionId,
  userId,
  portalAdmin = false,
  developmentBypass = false,
  input,
}) {
  await assertInstitutionLimit({
    institutionId,
    kind: 'student',
    portalAdmin,
    developmentBypass,
  });
  const v = studentSchema.parse(input);
  const r = await pool.query({
    text: `INSERT INTO students(institution_id,registration,name,teacher_id,access_code,selfie_data_url,status,adapted_exam) VALUES($1,$2,$3,$4,'UFA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),$5,$6,$7) RETURNING id,registration,name,access_code,selfie_data_url AS "selfieDataUrl",active,status,adapted_exam AS "adaptedExam"`,
    values: [
      institutionId,
      v.registration,
      v.name,
      userId,
      v.selfieDataUrl,
      v.status,
      v.adaptedExam,
    ],
  });
  return r.rows[0];
}
export async function listStudents({ institutionId, ownerId = null }) {
  const result = await pool.query({
    text: `SELECT s.id,s.registration,s.name,s.access_code,s.selfie_data_url AS "selfieDataUrl",s.active,s.status,s.adapted_exam AS "adaptedExam",i.name AS school_name,u.display_name AS teacher_name,lu.display_name AS "linkedAccountName",lu.email AS "linkedAccountEmail",
      -- Turmas do aluno (com o número da chamada): a página Alunos agrupa por turma.
      coalesce((SELECT jsonb_agg(jsonb_build_object('classId',ce.class_id,'number',ce.number) ORDER BY ce.class_id) FROM class_enrollments ce WHERE ce.student_id=s.id),'[]') AS enrollments
      FROM students s JOIN institutions i ON i.id=s.institution_id LEFT JOIN users u ON u.id=s.teacher_id LEFT JOIN student_account_links l ON l.student_id=s.id AND l.institution_id=s.institution_id LEFT JOIN users lu ON lu.id=l.user_id WHERE s.institution_id=$1 AND ${ownsStudent('s', '$2')} ORDER BY s.name`,
    values: [institutionId, ownerId],
  });
  return result.rows;
}
export async function updateStudent({ institutionId, studentId, input }) {
  const value = studentUpdateSchema.parse(input);
  const r = await pool.query({
    text: `UPDATE students SET status=COALESCE($3,status),
      adapted_exam=COALESCE($4,adapted_exam)
      WHERE id=$1 AND institution_id=$2
      RETURNING id,registration,name,access_code,selfie_data_url AS "selfieDataUrl",active,status,adapted_exam AS "adaptedExam"`,
    values: [
      studentId,
      institutionId,
      value.status ?? null,
      value.adaptedExam ?? null,
    ],
  });
  if (!r.rowCount)
    throw Object.assign(new Error('Aluno não encontrado.'), {
      statusCode: 404,
    });
  return r.rows[0];
}
export async function enrollStudent({ institutionId, classId, input }) {
  const v = enrollmentSchema.parse(input);
  const r = await pool.query({
    text: `INSERT INTO class_enrollments(class_id,student_id,number) SELECT c.id,s.id,$4 FROM classes c JOIN students s ON s.id=$3 AND s.institution_id=$1 WHERE c.id=$2 AND c.institution_id=$1 RETURNING class_id,student_id,number`,
    values: [institutionId, classId, v.studentId, v.number || null],
  });
  if (!r.rowCount)
    throw Object.assign(new Error('Turma ou aluno não encontrado.'), {
      statusCode: 404,
    });
  return r.rows[0];
}
export async function createApplication({ institutionId, userId, input }) {
  const v = applicationSchema.parse(input);
  return transaction(async (client) => {
    const versions = await client.query(
      `SELECT av.id,av.code
       FROM assessment_versions av
       JOIN assessments a ON a.id=av.assessment_id
       WHERE av.assessment_id=$1 AND a.institution_id=$2
       ORDER BY av.code`,
      [v.assessmentId, institutionId],
    );
    if (!versions.rowCount)
      throw Object.assign(
        new Error('Avaliação não encontrada ou sem versões.'),
        {
          statusCode: 404,
        },
      );
    const students = await client.query(
      `SELECT s.id,s.name,s.registration,ce.number FROM class_enrollments ce JOIN students s ON s.id=ce.student_id WHERE ce.class_id=$1 AND s.institution_id=$2 AND s.active AND ($3::uuid[] IS NULL OR s.id=ANY($3::uuid[])) ORDER BY ce.number NULLS LAST,s.name`,
      [v.classId, institutionId, v.studentIds || null],
    );
    if (v.studentIds && students.rowCount !== v.studentIds.length)
      throw Object.assign(
        new Error('Selecione somente alunos ativos matriculados nesta turma.'),
        { statusCode: 422 },
      );
    if (!versions.rowCount)
      throw Object.assign(new Error('A avaliação não possui versões.'), {
        statusCode: 422,
      });
    if (!students.rowCount)
      throw Object.assign(
        new Error('A turma não possui alunos matriculados.'),
        { statusCode: 422 },
      );

    const created = await client.query({
      text: `INSERT INTO assessment_applications(institution_id,assessment_id,class_id,scheduled_at,created_by)
             SELECT $1,a.id,c.id,$4,$5
             FROM assessments a
             JOIN classes c ON c.id=$3 AND c.institution_id=$1
             WHERE a.id=$2 AND a.institution_id=$1
             ON CONFLICT (assessment_id,class_id) DO NOTHING
             RETURNING id,assessment_id,class_id,scheduled_at,status`,
      values: [
        institutionId,
        v.assessmentId,
        v.classId,
        v.scheduledAt || null,
        userId,
      ],
    });

    if (!created.rowCount) {
      const existing = await client.query({
        text: `SELECT id,assessment_id,class_id,scheduled_at,status
               FROM assessment_applications
               WHERE assessment_id=$1 AND class_id=$2 AND institution_id=$3
               FOR UPDATE`,
        values: [v.assessmentId, v.classId, institutionId],
      });
      if (!existing.rowCount)
        throw Object.assign(new Error('Avaliação ou turma não encontrada.'), {
          statusCode: 404,
        });

      const application = existing.rows[0];
      if (application.status === 'cancelled') {
        await client.query(
          `UPDATE assessment_applications
           SET status='scheduled',scheduled_at=COALESCE($2,scheduled_at)
           WHERE id=$1`,
          [application.id, v.scheduledAt || null],
        );
      }
      await client.query(
        `UPDATE render_jobs rj
         SET status='queued',error_message=NULL,completed_at=NULL,output_manifest=NULL
         FROM application_students aps
         WHERE aps.application_id=$1
           AND rj.application_student_id=aps.id
           AND rj.status='failed'`,
        [application.id],
      );
      const assignments = await listApplicationAssignments(
        client,
        application.id,
      );
      return {
        ...application,
        status:
          application.status === 'cancelled' ? 'scheduled' : application.status,
        assignments,
        reused: true,
      };
    }

    const application = created.rows[0];
    const assignments = [];
    for (let index = 0; index < students.rows.length; index++) {
      const student = students.rows[index];
      const version = versions.rows[index % versions.rows.length];
      const id = crypto.randomUUID();
      const signature = signQrId(id);
      const qrPayload = `CBS1:${id}:${signature}`;
      await client.query(
        'INSERT INTO application_students(id,application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4,$5)',
        [id, application.id, student.id, version.id, qrPayload],
      );
      const job = await client.query(
        `INSERT INTO render_jobs(assessment_version_id,template_version,application_student_id) SELECT $1,template_version,$2 FROM render_jobs WHERE assessment_version_id=$1 ORDER BY created_at LIMIT 1 RETURNING id`,
        [version.id, id],
      );
      assignments.push({
        id,
        studentName: student.name,
        registration: student.registration,
        number: student.number,
        versionCode: version.code,
        renderJobId: job.rows[0].id,
        status: 'queued',
      });
    }
    return { ...application, assignments, reused: false };
  });
}

async function listApplicationAssignments(client, applicationId) {
  const result = await client.query({
    text: `SELECT aps.id,s.name student_name,s.registration,ce.number,
                  av.code version_code,rj.id render_job_id,rj.status render_status
           FROM application_students aps
           JOIN assessment_versions av ON av.id=aps.assessment_version_id
           JOIN students s ON s.id=aps.student_id
           LEFT JOIN assessment_applications aa ON aa.id=aps.application_id
           LEFT JOIN class_enrollments ce ON ce.class_id=aa.class_id AND ce.student_id=s.id
           LEFT JOIN LATERAL (
             SELECT j.id,j.status
             FROM render_jobs j
             WHERE j.application_student_id=aps.id
             ORDER BY j.created_at DESC NULLS LAST,j.id DESC
             LIMIT 1
           ) rj ON true
           WHERE aps.application_id=$1
           ORDER BY ce.number NULLS LAST,s.name`,
    values: [applicationId],
  });
  return result.rows.map((row) => ({
    id: row.id,
    studentName: row.student_name,
    registration: row.registration,
    number: row.number,
    versionCode: row.version_code,
    renderJobId: row.render_job_id,
    renderStatus: row.render_status || 'queued',
    status: row.render_status || 'queued',
  }));
}

export async function listApplications({ institutionId, ownerId = null }) {
  const result = await pool.query({
    text: `SELECT aa.id,aa.assessment_id,aa.class_id,aa.scheduled_at,aa.status,a.title,a.subject,c.name class_name,COUNT(ast.id)::int students,COUNT(rj.id) FILTER(WHERE rj.status='completed')::int completed,COUNT(DISTINCT ast.id) FILTER(WHERE EXISTS(SELECT 1 FROM card_scans cs WHERE cs.application_student_id=ast.id AND cs.submission_id IS NOT NULL))::int corrected FROM assessment_applications aa JOIN assessments a ON a.id=aa.assessment_id JOIN classes c ON c.id=aa.class_id LEFT JOIN application_students ast ON ast.application_id=aa.id LEFT JOIN render_jobs rj ON rj.application_student_id=ast.id WHERE aa.institution_id=$1 AND ${ownsApplication('aa', '$2')} GROUP BY aa.id,a.title,a.subject,c.name ORDER BY aa.created_at DESC`,
    values: [institutionId, ownerId],
  });
  // Versões e gabarito de cada avaliação, para o professor conferir antes de corrigir.
  const versions = await pool.query(
    'SELECT assessment_id,code,snapshot FROM assessment_versions WHERE assessment_id=ANY($1::uuid[]) ORDER BY code',
    [[...new Set(result.rows.map((x) => x.assessment_id))]],
  );
  const keys = new Map();
  for (const row of versions.rows) {
    const list = keys.get(row.assessment_id) ?? [];
    list.push({ code: row.code, ...answerKeyStatus(row.snapshot) });
    keys.set(row.assessment_id, list);
  }
  return result.rows.map((x) => ({
    id: x.id,
    title: x.title,
    subject: x.subject,
    versions: (keys.get(x.assessment_id) ?? []).map(
      ({ code, questions, objective, missingAnswerKeys }) => ({
        code,
        questions,
        objective,
        missingAnswerKeys,
      }),
    ),
    answerKeyReady:
      (keys.get(x.assessment_id) ?? []).length > 0 &&
      (keys.get(x.assessment_id) ?? []).every(
        (version) => !version.missingAnswerKeys.length,
      ),
    assessmentId: x.assessment_id,
    classId: x.class_id,
    className: x.class_name,
    scheduledAt: x.scheduled_at,
    status: x.status,
    students: x.students,
    completed: x.completed,
    corrected: x.corrected,
  }));
}

export async function getApplication({ institutionId, applicationId }) {
  const application = await pool.query({
    text: `SELECT aa.id,aa.scheduled_at,aa.status,a.title,c.name class_name,
                  c.grade,c.school_year
           FROM assessment_applications aa
           JOIN assessments a ON a.id=aa.assessment_id
           JOIN classes c ON c.id=aa.class_id
           WHERE aa.id=$1 AND aa.institution_id=$2`,
    values: [applicationId, institutionId],
  });
  if (!application.rowCount) return null;
  const assignments = await pool.query({
    text: `SELECT aps.id,s.name student_name,s.registration,ce.number,
                  av.code version_code,rj.id render_job_id,rj.status render_status,
                  rj.error_message,
                  EXISTS(SELECT 1 FROM card_scans cs WHERE cs.application_student_id=aps.id) has_scan
           FROM application_students aps
           JOIN assessment_applications aa ON aa.id=aps.application_id
           JOIN students s ON s.id=aps.student_id
           JOIN assessment_versions av ON av.id=aps.assessment_version_id
           LEFT JOIN class_enrollments ce ON ce.class_id=aa.class_id AND ce.student_id=s.id
           LEFT JOIN render_jobs rj ON rj.application_student_id=aps.id
           WHERE aps.application_id=$1
           ORDER BY ce.number NULLS LAST,s.name`,
    values: [applicationId],
  });
  const row = application.rows[0];
  return {
    id: row.id,
    title: row.title,
    className: row.class_name,
    grade: row.grade,
    schoolYear: row.school_year,
    scheduledAt: row.scheduled_at,
    status: row.status,
    canCancel:
      row.status === 'scheduled' &&
      !assignments.rows.some((assignment) => assignment.has_scan),
    assignments: assignments.rows.map((assignment) => ({
      id: assignment.id,
      studentName: assignment.student_name,
      registration: assignment.registration,
      number: assignment.number,
      versionCode: assignment.version_code,
      renderJobId: assignment.render_job_id,
      renderStatus: assignment.render_status,
      error:
        assignment.render_status === 'failed' ? assignment.error_message : null,
      downloads:
        assignment.render_status === 'completed'
          ? {
              prova: `/api/render-jobs/${assignment.render_job_id}/prova`,
              gabarito: `/api/render-jobs/${assignment.render_job_id}/gabarito`,
            }
          : null,
    })),
  };
}

export async function retryApplicationRenders({
  institutionId,
  applicationId,
}) {
  const result = await pool.query({
    text: `UPDATE render_jobs rj
           SET status='queued',error_message=NULL,completed_at=NULL,output_manifest=NULL
           FROM application_students aps,assessment_applications aa
           WHERE rj.application_student_id=aps.id
             AND aps.application_id=aa.id
             AND aa.id=$1 AND aa.institution_id=$2
             AND aa.status<>'cancelled' AND rj.status='failed'
           RETURNING rj.id`,
    values: [applicationId, institutionId],
  });
  return { retried: result.rowCount };
}

export async function cancelApplication({ institutionId, applicationId }) {
  return transaction(async (client) => {
    const result = await client.query({
      text: `UPDATE assessment_applications aa
             SET status='cancelled'
             WHERE aa.id=$1 AND aa.institution_id=$2 AND aa.status='scheduled'
               AND NOT EXISTS (
                 SELECT 1 FROM application_students aps
                 JOIN card_scans cs ON cs.application_student_id=aps.id
                 WHERE aps.application_id=aa.id
               )
             RETURNING aa.id,aa.status`,
      values: [applicationId, institutionId],
    });
    if (!result.rowCount)
      throw Object.assign(
        new Error('A aplicação não pode mais ser cancelada.'),
        { statusCode: 409 },
      );
    await client.query(
      `UPDATE render_jobs rj
       SET status='failed',completed_at=now(),error_message='Aplicação cancelada antes da impressão.'
       FROM application_students aps
       WHERE rj.application_student_id=aps.id AND aps.application_id=$1
         AND rj.status='queued'`,
      [applicationId],
    );
    return result.rows[0];
  });
}

export async function listClassStudents({ institutionId, classId }) {
  const r = await pool.query(
    `SELECT s.id,s.name,s.registration FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id JOIN students s ON s.id=ce.student_id WHERE c.id=$1 AND c.institution_id=$2 AND s.institution_id=$2 AND s.active ORDER BY ce.number NULLS LAST,s.name`,
    [classId, institutionId],
  );
  return r.rows;
}
export async function getClassRoster({ institutionId, userId, classId }) {
  const schoolClass = await pool.query({
    text: `SELECT c.id,c.name,c.grade,c.school_year,i.name AS institution_name,es.name AS school_name
           FROM classes c
           JOIN institutions i ON i.id=c.institution_id
           JOIN memberships m ON m.institution_id=c.institution_id AND m.user_id=$3 AND m.role IN ('admin','coordinator','teacher')
           LEFT JOIN class_invites ci ON ci.class_id=c.id AND ci.active
           LEFT JOIN educator_schools es ON es.id=coalesce(c.school_id,ci.school_id)
           WHERE c.id=$1 AND c.institution_id=$2`,
    values: [classId, institutionId, userId],
  });
  if (!schoolClass.rowCount)
    throw Object.assign(new Error('Turma não encontrada.'), {
      statusCode: 404,
    });
  const students = await pool.query({
    text: `SELECT s.id,s.name,s.registration,ce.number,s.status,s.active,
                  NULLIF(s.selfie_data_url,'') AS "selfieDataUrl"
           FROM class_enrollments ce
           JOIN students s ON s.id=ce.student_id AND s.institution_id=$2
           WHERE ce.class_id=$1
           ORDER BY ce.number NULLS LAST,s.name`,
    values: [classId, institutionId],
  });
  const row = schoolClass.rows[0];
  return {
    class: {
      id: row.id,
      name: row.name,
      grade: row.grade,
      schoolYear: row.school_year,
    },
    schoolName: row.school_name || row.institution_name,
    students: students.rows,
  };
}
