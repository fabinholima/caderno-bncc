import { z } from 'zod';
import { pool, transaction } from './db.mjs';

const forbiddenMetaPost =
  /(?:\\|runscript|scantokens|readfrom|write\s|closefrom|closeout|input\s|loadmodule|verbatimtex|btex|etex)/i;

export const metapostCodeSchema = z
  .string()
  .trim()
  .max(50_000)
  .refine(
    (code) => !code || !forbiddenMetaPost.test(code),
    'O código MetaPost contém um comando não permitido no ambiente seguro.',
  );

const richParagraph = (text) => [{ type: 'paragraph', text }];
const richStatement = (text, metapostCode) => [
  ...richParagraph(text),
  ...(metapostCode ? [{ type: 'metapost', code: metapostCode }] : []),
];

export const createQuestionSchema = z
  .object({
    type: z.enum(['single_choice', 'multiple_choice', 'essay']),
    statement: z.string().trim().min(10).max(20_000),
    metapostCode: metapostCodeSchema.optional().or(z.literal('')),
    answerGuide: z.string().trim().max(20_000).optional().or(z.literal('')),
    subject: z.string().trim().min(2).max(120),
    grade: z.string().trim().min(2).max(40),
    sourceInstitution: z.string().trim().min(2).max(160),
    sourceYear: z.number().int().min(1900).max(2100),
    skill: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}[0-9A-Z]{4,12}$/)
      .optional()
      .or(z.literal('')),
    knowledgeObjectId: z.string().uuid().optional().or(z.literal('')),
    difficulty: z.enum(['Fácil', 'Média', 'Difícil']),
    alternatives: z
      .array(
        z.object({
          stableKey: z.string().regex(/^alt-[a-z]$/),
          content: z.string().trim().min(1).max(5_000),
          isCorrect: z.boolean(),
          position: z.number().int().min(1).max(10),
        }),
      )
      .max(10),
  })
  .superRefine((value, ctx) => {
    const correct = value.alternatives.filter(
      (answer) => answer.isCorrect,
    ).length;
    if (
      value.type === 'single_choice' &&
      (value.alternatives.length < 2 || correct !== 1)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Questões de resposta única precisam de exatamente uma alternativa correta.',
        path: ['alternatives'],
      });
    }
    if (
      value.type === 'multiple_choice' &&
      (value.alternatives.length < 2 || correct < 2)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Questões de respostas múltiplas precisam de pelo menos duas alternativas corretas.',
        path: ['alternatives'],
      });
    }
    if (value.type === 'essay' && value.alternatives.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Questões discursivas não usam alternativas.',
        path: ['alternatives'],
      });
    }
    if (value.type === 'essay' && !value.answerGuide) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe a resposta esperada ou os critérios de correção.',
        path: ['answerGuide'],
      });
    }
  });

export const questionStatusSchema = z.object({
  status: z.enum(['draft', 'review', 'approved', 'archived']),
});

const difficultyToDb = { Fácil: 'easy', Média: 'medium', Difícil: 'hard' };
const difficultyFromDb = { easy: 'Fácil', medium: 'Média', hard: 'Difícil' };
const statusFromDb = {
  draft: 'Rascunho',
  review: 'Em revisão',
  approved: 'Aprovada',
  archived: 'Arquivada',
};

