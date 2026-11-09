import { isCompactTemplate } from '../../lib/compact-assessment.mjs';
import { assertApprovedQuestionSelection } from './question-workflow.mjs';
import { z } from 'zod';
import crypto from 'node:crypto';
import {
  DEFAULT_RENDER_TEMPLATE,
  assertAssessmentQuestionStyle,
  DEFAULT_RENDER_FONT,
  renderFontIds,
  renderTemplateIds,
} from '../../lib/render-templates.mjs';
import { assertInstitutionLimit } from './auth.mjs';
import { signQrId } from './qr-signing.mjs';
import { pool, transaction } from './db.mjs';
import { ownsAssessment } from './ownership.mjs';
import { schoolHeader } from './educator-profile.mjs';

export const logoDataUrlSchema = z
  .string()
  .max(550_000)
  .regex(
    /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/,
    'O logotipo deve ser uma imagem PNG ou JPEG válida.',
  )
  .refine((value) => {
    const encoded = value.slice(value.indexOf(',') + 1);
    return Buffer.byteLength(encoded, 'base64') <= 400_000;
  }, 'O logotipo deve ter no máximo 400 KB.');

export const assessmentHeaderSchema = z.object({
  institutionName: z.string().trim().min(2).max(300),
  teacherName: z.string().trim().max(160).default(''),
  className: z.string().trim().max(80).default(''),
  term: z.string().trim().max(80).default(''),
  date: z.string().trim().max(40).default(''),
  transcriptionPhrase: z.string().trim().max(240).default(''),
  logoDataUrl: logoDataUrlSchema.optional().or(z.literal('')),
});

export const createAssessmentSchema = z
  .object({
    title: z.string().trim().min(5).max(180),
    grade: z.string().trim().min(2).max(40),
    header: assessmentHeaderSchema.optional(),
    schoolId: z.uuid().optional(),
    sections: z
      .array(
        z.object({
          subject: z.string().trim().min(2).max(120),
          title: z.string().trim().min(2).max(180).optional(),
          columns: z.union([z.literal(1), z.literal(2)]).default(1),
          startOnNewPage: z.boolean().default(false),
          questionIds: z.array(z.uuid()).min(1).max(100),
          fullWidthQuestionIds: z.array(z.uuid()).max(100).default([]),
        }),
      )
      .min(1)
      .max(20),
    questionPoints: z
      .record(z.uuid(), z.number().positive().max(1000))
      .default({}),
    shuffleQuestions: z.boolean().default(true),
    versionCount: z.number().int().min(1).max(6),
    paper: z.enum(['A4', 'A5']).default('A4'),
    template: z.enum(renderTemplateIds).default(DEFAULT_RENDER_TEMPLATE),
    font: z.enum(renderFontIds).default(DEFAULT_RENDER_FONT),
    fontSize: z.number().int().min(10).max(16).default(11),
    showBnccSkills: z.boolean().default(false),
    showSaebDescriptors: z.boolean().default(false),
    // Foto do aluno (cadastro da turma) no cartão-resposta de cada aluno.
    showStudentPhoto: z.boolean().default(false),
    instructions: z
      .array(z.string().trim().min(1).max(500))
      .max(10)
      .default([]),
  })
  .superRefine((value, context) => {
    if (isCompactTemplate(value.template) && value.paper !== 'A4')
      context.addIssue({
        code: 'custom',
        path: ['paper'],
        message: 'Os modelos compactos de 10 questões usam papel A4.',
      });
    const questionIds = value.sections.flatMap(
      (section) => section.questionIds,
    );
    if (questionIds.length > 100) {
      context.addIssue({
        code: 'too_big',
        maximum: 100,
        inclusive: true,
        type: 'array',
        path: ['sections'],
        message: 'A avaliação pode ter no máximo 100 questões.',
      });
    }
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Uma questão não pode aparecer em mais de uma seção.',
      });
    }
    value.sections.forEach((section, sectionIndex) => {
      const selected = new Set(section.questionIds);
      if (
        new Set(section.fullWidthQuestionIds).size !==
          section.fullWidthQuestionIds.length ||
        section.fullWidthQuestionIds.some((id) => !selected.has(id))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sections', sectionIndex, 'fullWidthQuestionIds'],
          message:
            'Questões em largura total devem pertencer à própria seção e não podem se repetir.',
        });
      }
    });
  });

