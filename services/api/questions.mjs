import { z } from 'zod';
import { pool, transaction } from './db.mjs';

const forbiddenMetaPost =
  /(?:\\|runscript|scantokens|readfrom|write\s|closefrom|closeout|input\s|loadmodule|verbatimtex|btex|etex)/i;

const forbiddenContextFormula =
  /\\(?:input|include|read|write|openin|openout|closein|closeout|directlua|ctxlua|latelua|usemodule|environment|component|product|project|starttext|stoptext|startMPcode|startluacode|xmlprocess|processfile)\b/i;

export const metapostCodeSchema = z
  .string()
  .trim()
  .max(50_000)
  .refine(
    (code) => !code || !forbiddenMetaPost.test(code),
    'O código MetaPost contém um comando não permitido no ambiente seguro.',
  );

const allowedMathCommands = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'varpi',
  'rho',
  'varrho',
  'sigma',
  'varsigma',
  'tau',
  'upsilon',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'Gamma',
  'Theta',
  'Lambda',
  'Xi',
  'Pi',
  'Sigma',
  'Upsilon',
  'Phi',
  'Psi',
  'Omega',
  'Delta',
  'approx',
  'cdot',
  'circ',
  'div',
  'frac',
  'ge',
  'le',
  'left',
  'mathrm',
  'neq',
  'pm',
  'qquad',
  'right',
  'sqrt',
  'text',
  'times',
  'rightarrow',
  'leftarrow',
  'leftrightarrow',
  'Rightarrow',
  'Leftarrow',
  'Leftrightarrow',
  'infty',
  'ell',
  'partial',
  'nabla',
  'sum',
  'prod',
  'int',
  'oint',
  'lim',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'min',
  'max',
  'equiv',
  'sim',
  'simeq',
  'cong',
  'propto',
  'll',
  'gg',
  'in',
  'notin',
  'subset',
  'subseteq',
  'supset',
  'supseteq',
  'cup',
  'cap',
  'emptyset',
  'forall',
  'exists',
  'neg',
  'land',
  'lor',
  'oplus',
  'otimes',
  'overline',
  'underline',
  'vec',
  'hat',
  'bar',
  'overrightarrow',
  'left',
  'right',
  'langle',
  'rangle',
  'cdots',
  'ldots',
  'vdots',
  'ddots',
]);

export const mathFormulaSchema = z
  .string()
  .trim()
  .max(2_000)
  .refine(
    (formula) =>
      !formula ||
      [...formula.matchAll(/\\([A-Za-z]+)/g)].every((match) =>
        allowedMathCommands.has(match[1]),
      ),
    'A fórmula matemática contém um comando não permitido.',
  );

export const chemicalFormulaSchema = z
  .string()
  .trim()
  .max(2_000)
  .refine(
    (formula) =>
      !formula ||
      (/^[A-Za-z0-9_{}()[\]+\-.=<>^\s]+$/.test(formula) &&
        !/[{}]{2}|[\\#$%&]/.test(formula)),
    'A fórmula química contém caracteres não permitidos.',
  );

const richContentNodeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('paragraph'),
    text: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    type: z.literal('romanList'),
    items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(30),
  }),
  z.object({
    type: z.literal('math'),
    tex: mathFormulaSchema,
    display: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('contextFormula'),
    code: z
      .string()
      .trim()
      .min(1)
      .max(4_000)
      .refine((code) => {
        const allowed = new Set([
          'chemical',
          'unit',
          'Delta',
          'ell',
          'qquad',
          'quad',
          'frac',
          'sqrt',
          'cdot',
          'times',
          'pm',
          'approx',
          'mathrm',
        ]);
        return (
          !forbiddenContextFormula.test(code) &&
          [...code.matchAll(/\\([A-Za-z]+)/g)].every((match) =>
            allowed.has(match[1]),
          )
        );
      }, 'A fórmula contém um comando ConTeXt não permitido.'),
  }),
  z.object({
    type: z.literal('contextInline'),
    code: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .refine((code) => {
        const allowed = new Set([
          'chemical',
          'unit',
          'Delta',
          'ell',
          'quad',
          'frac',
          'sqrt',
          'cdot',
          'times',
          'pm',
          'approx',
          'mathrm',
          'bold',
        ]);
        return (
          !forbiddenContextFormula.test(code) &&
          [...code.matchAll(/\\([A-Za-z]+)/g)].every((match) =>
            allowed.has(match[1]),
          )
        );
      }, 'O trecho em linha contém um comando ConTeXt não permitido.'),
  }),
  z.object({
    type: z.literal('chemical'),
    formula: chemicalFormulaSchema,
    display: z.boolean().default(true),
    conditionAbove: z.string().trim().max(100).default(''),
    conditionBelow: z.string().trim().max(100).default(''),
  }),
  z.object({
    type: z.literal('thermochemicalEquation'),
    equation: chemicalFormulaSchema,
    temperature: z
      .string()
      .trim()
      .regex(/^[0-9]+(?:[.,][0-9]+)? degrees celsius$/i),
    enthalpy: z
      .string()
      .trim()
      .regex(/^-?[0-9]+(?:[.,][0-9]+)? kilo joule$/i),
  }),
  z.object({
    type: z.literal('chemicalStructure'),
    preset: z.enum(['benzene', 'cyclohexane']),
    caption: z.string().trim().max(120).default(''),
  }),
  z.object({
    type: z.literal('image'),
    dataUrl: z
      .string()
      .max(550_000)
      .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
      .refine((value) => {
        const encoded = value.slice(value.indexOf(',') + 1);
        return Buffer.byteLength(encoded, 'base64') <= 400_000;
      }, 'A imagem deve ter no máximo 400 KB.'),
    alt: z.string().trim().min(1).max(240),
    caption: z.string().trim().max(240).default(''),
  }),
]);