export async function listQuestions({
  institutionId,
  query = '',
  subject = '',
}) {
  const result = await pool.query({
    text: `
      SELECT q.id, q.public_code, q.status, q.updated_at,
             qr.statement, qr.type, qr.subject, qr.grade, qr.difficulty,
             qr.source_institution, qr.source_year,
             COALESCE(cs.code, 'Não vinculada') AS skill,
             COALESCE(ko.name, 'Não vinculado') AS knowledge_object,
             COUNT(a.id)::int AS alternatives
      FROM questions q
      JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
      LEFT JOIN question_skills qs ON qs.question_id = qr.question_id AND qs.revision = qr.revision AND qs.is_primary
      LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
      LEFT JOIN knowledge_objects ko ON ko.id = cs.knowledge_object_id
      LEFT JOIN alternatives a ON a.question_id = qr.question_id AND a.revision = qr.revision
      WHERE q.institution_id = $1
        AND ($2 = '' OR qr.subject = $2)
        AND ($3 = '' OR to_tsvector('portuguese', qr.statement::text) @@ plainto_tsquery('portuguese', $3)
             OR q.public_code ILIKE '%' || $3 || '%' OR cs.code ILIKE '%' || $3 || '%'
             OR qr.source_institution ILIKE '%' || $3 || '%' OR qr.source_year::text = $3)
      GROUP BY q.id, qr.question_id, qr.revision, cs.code, ko.name
      ORDER BY q.updated_at DESC
      LIMIT 100`,
    values: [institutionId, subject === 'Todas' ? '' : subject, query],
  });
  return result.rows.map((row) => ({
    id: row.id,
    code: row.public_code,
    statement:
      row.statement?.find((node) => node.type === 'paragraph')?.text ?? '',
    type: row.type,
    subject: row.subject,
    grade: row.grade,
    sourceInstitution: row.source_institution,
    sourceYear: row.source_year,
    skill: row.skill,
    knowledgeObject: row.knowledge_object,
    difficulty: difficultyFromDb[row.difficulty],
    status: statusFromDb[row.status],
    alternatives: row.alternatives,
    updatedAt: new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(row.updated_at),
  }));
}

export async function getQuestion({ institutionId, questionId }) {
  const result = await pool.query({
    text: `SELECT q.id, q.public_code, q.current_revision, q.status, q.updated_at,
                  qr.type, qr.statement, qr.explanation, qr.difficulty,
                  qr.default_points, qr.subject, qr.grade,
                  qr.source_institution, qr.source_year,
                  COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                    'stableKey', a.stable_key,
                    'content', a.content,
                    'isCorrect', a.is_correct,
                    'position', a.position
                  )) FILTER (WHERE a.id IS NOT NULL), '[]') AS alternatives,
                  COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                    'id', cs.id,
                    'code', cs.code,
                    'description', cs.description,
                    'isPrimary', qs.is_primary,
                    'knowledgeObjectId', cs.knowledge_object_id
                  )) FILTER (WHERE cs.id IS NOT NULL), '[]') AS skills
           FROM questions q
           JOIN question_revisions qr
             ON qr.question_id = q.id AND qr.revision = q.current_revision
           LEFT JOIN alternatives a
             ON a.question_id = qr.question_id AND a.revision = qr.revision
           LEFT JOIN question_skills qs
             ON qs.question_id = qr.question_id AND qs.revision = qr.revision
           LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
           WHERE q.id = $1 AND q.institution_id = $2
           GROUP BY q.id, qr.question_id, qr.revision`,
    values: [questionId, institutionId],
  });
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    code: row.public_code,
    revision: row.current_revision,
    status: row.status,
    type: row.type,
    statement: row.statement,
    explanation: row.explanation || [],
    difficulty: row.difficulty,
    defaultPoints: Number(row.default_points),
    subject: row.subject,
    grade: row.grade,
    sourceInstitution: row.source_institution,
    sourceYear: row.source_year,
    alternatives: [...row.alternatives].sort((a, b) => a.position - b.position),
    skills: row.skills,
    updatedAt: row.updated_at,
  };
}