function seededShuffle(items, seed) {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

// Largura total numa seção de duas colunas: escolhida na montagem ou marcada
// no cadastro da questão ("Usar sempre uma coluna"), que vale sempre para não
// deixar figuras e conteúdos largos numa coluna estreita.
export function questionUsesFullWidth(question, fullWidthQuestionIds) {
  return (
    fullWidthQuestionIds.has(question.id) ||
    question.recommend_single_column === true
  );
}

export async function createAssessment({
  institutionId,
  questionBankId = institutionId,
  userId,
  portalAdmin = false,
  developmentBypass = false,
  input,
}) {
  await assertInstitutionLimit({
    institutionId,
    kind: 'assessment',
    portalAdmin,
    developmentBypass,
  });
  const value = createAssessmentSchema.parse(input);
  const questionIds = value.sections.flatMap((section) => section.questionIds);
  const assessmentSubject =
    value.sections.length === 1
      ? value.sections[0].subject
      : 'Multidisciplinar';
  return transaction(async (client) => {
    if (value.schoolId)
      value.header = {
        ...value.header,
        ...(await schoolHeader(client, userId, value.schoolId)),
      };
    const institution = await client.query(
      'SELECT name FROM institutions WHERE id = $1',
      [institutionId],
    );
    await assertApprovedQuestionSelection(
      client,
      [institutionId, questionBankId],
      questionIds,
    );
    const questions = await client.query({
      text: `SELECT q.id, q.current_revision, qr.type, qr.statement, qr.explanation, qr.default_points,
                    qr.subject, qr.grade,
                    qr.source_institution, qr.source_year, qr.difficulty, qr.knowledge_topic,
                    qr.recommend_single_column,
                    COALESCE(jsonb_agg(jsonb_build_object('stableKey', a.stable_key, 'content', a.content, 'isCorrect', a.is_correct) ORDER BY a.position) FILTER (WHERE a.id IS NOT NULL), '[]') AS alternatives,
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('code', cs.code, 'primary', qs.is_primary)) FILTER (WHERE cs.id IS NOT NULL), '[]') AS skills,
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('code', sd.code, 'description', sd.description, 'topic', st.name, 'primary', qsd.is_primary)) FILTER (WHERE sd.id IS NOT NULL), '[]') AS saeb_descriptors
             FROM questions q
             JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
             LEFT JOIN alternatives a ON a.question_id = q.id AND a.revision = qr.revision
             LEFT JOIN question_skills qs ON qs.question_id = q.id AND qs.revision = qr.revision
             LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
             LEFT JOIN question_saeb_descriptors qsd ON qsd.question_id = q.id AND qsd.revision = qr.revision
             LEFT JOIN saeb_descriptors sd ON sd.id = qsd.descriptor_id
             LEFT JOIN saeb_topics st ON st.id = sd.topic_id
             WHERE q.institution_id = ANY($1::uuid[]) AND q.status = 'approved'
               AND q.id = ANY($2::uuid[])
             GROUP BY q.id, qr.question_id, qr.revision`,
      values: [[institutionId, questionBankId], questionIds],
    });
    if (questions.rowCount !== questionIds.length) {
      const error = new Error(
        'Somente questões aprovadas podem entrar na avaliação. Atualize a seleção de questões.',
      );
      error.statusCode = 422;
      throw error;
    }
    assertAssessmentQuestionStyle(questions.rows, value.template);
    const questionById = new Map(
      questions.rows.map((question) => [question.id, question]),
    );
    for (const section of value.sections) {
      if (
        section.questionIds.some(
          (questionId) =>
            questionById.get(questionId)?.subject !== section.subject,
        )
      ) {
        throw new Error(
          'A disciplina da seção não corresponde às questões selecionadas.',
        );
      }
    }
    const assessment = await client.query(
      `INSERT INTO assessments (institution_id, title, subject, grade, instructions, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'frozen', $6) RETURNING id`,
      [
        institutionId,
        value.title,
        assessmentSubject,
        value.grade,
        value.instructions.join('\n'),
        userId,
      ],
    );
    const versions = [];
    for (let index = 0; index < value.versionCount; index++) {
      const versionId = crypto.randomUUID();
      const code = String.fromCharCode(65 + index);
      const seed = Date.now() + index * 7919;
      let questionNumber = 0;
      const snapshotSections = value.sections.map((section, sectionIndex) => {
        const fullWidthQuestionIds = new Set(section.fullWidthQuestionIds);
        const sectionQuestions = section.questionIds.map((id) =>
          questionById.get(id),
        );
        const ordered = value.shuffleQuestions
          ? seededShuffle(sectionQuestions, seed + sectionIndex * 997)
          : sectionQuestions;
        const snapshotQuestions = ordered.map((question, position) => {
          const alternatives =
            question.type === 'true_false'
              ? question.alternatives
              : seededShuffle(
                  question.alternatives,
                  seed + sectionIndex * 997 + position + 1,
                );
          questionNumber += 1;
          return {
            id: crypto.randomUUID(),
            sourceQuestionId: question.id,
            sourceRevision: question.current_revision,
            number: questionNumber,
            type: question.type,
            statement: question.statement,
            source: {
              institution: question.source_institution,
              year: question.source_year,
            },
            difficulty: question.difficulty,
            knowledgeTopic: question.knowledge_topic,
            alternatives: alternatives.map((answer, answerIndex) => ({
              stableKey: answer.stableKey,
              label:
                question.type === 'true_false'
                  ? answer.stableKey === 'alt-a'
                    ? 'C'
                    : 'E'
                  : String.fromCharCode(65 + answerIndex),
              content: answer.content,
            })),
            answer: {
              correctStableKeys: alternatives
                .filter((answer) => answer.isCorrect)
                .map((answer) => answer.stableKey),
              explanation: question.explanation || [],
            },
            points:
              value.questionPoints[question.id] ??
              Number(question.default_points),
            fullWidth: questionUsesFullWidth(question, fullWidthQuestionIds),
            recommendSingleColumn: question.recommend_single_column === true,
            skills: question.skills,
            saebDescriptors: question.saeb_descriptors,
          };
        });
        return {
          id: crypto.randomUUID(),
          title: section.title || section.subject,
          subject: section.subject,
          columns: section.columns,
          startOnNewPage: section.startOnNewPage,
          questions: snapshotQuestions,
        };
      });
      const snapshotQuestions = snapshotSections.flatMap(
        (section) => section.questions,
      );
      const snapshot = {
        schemaVersion: '1.0',
        assessment: {
          id: assessment.rows[0].id,
          title: value.title,
          subject: assessmentSubject,
          grade: value.grade,
          instructions: value.instructions,
          header: {
            institutionName:
              value.header?.institutionName || institution.rows[0].name,
            teacherName: value.header?.teacherName || '',
            className: value.header?.className || '',
            term: value.header?.term || '',
            date: value.header?.date || '',
            transcriptionPhrase: value.header?.transcriptionPhrase || '',
          },
        },
        institution: {
          id: institutionId,
          name: value.header?.institutionName || institution.rows[0].name,
          logoDataUrl: value.header?.logoDataUrl || undefined,
        },
        version: {
          id: versionId,
          code,
          seed,
          generatedAt: new Date().toISOString(),
          qrPayload: `CB1:${versionId}:${signQrId(versionId)}`,
        },
        candidateFields: ['name', 'class', 'number', 'date'],
        sections: snapshotSections,
        questions: snapshotQuestions,
        totals: {
          points: snapshotQuestions.reduce(
            (sum, question) => sum + question.points,
            0,
          ),
          questions: snapshotQuestions.length,
        },
        render: {
          locale: 'pt-BR',
          paper: value.paper,
          mode: 'student',
          template: value.template,
          font: value.font,
          fontSize: value.fontSize,
          showBnccSkills: value.showBnccSkills,
          showSaebDescriptors: value.showSaebDescriptors,
          showStudentPhoto: value.showStudentPhoto,
        },
      };
      const answerKey = snapshotQuestions.map((question) => ({
        number: question.number,
        type: question.type,
        correctStableKeys: question.answer.correctStableKeys,
        manualReview: question.type === 'essay',
      }));
      const version = await client.query(
        `INSERT INTO assessment_versions (id, assessment_id, code, seed, snapshot, answer_key) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING id`,
        [
          versionId,
          assessment.rows[0].id,
          code,
          seed,
          JSON.stringify(snapshot),
          JSON.stringify(answerKey),
        ],
      );
      const renderJob = await client.query(
        `INSERT INTO render_jobs (assessment_version_id, template_version) VALUES ($1, $2) RETURNING id`,
        [version.rows[0].id, value.template],
      );
      versions.push({
        id: version.rows[0].id,
        code,
        status: 'queued',
        renderJobId: renderJob.rows[0].id,
      });
    }
    await client.query(
      `INSERT INTO usage_events(institution_id,user_id,kind,metadata)
       VALUES($1,$2,'assessment',$3::jsonb)`,
      [
        institutionId,
        userId,
        JSON.stringify({ assessmentId: assessment.rows[0].id }),
      ],
    );
    return {
      id: assessment.rows[0].id,
      title: value.title,
      status: 'frozen',
      versions,
    };
  });
}

export { seededShuffle };

export async function listAssessments({ institutionId, ownerId = null }) {
  const result = await pool.query({
    text: `SELECT a.id, a.title, a.subject, a.grade, a.status, a.created_at,
                  COUNT(DISTINCT av.id)::int AS version_count,
                  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed_renders,
                  COUNT(DISTINCT s.id)::int AS submission_count
           FROM assessments a
           LEFT JOIN assessment_versions av ON av.assessment_id = a.id
           LEFT JOIN render_jobs rj ON rj.assessment_version_id = av.id
           LEFT JOIN assessment_submissions s ON s.assessment_version_id = av.id
           WHERE a.institution_id = $1 AND ${ownsAssessment('a', '$2')}
           GROUP BY a.id
           ORDER BY a.created_at DESC
           LIMIT 100`,
    values: [institutionId, ownerId],
  });
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    status: row.status,
    versionCount: row.version_count,
    completedRenders: row.completed_renders,
    submissionCount: row.submission_count,
    createdAt: row.created_at,
  }));
}

