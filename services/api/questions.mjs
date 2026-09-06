import { z } from 'zod';
import { createHash } from 'node:crypto';
import { pool, transaction } from './db.mjs';
import { prepareChemicalStructureBlocks } from './chemical-structures.mjs';

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
  z
    .object({
      type: z.literal('chemicalStructure'),
      preset: z.enum(['benzene', 'cyclohexane']).optional(),
      smiles: z.string().trim().min(1).max(500).optional(),
      caption: z.string().trim().max(120).default(''),
      approved: z.boolean().default(false),
      originalDataUrl: z
        .string()
        .max(550_000)
        .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
        .optional(),
      svgDataUrl: z
        .string()
        .max(550_000)
        .regex(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/)
        .optional(),
    })
    .refine((value) => Boolean(value.preset) !== Boolean(value.smiles), {
      message: 'Escolha um preset ou informe uma estrutura SMILES.',
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

function duplicateNodeText(node) {
  if (!node || typeof node !== 'object') return String(node || '');
  if (node.type === 'romanList') return (node.items || []).join(' ');
  return (
    node.text ||
    node.code ||
    node.tex ||
    node.formula ||
    node.equation ||
    node.smiles ||
    node.caption ||
    node.alt ||
    ''
  );
}

export function normalizeQuestionContent(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\chemical\{GIVES\}/gi, ' -> ')
    .replace(/\\chemical\{PLUS\}/gi, ' + ')
    .replace(/\\ell(?![A-Za-z])/g, 'l')
    .replace(/\\Delta(?![A-Za-z])/g, 'delta')
    .replace(/(?:\\(?:chemical|unit|m|bold|mathrm)|\\[A-Za-z]+)/g, '')
    .replace(/[→⟶⇒]/g, '->')
    .replace(/[←⟵]/g, '<-')
    .replace(/\bquest(?:ao|ão)\s*\d+\b/gi, '')
    .replace(/[^A-Za-z0-9+<>=-]+/g, '')
    .toLowerCase();
}

export function questionContentFingerprint({ statementBlocks, alternatives }) {
  const statement = (statementBlocks || []).map(duplicateNodeText).join(' ');
  const answers = [...(alternatives || [])]
    .sort((left, right) => (left.position || 0) - (right.position || 0))
    .map((alternative) =>
      Array.isArray(alternative.contentBlocks)
        ? alternative.contentBlocks.map(duplicateNodeText).join(' ')
        : alternative.content || '',
    )
    .join('|');
  return createHash('sha256')
    .update(
      `${normalizeQuestionContent(statement)}|${normalizeQuestionContent(answers)}`,
    )
    .digest('hex');
}
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
    saebDescriptorId: z.uuid().optional().or(z.literal('')),
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

export const questionDuplicateSchema = z.object({
  duplicateOfQuestionId: z.uuid(),
  reason: z.string().trim().min(3).max(500).optional(),
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
             sd.id AS saeb_descriptor_id,
             sd.code AS saeb_descriptor_code,
             sd.description AS saeb_descriptor_description,
             COUNT(a.id)::int AS alternatives
      FROM questions q
      JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
      LEFT JOIN question_skills qs ON qs.question_id = qr.question_id AND qs.revision = qr.revision AND qs.is_primary
      LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
      LEFT JOIN knowledge_objects ko ON ko.id = cs.knowledge_object_id
      LEFT JOIN skill_competencies sc ON sc.skill_id = cs.id
      LEFT JOIN curriculum_competencies cc ON cc.id = sc.competency_id
      LEFT JOIN question_saeb_descriptors qsd
        ON qsd.question_id = qr.question_id AND qsd.revision = qr.revision AND qsd.is_primary
      LEFT JOIN saeb_descriptors sd ON sd.id = qsd.descriptor_id
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
               cc.id, cc.number, sd.id, sd.code, sd.description
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
    saebDescriptorId: row.saeb_descriptor_id,
    saebDescriptorCode: row.saeb_descriptor_code,
    saebDescriptorDescription: row.saeb_descriptor_description,
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
                  q.duplicate_of_question_id, q.duplicate_detected_at,
                  q.duplicate_reason,
                  (SELECT duplicate.public_code FROM questions duplicate
                   WHERE duplicate.id = q.duplicate_of_question_id) AS duplicate_of_code,
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
                  , COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                    'id', sd.id,
                    'code', sd.code,
                    'description', sd.description,
                    'topic', st.name,
                    'matrixId', sm.id,
                    'stage', sm.stage,
                    'subject', sm.subject,
                    'gradeRange', sm.grade_range
                  )) FILTER (WHERE sd.id IS NOT NULL), '[]') AS saeb_descriptors
           FROM questions q
           JOIN question_revisions qr
             ON qr.question_id = q.id AND qr.revision = q.current_revision
           LEFT JOIN alternatives a
             ON a.question_id = qr.question_id AND a.revision = qr.revision
           LEFT JOIN question_skills qs
             ON qs.question_id = qr.question_id AND qs.revision = qr.revision
           LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
           LEFT JOIN question_saeb_descriptors qsd
             ON qsd.question_id = qr.question_id AND qsd.revision = qr.revision
           LEFT JOIN saeb_descriptors sd ON sd.id = qsd.descriptor_id
           LEFT JOIN saeb_topics st ON st.id = sd.topic_id
           LEFT JOIN saeb_matrices sm ON sm.id = sd.matrix_id
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
    duplicateOfQuestionId: row.duplicate_of_question_id,
    duplicateOfCode: row.duplicate_of_code,
    duplicateDetectedAt: row.duplicate_detected_at,
    duplicateReason: row.duplicate_reason,
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
    saebDescriptors: row.saeb_descriptors,
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
  const statementBlocks = await prepareChemicalStructureBlocks(
    value.statementBlocks ||
      richStatement(
        value.statement,
        value.mathFormula,
        value.chemicalFormula,
        value.metapostCode,
      ),
  );
  const answerBlocks = value.answerBlocks
    ? await prepareChemicalStructureBlocks(value.answerBlocks)
    : value.answerGuide
      ? [{ type: 'paragraph', text: value.answerGuide }]
      : null;
  let pedagogicalTopicId = null;
  if (value.pedagogicalTopicId) {
    const topic = await client.query(
      `WITH RECURSIVE ancestry AS (
         SELECT topic.id, topic.parent_id, topic.name, 1 AS depth
         FROM pedagogical_topics topic
         JOIN pedagogical_disciplines pd ON pd.id = topic.discipline_id
         WHERE topic.id = $1 AND topic.institution_id = $2
           AND ($3::uuid IS NULL OR pd.id = $3::uuid)
         UNION ALL
         SELECT ancestry.id, parent.parent_id, parent.name, ancestry.depth + 1
         FROM ancestry
         JOIN pedagogical_topics parent ON parent.id = ancestry.parent_id
       )
       SELECT id, string_agg(name, ' > ' ORDER BY depth DESC) AS path
       FROM ancestry
       GROUP BY id`,
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
    value.knowledgeTopic = topic.rows[0].path;
  }
  await client.query(
    `INSERT INTO question_revisions
       (question_id, revision, type, statement, explanation, difficulty, subject, grade, source_institution, source_year, authored_by, knowledge_topic, pedagogical_topic_id)
     VALUES ($1, $2, $3, $4::jsonb, NULLIF($5, '')::jsonb, $6, $7, $8, $9, $10, $11, NULLIF($12, ''), $13)`,
    [
      questionId,
      revision,
      value.type,
      JSON.stringify(statementBlocks),
      answerBlocks ? JSON.stringify(answerBlocks) : '',
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
    const contentBlocks = await prepareChemicalStructureBlocks(
      alternative.contentBlocks || richParagraph(alternative.content),
    );
    await client.query(
      `INSERT INTO alternatives (question_id, revision, stable_key, content, is_correct, position)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        questionId,
        revision,
        alternative.stableKey,
        JSON.stringify(contentBlocks),
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
  if (value.saebDescriptorId) {
    const descriptor = await client.query(
      `SELECT d.id
       FROM saeb_descriptors d
       JOIN saeb_matrices m ON m.id = d.matrix_id
       WHERE d.id = $1 AND m.subject = $2
         AND m.stage = CASE
           WHEN $3 ILIKE '%médio%' OR $3 ILIKE '%série%' THEN 'Ensino Médio'
           ELSE 'Ensino Fundamental'
         END
         AND (m.stage = 'Ensino Médio' OR m.grade_range = $3)`,
      [value.saebDescriptorId, value.subject, value.grade],
    );
    if (!descriptor.rowCount)
      throw Object.assign(
        new Error(
          'O descritor SAEB não pertence à etapa e disciplina selecionadas.',
        ),
        { statusCode: 422 },
      );
    await client.query(
      `INSERT INTO question_saeb_descriptors
         (question_id, revision, descriptor_id, is_primary)
       VALUES ($1, $2, $3, true)`,
      [questionId, revision, descriptor.rows[0].id],
    );
  }
}

export async function createQuestion({ institutionId, userId, input }) {
  const value = createQuestionSchema.parse(input);
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [
      institutionId,
    ]);
    const candidateFingerprint = questionContentFingerprint({
      statementBlocks:
        value.statementBlocks ||
        richStatement(
          value.statement,
          value.mathFormula,
          value.chemicalFormula,
          value.metapostCode,
        ),
      alternatives: value.alternatives.map((alternative) => ({
        ...alternative,
        contentBlocks:
          alternative.contentBlocks || richParagraph(alternative.content),
      })),
    });
    const currentQuestions = await client.query(
      `SELECT q.id, q.public_code, qr.statement,
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'position', alternative.position,
                    'contentBlocks', alternative.content
                  ) ORDER BY alternative.position
                )
                FROM alternatives alternative
                WHERE alternative.question_id = q.id
                  AND alternative.revision = q.current_revision
              ), '[]'::jsonb) AS alternatives
       FROM questions q
       JOIN question_revisions qr
         ON qr.question_id = q.id AND qr.revision = q.current_revision
       WHERE q.institution_id = $1 AND q.status <> 'archived'`,
      [institutionId],
    );
    const duplicate = currentQuestions.rows.find(
      (question) =>
        questionContentFingerprint({
          statementBlocks: question.statement,
          alternatives: question.alternatives,
        }) === candidateFingerprint,
    );
    if (duplicate)
      throw Object.assign(
        new Error(
          `Questão duplicada. O mesmo conteúdo já está cadastrado como ${duplicate.public_code}.`,
        ),
        {
          statusCode: 409,
          duplicateQuestionId: duplicate.id,
          duplicateQuestionCode: duplicate.public_code,
        },
      );
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

export async function markQuestionDuplicate({
  institutionId,
  userId,
  role = 'teacher',
  questionId,
  input,
}) {
  if (!['admin', 'coordinator'].includes(role))
    throw Object.assign(
      new Error(
        'Somente coordenação ou administração pode marcar questões duplicadas.',
      ),
      { statusCode: 403 },
    );
  const value = questionDuplicateSchema.parse(input);
  if (questionId === value.duplicateOfQuestionId)
    throw Object.assign(
      new Error('Uma questão não pode ser marcada como duplicada dela mesma.'),
      { statusCode: 422 },
    );
  return transaction(async (client) => {
    const canonical = await client.query(
      `SELECT id, public_code FROM questions
       WHERE id = $1 AND institution_id = $2
         AND duplicate_of_question_id IS NULL`,
      [value.duplicateOfQuestionId, institutionId],
    );
    if (!canonical.rowCount)
      throw Object.assign(
        new Error(
          'A questão principal não foi encontrada ou também é duplicada.',
        ),
        { statusCode: 422 },
      );
    const duplicate = await client.query(
      `UPDATE questions
       SET duplicate_of_question_id = $3,
           duplicate_detected_at = now(),
           duplicate_reason = $4,
           status = 'archived',
           updated_at = now()
       WHERE id = $1 AND institution_id = $2
       RETURNING id, public_code, status, duplicate_detected_at,
                 duplicate_reason`,
      [
        questionId,
        institutionId,
        value.duplicateOfQuestionId,
        value.reason ||
          'Conteúdo equivalente detectado após normalização do enunciado e das alternativas.',
      ],
    );
    if (!duplicate.rowCount) return null;
    await client.query(
      `INSERT INTO audit_log
         (institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'question.duplicate_marked','question',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        questionId,
        JSON.stringify({
          duplicateOfQuestionId: value.duplicateOfQuestionId,
          duplicateOfCode: canonical.rows[0].public_code,
        }),
      ],
    );
    return {
      id: duplicate.rows[0].id,
      code: duplicate.rows[0].public_code,
      status: duplicate.rows[0].status,
      duplicateOfQuestionId: value.duplicateOfQuestionId,
      duplicateOfCode: canonical.rows[0].public_code,
      duplicateDetectedAt: duplicate.rows[0].duplicate_detected_at,
      duplicateReason: duplicate.rows[0].duplicate_reason,
    };
  });
}

