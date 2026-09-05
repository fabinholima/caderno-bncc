import { z } from 'zod';
import crypto from 'node:crypto';
import {
  DEFAULT_RENDER_TEMPLATE,
  DEFAULT_RENDER_FONT,
  renderFontIds,
  renderTemplateIds,
} from '../../lib/render-templates.mjs';
import { assertInstitutionLimit } from './auth.mjs';
import { pool, transaction } from './db.mjs';

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
  institutionName: z.string().trim().min(2).max(180),
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
    sections: z
      .array(
        z.object({
          subject: z.string().trim().min(2).max(120),
          title: z.string().trim().min(2).max(180).optional(),
          columns: z.union([z.literal(1), z.literal(2)]).default(1),
          startOnNewPage: z.boolean().default(true),
          questionIds: z.array(z.string().uuid()).min(1).max(100),
        }),
      )
      .min(1)
      .max(20),
    versionCount: z.number().int().min(1).max(6),
    paper: z.enum(['A4', 'A5']).default('A4'),
    template: z.enum(renderTemplateIds).default(DEFAULT_RENDER_TEMPLATE),
    font: z.enum(renderFontIds).default(DEFAULT_RENDER_FONT),
    fontSize: z.number().int().min(10).max(16).default(11),
    showBnccSkills: z.boolean().default(false),
    instructions: z
      .array(z.string().trim().min(1).max(500))
      .max(10)
      .default([]),
  })
  .superRefine((value, context) => {
    const questionIds = value.sections.flatMap(
      (section) => section.questionIds,
    );
    if (questionIds.length > 100) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 100,
        inclusive: true,
        type: 'array',
        path: ['sections'],
        message: 'A avaliação pode ter no máximo 100 questões.',
      });
    }
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: 'Uma questão não pode aparecer em mais de uma seção.',
      });
    }
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

export async function createAssessment({ institutionId, userId, input }) {
  await assertInstitutionLimit({ institutionId, kind: 'assessment' });
  const value = createAssessmentSchema.parse(input);
  const questionIds = value.sections.flatMap((section) => section.questionIds);
  const assessmentSubject =
    value.sections.length === 1
      ? value.sections[0].subject
      : 'Multidisciplinar';
  return transaction(async (client) => {
    const institution = await client.query(
      'SELECT name FROM institutions WHERE id = $1',
      [institutionId],
    );
    const questions = await client.query({
      text: `SELECT q.id, q.current_revision, qr.type, qr.statement, qr.explanation, qr.default_points,
                    qr.subject, qr.grade,
                    qr.source_institution, qr.source_year, qr.difficulty, qr.knowledge_topic,
                    COALESCE(jsonb_agg(jsonb_build_object('stableKey', a.stable_key, 'content', a.content, 'isCorrect', a.is_correct) ORDER BY a.position) FILTER (WHERE a.id IS NOT NULL), '[]') AS alternatives,
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('code', cs.code, 'primary', qs.is_primary)) FILTER (WHERE cs.id IS NOT NULL), '[]') AS skills
             FROM questions q
             JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
             LEFT JOIN alternatives a ON a.question_id = q.id AND a.revision = qr.revision
             LEFT JOIN question_skills qs ON qs.question_id = q.id AND qs.revision = qr.revision
             LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
             WHERE q.institution_id = $1 AND q.status <> 'archived'
               AND q.id = ANY($2::uuid[])
             GROUP BY q.id, qr.question_id, qr.revision`,
      values: [institutionId, questionIds],
    });
    if (questions.rowCount !== questionIds.length) {
      const error = new Error(
        'Uma ou mais questões estão arquivadas ou não pertencem à instituição.',
      );
      error.statusCode = 422;
      throw error;
    }
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
        const sectionQuestions = section.questionIds.map((id) =>
          questionById.get(id),
        );
        const ordered = seededShuffle(
          sectionQuestions,
          seed + sectionIndex * 997,
        );
        const snapshotQuestions = ordered.map((question, position) => {
          const alternatives = seededShuffle(
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
              label: String.fromCharCode(65 + answerIndex),
              content: answer.content,
            })),
            answer: {
              correctStableKeys: alternatives
                .filter((answer) => answer.isCorrect)
                .map((answer) => answer.stableKey),
              explanation: question.explanation || [],
            },
            points: Number(question.default_points),
            skills: question.skills,
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
          qrPayload: `CB1:${versionId}:${crypto
            .createHmac(
              'sha256',
              process.env.QR_SIGNING_SECRET || 'caderno-local-development',
            )
            .update(versionId)
            .digest('hex')
            .slice(0, 20)}`,
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

export async function listAssessments({ institutionId }) {
  const result = await pool.query({
    text: `SELECT a.id, a.title, a.subject, a.grade, a.status, a.created_at,
                  COUNT(DISTINCT av.id)::int AS version_count,
                  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed')::int AS completed_renders,
                  COUNT(DISTINCT s.id)::int AS submission_count
           FROM assessments a
           LEFT JOIN assessment_versions av ON av.assessment_id = a.id
           LEFT JOIN render_jobs rj ON rj.assessment_version_id = av.id
           LEFT JOIN assessment_submissions s ON s.assessment_version_id = av.id
           WHERE a.institution_id = $1
           GROUP BY a.id
           ORDER BY a.created_at DESC
           LIMIT 100`,
    values: [institutionId],
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
                  rj.created_at AS render_created_at,
                  rj.completed_at AS render_completed_at,
                  COUNT(s.id)::int AS submission_count
           FROM assessment_versions av
           LEFT JOIN render_jobs rj ON rj.assessment_version_id = av.id
           LEFT JOIN assessment_submissions s ON s.assessment_version_id = av.id
           WHERE av.assessment_id = $1
           GROUP BY av.id, rj.id
           ORDER BY av.code`,
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