export async function getAssessment({ institutionId, assessmentId }) {
  const assessment = await pool.query({
    text: `SELECT id, title, subject, grade, instructions, status, created_at
           FROM assessments
           WHERE id = $1 AND institution_id = $2`,
    values: [assessmentId, institutionId],
  });
  if (!assessment.rowCount) return null;
  const versions = await pool.query({
    text: `SELECT av.id, av.code, av.seed, av.snapshot, av.created_at,
                  rj.id AS render_job_id, rj.template_version,
                  rj.status AS render_status, rj.error_message,
                  rj.created_at AS render_created_at,rj.completed_at AS render_completed_at,
                  (SELECT COUNT(*) FROM assessment_submissions s WHERE s.assessment_version_id=av.id)::int AS submission_count
           FROM assessment_versions av
           LEFT JOIN LATERAL (SELECT * FROM render_jobs j WHERE j.assessment_version_id=av.id AND j.application_student_id IS NULL ORDER BY j.created_at DESC,j.id DESC LIMIT 1) rj ON true
           WHERE av.assessment_id = $1 ORDER BY av.code`,
    values: [assessmentId],
  });
  const row = assessment.rows[0];
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    instructions: row.instructions ? row.instructions.split('\n') : [],
    status: row.status,
    createdAt: row.created_at,
    versions: versions.rows.map((version) => ({
      id: version.id,
      code: version.code,
      seed: Number(version.seed),
      snapshot: version.snapshot,
      template: version.template_version,
      submissionCount: version.submission_count,
      createdAt: version.created_at,
      renderJob: version.render_job_id
        ? {
            id: version.render_job_id,
            status: version.render_status,
            error:
              version.render_status === 'failed' ? version.error_message : null,
            createdAt: version.render_created_at,
            completedAt: version.render_completed_at,
          }
        : null,
    })),
  };
}