const richContentSchema = z.array(richContentNodeSchema).min(1).max(50);

const richParagraph = (text) => [{ type: 'paragraph', text }];
const richStatement = (text, mathFormula, chemicalFormula, metapostCode) => [
  ...richParagraph(text),
  ...(mathFormula ? [{ type: 'math', tex: mathFormula }] : []),
  ...(chemicalFormula ? [{ type: 'chemical', formula: chemicalFormula }] : []),
  ...(metapostCode ? [{ type: 'metapost', code: metapostCode }] : []),
];

export const createQuestionSchema = z
  .object({
    type: z.enum(['single_choice', 'multiple_choice', 'essay']),
    statement: z.string().trim().min(10).max(20_000),
    statementBlocks: richContentSchema.optional(),
    mathFormula: mathFormulaSchema.optional().or(z.literal('')),
    chemicalFormula: chemicalFormulaSchema.optional().or(z.literal('')),
    metapostCode: metapostCodeSchema.optional().or(z.literal('')),
    answerGuide: z.string().trim().max(20_000).optional().or(z.literal('')),
    answerBlocks: richContentSchema.optional(),
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
    knowledgeObjectId: z.uuid().optional().or(z.literal('')),
    competencyId: z.uuid().optional().or(z.literal('')),
    pedagogicalDisciplineId: z.uuid().optional().or(z.literal('')),
    pedagogicalTopicId: z.uuid().optional().or(z.literal('')),
    knowledgeTopic: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .optional()
      .or(z.literal('')),
    difficulty: z.enum(['Fácil', 'Média', 'Difícil']),
    alternatives: z
      .array(
        z.object({
          stableKey: z.string().regex(/^alt-[a-z]$/),
          content: z.string().trim().min(1).max(5_000),
          contentBlocks: richContentSchema.optional(),
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
      (value.alternatives.length !== 5 || correct !== 1)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Questões de resposta única precisam das alternativas A a E e exatamente uma correta.',
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
    if (value.type === 'essay' && !value.answerGuide && !value.answerBlocks) {
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

export const questionFiltersSchema = z.object({
  stage: z
    .enum(['Ensino Fundamental', 'Ensino Médio'])
    .optional()
    .or(z.literal('')),
  query: z.string().trim().max(200).default(''),
  subject: z.string().trim().max(120).default(''),
  knowledgeObjectId: z.uuid().optional().or(z.literal('')),
  competencyId: z.uuid().optional().or(z.literal('')),
  knowledgeTopic: z.string().trim().max(160).default(''),
  sourceInstitution: z.string().trim().max(160).default(''),
  sourceYear: z.coerce.number().int().min(1900).max(2100).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().or(z.literal('')),
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
  stage = '',
  query = '',
  subject = '',
  knowledgeObjectId = '',
  competencyId = '',
  knowledgeTopic = '',
  sourceInstitution = '',
  sourceYear,
  difficulty = '',
}) {
  const filters = questionFiltersSchema.parse({
    stage,
    query,
    subject,
    knowledgeObjectId,
    competencyId,
    knowledgeTopic,
    sourceInstitution,
    sourceYear: sourceYear || undefined,
    difficulty,
  });
  const result = await pool.query({
    text: `
      SELECT q.id, q.public_code, q.status, q.updated_at,
             qr.statement, qr.type, qr.subject, qr.grade, qr.difficulty,
             qr.source_institution, qr.source_year, qr.knowledge_topic, qr.pedagogical_topic_id,
             COALESCE(cs.stage,
               CASE WHEN qr.grade ILIKE '%médio%' OR qr.grade ILIKE '%série%'
                 THEN 'Ensino Médio' ELSE 'Ensino Fundamental' END) AS stage,
             COALESCE(cs.code, 'Não vinculada') AS skill,
             ko.id AS knowledge_object_id,
             COALESCE(ko.name, 'Não vinculado') AS knowledge_object,
             cc.id AS competency_id,
             cc.number AS competency_number,
             COUNT(a.id)::int AS alternatives
      FROM questions q
      JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
      LEFT JOIN question_skills qs ON qs.question_id = qr.question_id AND qs.revision = qr.revision AND qs.is_primary
      LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
      LEFT JOIN knowledge_objects ko ON ko.id = cs.knowledge_object_id
      LEFT JOIN skill_competencies sc ON sc.skill_id = cs.id
      LEFT JOIN curriculum_competencies cc ON cc.id = sc.competency_id
      LEFT JOIN alternatives a ON a.question_id = qr.question_id AND a.revision = qr.revision
      WHERE q.institution_id = $1
        AND q.status <> 'archived'
        AND ($2 = '' OR qr.subject = $2)
        AND ($3 = '' OR to_tsvector('portuguese', qr.statement::text) @@ plainto_tsquery('portuguese', $3)
             OR q.public_code ILIKE '%' || $3 || '%' OR cs.code ILIKE '%' || $3 || '%'
             OR qr.source_institution ILIKE '%' || $3 || '%' OR qr.source_year::text = $3
             OR qr.knowledge_topic ILIKE '%' || $3 || '%')
        AND ($4::uuid IS NULL OR EXISTS (
          SELECT 1 FROM skill_knowledge_objects filter_sko
          WHERE filter_sko.skill_id = cs.id
            AND filter_sko.knowledge_object_id = $4::uuid
        ))
        AND ($5::uuid IS NULL OR sc.competency_id = $5::uuid)
        AND ($6 = '' OR qr.source_institution = $6)
        AND ($7::integer IS NULL OR qr.source_year = $7::integer)
        AND ($8 = '' OR qr.difficulty::text = $8)
        AND ($9 = '' OR qr.knowledge_topic = $9 OR qr.knowledge_topic LIKE $9 || ' > %')
        AND ($10 = '' OR COALESCE(cs.stage,
          CASE WHEN qr.grade ILIKE '%médio%' OR qr.grade ILIKE '%série%'
            THEN 'Ensino Médio' ELSE 'Ensino Fundamental' END) = $10)
      GROUP BY q.id, qr.question_id, qr.revision, cs.code, cs.stage, ko.id, ko.name,
               cc.id, cc.number
      ORDER BY q.updated_at DESC
      LIMIT 100`,
    values: [
      institutionId,
      filters.subject === 'Todas' ? '' : filters.subject,
      filters.query,
      filters.knowledgeObjectId || null,
      filters.competencyId || null,
      filters.sourceInstitution,
      filters.sourceYear || null,
      filters.difficulty || '',
      filters.knowledgeTopic,
      filters.stage || '',
    ],
  });
  return result.rows.map((row) => ({
    id: row.id,
    code: row.public_code,
    statement:
      row.statement?.find((node) => node.type === 'paragraph')?.text ?? '',
    type: row.type,
    subject: row.subject,
    grade: row.grade,
    stage: row.stage,
    sourceInstitution: row.source_institution,
    sourceYear: row.source_year,
    skill: row.skill,
    knowledgeObjectId: row.knowledge_object_id,
    knowledgeObject: row.knowledge_object,
    knowledgeTopic: row.knowledge_topic,
    pedagogicalTopicId: row.pedagogical_topic_id,
    competencyId: row.competency_id,
    competencyNumber: row.competency_number,
    difficulty: difficultyFromDb[row.difficulty],
    status: statusFromDb[row.status],
    alternatives: row.alternatives,
    updatedAt: new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(row.updated_at),
  }));
}

export async function getQuestionFilterOptions({ institutionId }) {
  const [sources, years] = await Promise.all([
    pool.query(
      `SELECT DISTINCT qr.source_institution AS value
       FROM questions q
       JOIN question_revisions qr
         ON qr.question_id = q.id AND qr.revision = q.current_revision
       WHERE q.institution_id = $1 AND qr.source_institution IS NOT NULL
       ORDER BY value`,
      [institutionId],
    ),
    pool.query(
      `SELECT DISTINCT qr.source_year AS value
       FROM questions q
       JOIN question_revisions qr
         ON qr.question_id = q.id AND qr.revision = q.current_revision
       WHERE q.institution_id = $1 AND qr.source_year IS NOT NULL
       ORDER BY value DESC`,
      [institutionId],
    ),
  ]);
  return {
    sourceInstitutions: sources.rows.map((row) => row.value),
    sourceYears: years.rows.map((row) => row.value),
    difficulties: [
      { id: 'easy', label: 'Fácil' },
      { id: 'medium', label: 'Média' },
      { id: 'hard', label: 'Difícil' },
    ],
  };
}

export async function getQuestion({ institutionId, questionId }) {
  const result = await pool.query({
    text: `SELECT q.id, q.public_code, q.current_revision, q.status, q.updated_at,
                  qr.type, qr.statement, qr.explanation, qr.difficulty,
                  qr.default_points, qr.subject, qr.grade,
                  qr.source_institution, qr.source_year, qr.knowledge_topic, qr.pedagogical_topic_id,
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
    knowledgeTopic: row.knowledge_topic,
    pedagogicalTopicId: row.pedagogical_topic_id,
    alternatives: [...row.alternatives].sort((a, b) => a.position - b.position),
    skills: row.skills,
    updatedAt: row.updated_at,
  };
}

async function insertRevision({
  client,
  questionId,
  revision,
  institutionId,
  userId,
  value,
}) {
  let pedagogicalTopicId = null;
  if (value.pedagogicalTopicId) {
    const topic = await client.query(
      `SELECT topic.id, topic.name, parent.name AS parent_name
       FROM pedagogical_topics topic
       JOIN pedagogical_disciplines pd ON pd.id = topic.discipline_id
       LEFT JOIN pedagogical_topics parent ON parent.id = topic.parent_id
       WHERE topic.id = $1 AND topic.institution_id = $2
         AND ($3::uuid IS NULL OR pd.id = $3::uuid)`,
      [
        value.pedagogicalTopicId,
        institutionId,
        value.pedagogicalDisciplineId || null,
      ],
    );
    if (!topic.rowCount)
      throw Object.assign(
        new Error('O subtópico não pertence à disciplina selecionada.'),
        { statusCode: 422 },
      );
    pedagogicalTopicId = topic.rows[0].id;
    value.knowledgeTopic = [topic.rows[0].parent_name, topic.rows[0].name]
      .filter(Boolean)
      .join(' > ');
  }
  await client.query(
    `INSERT INTO question_revisions
       (question_id, revision, type, statement, explanation, difficulty, subject, grade, source_institution, source_year, authored_by, knowledge_topic, pedagogical_topic_id)
     VALUES ($1, $2, $3, $4::jsonb, NULLIF($5, '')::jsonb, $6, $7, $8, $9, $10, $11, NULLIF($12, ''), $13)`,
    [
      questionId,
      revision,
      value.type,
      JSON.stringify(
        value.statementBlocks ||
          richStatement(
            value.statement,
            value.mathFormula,
            value.chemicalFormula,
            value.metapostCode,
          ),
      ),
      value.answerBlocks
        ? JSON.stringify(value.answerBlocks)
        : value.answerGuide
          ? JSON.stringify([{ type: 'paragraph', text: value.answerGuide }])
          : '',
      difficultyToDb[value.difficulty],
      value.subject,
      value.grade,
      value.sourceInstitution,
      value.sourceYear,
      userId,
      value.knowledgeTopic || '',
      pedagogicalTopicId,
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
        JSON.stringify(
          alternative.contentBlocks || richParagraph(alternative.content),
        ),
        alternative.isCorrect,
        alternative.position,
      ],
    );
  }
  if (value.skill) {
    const skill = await client.query(
      `SELECT id FROM curriculum_skills
       WHERE code = $1
         AND (subject = $2 OR EXISTS (
           SELECT 1
           FROM pedagogical_discipline_skills pds
           JOIN pedagogical_disciplines pd ON pd.id = pds.discipline_id
           WHERE pds.skill_id = curriculum_skills.id
             AND pd.id = $4::uuid AND pd.name = $2 AND pd.institution_id = $5
         ))
         AND ($3::uuid IS NULL OR EXISTS (
           SELECT 1 FROM skill_knowledge_objects sko
           WHERE sko.skill_id = curriculum_skills.id
             AND sko.knowledge_object_id = $3::uuid
         ))
         AND ($6::uuid IS NULL OR EXISTS (
           SELECT 1 FROM skill_competencies sc
           WHERE sc.skill_id = curriculum_skills.id
             AND sc.competency_id = $6::uuid
         ))
       ORDER BY curriculum_version DESC LIMIT 1`,
      [
        value.skill,
        value.subject,
        value.knowledgeObjectId || null,
        value.pedagogicalDisciplineId || null,
        institutionId,
        value.competencyId || null,
      ],
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
      institutionId,
      userId,
      value,
    });
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'question.created','question',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        question.rows[0].id,
        JSON.stringify({ revision: 1, publicCode }),
      ],
    );
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
      knowledgeTopic: value.knowledgeTopic || null,
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
  role = 'teacher',
  questionId,
  input,
}) {
  const value = createQuestionSchema.parse(input);
  return transaction(async (client) => {
    const question = await client.query(
      `SELECT id, public_code, current_revision
       FROM questions
       WHERE id = $1 AND institution_id = $2
         AND (created_by = $3 OR $4 IN ('admin','coordinator'))
       FOR UPDATE`,
      [questionId, institutionId, userId, role],
    );
    if (!question.rowCount)
      throw Object.assign(new Error('Questão não encontrada.'), {
        statusCode: 404,
      });
    const revision = question.rows[0].current_revision + 1;
    await insertRevision({
      client,
      questionId,
      revision,
      institutionId,
      userId,
      value,
    });
    await client.query(
      `UPDATE questions
       SET current_revision = $2, status = 'draft', updated_at = now()
       WHERE id = $1`,
      [questionId, revision],
    );
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'question.revised','question',$3,$4::jsonb)`,
      [institutionId, userId, questionId, JSON.stringify({ revision })],
    );
    return {
      id: questionId,
      code: question.rows[0].public_code,
      revision,
      status: 'draft',
    };
  });
}

export async function setQuestionStatus({
  institutionId,
  userId,
  role = 'teacher',
  questionId,
  input,
}) {
  const value = questionStatusSchema.parse(input);
  if (['approved', 'archived'].includes(value.status) && role === 'teacher')
    throw Object.assign(
      new Error(
        'Somente coordenação ou administração pode aprovar ou arquivar questões.',
      ),
      { statusCode: 403 },
    );
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE questions
       SET status = $5, updated_at = now()
       WHERE id = $1 AND institution_id = $2
         AND (created_by = $3 OR $4 IN ('admin','coordinator'))
       RETURNING id, public_code, current_revision, status, updated_at`,
      [questionId, institutionId, userId, role, value.status],
    );
    if (!result.rowCount) return null;
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'question.status_changed','question',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        questionId,
        JSON.stringify({ status: value.status }),
      ],
    );
    return {
      id: result.rows[0].id,
      code: result.rows[0].public_code,
      revision: result.rows[0].current_revision,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updated_at,
    };
  });
}

export async function deleteQuestion({
  institutionId,
  userId,
  role = 'teacher',
  questionId,
}) {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE questions
       SET status = 'archived', updated_at = now()
       WHERE id = $1 AND institution_id = $2 AND status <> 'archived'
         AND (created_by = $3 OR $4 IN ('admin','coordinator'))
       RETURNING id, public_code`,
      [questionId, institutionId, userId, role],
    );
    if (!result.rowCount) return false;
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'question.archived','question',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        questionId,
        JSON.stringify({ publicCode: result.rows[0].public_code }),
      ],
    );
    return true;
  });
}