async function insertRevision({ client, questionId, revision, userId, value }) {
  await client.query(
    `INSERT INTO question_revisions
       (question_id, revision, type, statement, explanation, difficulty, subject, grade, source_institution, source_year, authored_by)
     VALUES ($1, $2, $3, $4::jsonb, NULLIF($5, '')::jsonb, $6, $7, $8, $9, $10, $11)`,
    [
      questionId,
      revision,
      value.type,
      JSON.stringify(richStatement(value.statement, value.metapostCode)),
      value.answerGuide
        ? JSON.stringify([{ type: 'paragraph', text: value.answerGuide }])
        : '',
      difficultyToDb[value.difficulty],
      value.subject,
      value.grade,
      value.sourceInstitution,
      value.sourceYear,
      userId,
    ],
  );
  for (const alternative of value.alternatives) {
    await client.query(
      `INSERT INTO alternatives (question_id, revision, stable_key, content, is_correct, position)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        questionId,
        revision,
        alternative.stableKey,
        JSON.stringify(richParagraph(alternative.content)),
        alternative.isCorrect,
        alternative.position,
      ],
    );
  }
  if (value.skill) {
    const skill = await client.query(
      `SELECT id FROM curriculum_skills
       WHERE code = $1 AND subject = $2
         AND ($3::uuid IS NULL OR knowledge_object_id = $3::uuid)
       ORDER BY curriculum_version DESC LIMIT 1`,
      [value.skill, value.subject, value.knowledgeObjectId || null],
    );
    if (!skill.rowCount)
      throw Object.assign(
        new Error(
          'A habilidade informada não pertence à classificação selecionada.',
        ),
        { statusCode: 422 },
      );
    await client.query(
      `INSERT INTO question_skills
         (question_id, revision, skill_id, is_primary)
       VALUES ($1, $2, $3, true)`,
      [questionId, revision, skill.rows[0].id],
    );
  }
}

export async function createQuestion({ institutionId, userId, input }) {
  const value = createQuestionSchema.parse(input);
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [
      institutionId,
    ]);
    const sequence = await client.query(
      'SELECT COUNT(*)::int + 1 AS next FROM questions WHERE institution_id = $1',
      [institutionId],
    );
    const prefix =
      value.subject === 'Matemática'
        ? 'MAT'
        : value.subject === 'Química'
          ? 'QUI'
          : value.subject === 'Ciências'
            ? 'CIE'
            : value.subject === 'História'
              ? 'HIS'
              : 'LP';
    const publicCode = `${prefix}-${String(sequence.rows[0].next).padStart(4, '0')}`;
    const question = await client.query(
      `INSERT INTO questions (institution_id, public_code, created_by) VALUES ($1, $2, $3)
       RETURNING id, public_code, status, updated_at`,
      [institutionId, publicCode, userId],
    );
    await insertRevision({
      client,
      questionId: question.rows[0].id,
      revision: 1,
      userId,
      value,
    });
    return {
      id: question.rows[0].id,
      code: publicCode,
      statement: value.statement,
      type: value.type,
      subject: value.subject,
      grade: value.grade,
      sourceInstitution: value.sourceInstitution,
      sourceYear: value.sourceYear,
      skill: value.skill || 'Não vinculada',
      knowledgeObject: 'Vinculado pela habilidade',
      difficulty: value.difficulty,
      status: 'Rascunho',
      alternatives: value.alternatives.length,
      updatedAt: 'Agora',
    };
  });
}

export async function createQuestionRevision({
  institutionId,
  userId,
  questionId,
  input,
}) {
  const value = createQuestionSchema.parse(input);
  return transaction(async (client) => {
    const question = await client.query(
      `SELECT id, public_code, current_revision
       FROM questions
       WHERE id = $1 AND institution_id = $2
       FOR UPDATE`,
      [questionId, institutionId],
    );
    if (!question.rowCount)
      throw Object.assign(new Error('Questão não encontrada.'), {
        statusCode: 404,
      });
    const revision = question.rows[0].current_revision + 1;
    await insertRevision({ client, questionId, revision, userId, value });
    await client.query(
      `UPDATE questions
       SET current_revision = $2, status = 'draft', updated_at = now()
       WHERE id = $1`,
      [questionId, revision],
    );
    return {
      id: questionId,
      code: question.rows[0].public_code,
      revision,
      status: 'draft',
    };
  });
}

export async function setQuestionStatus({ institutionId, questionId, input }) {
  const value = questionStatusSchema.parse(input);
  const result = await pool.query(
    `UPDATE questions
     SET status = $3, updated_at = now()
     WHERE id = $1 AND institution_id = $2
     RETURNING id, public_code, current_revision, status, updated_at`,
    [questionId, institutionId, value.status],
  );
  if (!result.rowCount) return null;
  return {
    id: result.rows[0].id,
    code: result.rows[0].public_code,
    revision: result.rows[0].current_revision,
    status: result.rows[0].status,
    updatedAt: result.rows[0].updated_at,
  };
}
