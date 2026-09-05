import { z } from 'zod';
import crypto from 'node:crypto';
import { pool, transaction } from './db.mjs';
import { assertInstitutionLimit } from './auth.mjs';
export const classSchema = z.object({
  name: z.string().trim().min(1).max(80),
  grade: z.string().trim().min(2).max(40),
  schoolYear: z.number().int().min(2000).max(2100),
});
export const studentSchema = z.object({
  registration: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(160),
});
export const enrollmentSchema = z.object({
  studentId: z.uuid(),
  number: z.number().int().positive().optional(),
});
export const applicationSchema = z.object({
  assessmentId: z.uuid(),
  classId: z.uuid(),
  scheduledAt: z.iso.datetime().optional(),
});
export async function listClasses({ institutionId }) {
  const r = await pool.query({
    text: `SELECT c.id,c.name,c.grade,c.school_year,COUNT(ce.student_id)::int students FROM classes c LEFT JOIN class_enrollments ce ON ce.class_id=c.id WHERE c.institution_id=$1 GROUP BY c.id ORDER BY c.school_year DESC,c.name`,
    values: [institutionId],
  });
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    grade: x.grade,
    schoolYear: x.school_year,
    students: x.students,
  }));
}
export async function createClass({ institutionId, input }) {
  const v = classSchema.parse(input);
  const r = await pool.query({
    text: `INSERT INTO classes(institution_id,name,grade,school_year) VALUES($1,$2,$3,$4) RETURNING id,name,grade,school_year`,
    values: [institutionId, v.name, v.grade, v.schoolYear],
  });
  return { ...r.rows[0], schoolYear: r.rows[0].school_year };
}
export async function createStudent({ institutionId, input }) {
  await assertInstitutionLimit({ institutionId, kind: 'student' });
  const v = studentSchema.parse(input);
  const r = await pool.query({
    text: `INSERT INTO students(institution_id,registration,name) VALUES($1,$2,$3) RETURNING id,registration,name,active`,
    values: [institutionId, v.registration, v.name],
  });
  return r.rows[0];
}
export async function listStudents({ institutionId }) {
  const result = await pool.query({
    text: `SELECT id,registration,name,active FROM students WHERE institution_id=$1 ORDER BY name`,
    values: [institutionId],
  });
  return result.rows;
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
    const r = await client.query({
      text: `INSERT INTO assessment_applications(institution_id,assessment_id,class_id,scheduled_at,created_by) SELECT $1,a.id,c.id,$4,$5 FROM assessments a JOIN classes c ON c.id=$3 AND c.institution_id=$1 WHERE a.id=$2 AND a.institution_id=$1 RETURNING id,assessment_id,class_id,scheduled_at,status`,
      values: [
        institutionId,
        v.assessmentId,
        v.classId,
        v.scheduledAt || null,
        userId,
      ],
    });
    if (!r.rowCount)
      throw Object.assign(new Error('Avaliação ou turma não encontrada.'), {
        statusCode: 404,
      });
    const versions = await client.query(
      'SELECT id,code FROM assessment_versions WHERE assessment_id=$1 ORDER BY code',
      [v.assessmentId],
    );
    const students = await client.query(
      `SELECT s.id,s.name,s.registration,ce.number FROM class_enrollments ce JOIN students s ON s.id=ce.student_id WHERE ce.class_id=$1 AND s.active ORDER BY ce.number NULLS LAST,s.name`,
      [v.classId],
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
    const assignments = [];
    for (let index = 0; index < students.rows.length; index++) {
      const student = students.rows[index];
      const version = versions.rows[index % versions.rows.length];
      const id = crypto.randomUUID();
      const signature = crypto
        .createHmac(
          'sha256',
          process.env.QR_SIGNING_SECRET || 'caderno-local-development',
        )
        .update(id)
        .digest('hex')
        .slice(0, 20);
      const qrPayload = `CBS1:${id}:${signature}`;
      await client.query(
        'INSERT INTO application_students(id,application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4,$5)',
        [id, r.rows[0].id, student.id, version.id, qrPayload],
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
    return { ...r.rows[0], assignments };
  });
}

export async function listApplications({ institutionId }) {
  const result = await pool.query({
    text: `SELECT aa.id,aa.scheduled_at,aa.status,a.title,c.name class_name,COUNT(ast.id)::int students,COUNT(rj.id) FILTER(WHERE rj.status='completed')::int completed FROM assessment_applications aa JOIN assessments a ON a.id=aa.assessment_id JOIN classes c ON c.id=aa.class_id LEFT JOIN application_students ast ON ast.application_id=aa.id LEFT JOIN render_jobs rj ON rj.application_student_id=ast.id WHERE aa.institution_id=$1 GROUP BY aa.id,a.title,c.name ORDER BY aa.created_at DESC`,
    values: [institutionId],
  });
  return result.rows.map((x) => ({
    id: x.id,
    title: x.title,
    className: x.class_name,
    scheduledAt: x.scheduled_at,
    status: x.status,
    students: x.students,
    completed: x.completed,
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