export async function deleteAssessment({
  institutionId,
  userId,
  assessmentId,
  unlinkUnsentApplications = false,
}) {
  return transaction(async (client) => {
    const assessment = await client.query(
      `SELECT id FROM assessments
       WHERE id = $1 AND institution_id = $2 AND created_by = $3
       FOR UPDATE`,
      [assessmentId, institutionId, userId],
    );
    if (!assessment.rowCount)
      throw Object.assign(new Error('Avaliação não encontrada.'), {
        statusCode: 404,
      });

    const applications = await client.query(
      `SELECT id, status FROM assessment_applications
       WHERE assessment_id = $1 ORDER BY id FOR UPDATE`,
      [assessmentId],
    );
    const versions = await client.query(
      `SELECT id FROM assessment_versions WHERE assessment_id = $1 FOR UPDATE`,
      [assessmentId],
    );
    const versionIds = versions.rows.map((row) => row.id);
    const submissions = versionIds.length
      ? await client.query(
          `SELECT id FROM assessment_submissions
           WHERE assessment_version_id = ANY($1::uuid[]) LIMIT 1`,
          [versionIds],
        )
      : { rowCount: 0 };
    if (submissions.rowCount)
      throw Object.assign(
        new Error(
          'Esta prova já tem respostas registradas e não pode ser excluída para preservar o histórico dos alunos.',
        ),
        { statusCode: 409 },
      );

    if (applications.rowCount) {
      if (!unlinkUnsentApplications)
        throw Object.assign(
          new Error(
            'Esta prova está vinculada a uma ou mais aplicações. Marque “Desvincular aplicações não aplicadas” (ou use “Desvincular e excluir”) para excluir, se nenhum cartão foi enviado ou respondido.',
          ),
          { statusCode: 409 },
        );

      if (
        applications.rows.some(
          (application) =>
            !['scheduled', 'cancelled'].includes(application.status),
        )
      )
        throw Object.assign(
          new Error(
            'Não é possível desvincular: existe uma aplicação aberta ou encerrada. O histórico dos alunos foi preservado.',
          ),
          { statusCode: 409 },
        );

      const applicationIds = applications.rows.map(
        (application) => application.id,
      );
      const assignments = await client.query(
        `SELECT id FROM application_students
         WHERE application_id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [applicationIds],
      );
      const assignmentIds = assignments.rows.map((assignment) => assignment.id);
      const jobs = assignmentIds.length
        ? await client.query(
            `SELECT id, status FROM render_jobs
             WHERE application_student_id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
            [assignmentIds],
          )
        : { rows: [] };
      const scans = await client.query(
        `SELECT 1 FROM card_scans
         WHERE expected_application_id = ANY($1::uuid[])
            OR application_student_id = ANY($2::uuid[])
         LIMIT 1`,
        [applicationIds, assignmentIds],
      );
      if (scans.rowCount)
        throw Object.assign(
          new Error(
            'Não é possível desvincular: já existe cartão enviado ou leitura vinculada a esta aplicação.',
          ),
          { statusCode: 409 },
        );
      // Cartões já gerados, mas nunca enviados nem lidos, não têm histórico de
      // aluno: podem ser descartados. Só a geração em andamento bloqueia, para
      // não disputar o registro com o worker de renderização.
      if (jobs.rows.some((job) => job.status === 'running'))
        throw Object.assign(
          new Error(
            'Não é possível desvincular agora: há cartões sendo gerados. Aguarde a geração terminar e tente novamente.',
          ),
          { statusCode: 409 },
        );

      // Remove somente aplicações sem leituras ou respostas; turma e alunos
      // permanecem intactos. Cartões gerados dessas aplicações são descartados.
      await client.query(
        'DELETE FROM assessment_applications WHERE id = ANY($1::uuid[])',
        [applicationIds],
      );
    }

    await client.query(
      'DELETE FROM assessment_workspaces WHERE assessment_id = $1',
      [assessmentId],
    );
    await client.query('DELETE FROM assessments WHERE id = $1', [assessmentId]);
    return { id: assessmentId, deleted: true };
  });
}

export async function regenerateAssessment({ institutionId, assessmentId }) {
  return transaction(async (client) => {
    const a = await client.query(
      'SELECT id FROM assessments WHERE id=$1 AND institution_id=$2 FOR UPDATE',
      [assessmentId, institutionId],
    );
    if (!a.rowCount)
      throw Object.assign(new Error('Avaliação não encontrada.'), {
        statusCode: 404,
      });
    const versions = await client.query(
      'SELECT id,code,snapshot FROM assessment_versions WHERE assessment_id=$1 ORDER BY code',
      [assessmentId],
    );
    const result = [];
    for (const v of versions.rows) {
      let job = await client.query(
        "SELECT id,status FROM render_jobs WHERE assessment_version_id=$1 AND application_student_id IS NULL AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",
        [v.id],
      );
      if (!job.rowCount)
        job = await client.query(
          'INSERT INTO render_jobs(assessment_version_id,template_version) VALUES($1,$2) RETURNING id,status',
          [v.id, v.snapshot.render.template],
        );
      result.push({
        code: v.code,
        renderJobId: job.rows[0].id,
        status: job.rows[0].status,
      });
    }
    return result;
  });
}