export async function listQuestionDuplicates({ institutionId }) {
  const result = await pool.query(
    `SELECT duplicate.id, duplicate.public_code, duplicate.status,
            duplicate.duplicate_detected_at, duplicate.duplicate_reason,
            canonical.id AS canonical_id,
            canonical.public_code AS canonical_code,
            revision.subject, revision.grade, revision.source_institution,
            revision.source_year, revision.statement
     FROM questions duplicate
     JOIN questions canonical
       ON canonical.id = duplicate.duplicate_of_question_id
     JOIN question_revisions revision
       ON revision.question_id = duplicate.id
      AND revision.revision = duplicate.current_revision
     WHERE duplicate.institution_id = $1
     ORDER BY duplicate.duplicate_detected_at DESC, duplicate.public_code`,
    [institutionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    code: row.public_code,
    status: row.status,
    duplicateOfQuestionId: row.canonical_id,
    duplicateOfCode: row.canonical_code,
    duplicateDetectedAt: row.duplicate_detected_at,
    duplicateReason: row.duplicate_reason,
    subject: row.subject,
    grade: row.grade,
    sourceInstitution: row.source_institution,
    sourceYear: row.source_year,
    statement:
      row.statement?.find((node) => node.type === 'paragraph')?.text || '',
  }));
}

export async function clearQuestionDuplicate({
  institutionId,
  userId,
  role = 'teacher',
  questionId,
}) {
  if (!['admin', 'coordinator'].includes(role))
    throw Object.assign(
      new Error(
        'Somente coordenação ou administração pode desfazer uma duplicidade.',
      ),
      { statusCode: 403 },
    );
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE questions
       SET duplicate_of_question_id = NULL,
           duplicate_detected_at = NULL,
           duplicate_reason = NULL,
           status = 'draft',
           updated_at = now()
       WHERE id = $1 AND institution_id = $2
         AND duplicate_of_question_id IS NOT NULL
       RETURNING id, public_code, status`,
      [questionId, institutionId],
    );
    if (!result.rowCount) return null;
    await client.query(
      `INSERT INTO audit_log
         (institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'question.duplicate_cleared','question',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        questionId,
        JSON.stringify({ publicCode: result.rows[0].public_code }),
      ],
    );
    return {
      id: result.rows[0].id,
      code: result.rows[0].public_code,
      status: result.rows[0].status,
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
