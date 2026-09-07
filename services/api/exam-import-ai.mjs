import { pool, transaction } from './db.mjs';

export const EXAM_AI_PROMPT_VERSION = 'exam-analysis-v1';

export const examAnalysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'candidateId',
          'normalizedText',
          'questionType',
          'subject',
          'grade',
          'difficulty',
          'correctAnswers',
          'skillCode',
          'topicId',
          'confidence',
          'warnings',
        ],
        properties: {
          candidateId: { type: 'string' },
          normalizedText: { type: 'string' },
          questionType: { enum: ['single_choice', 'multiple_choice', 'essay'] },
          subject: { type: ['string', 'null'] },
          grade: { enum: ['1ª série', '2ª série', '3ª série', null] },
          difficulty: { enum: ['Fácil', 'Média', 'Difícil', null] },
          correctAnswers: {
            type: 'array',
            items: { enum: ['A', 'B', 'C', 'D', 'E'] },
            maxItems: 5,
          },
          skillCode: { type: ['string', 'null'] },
          topicId: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const instructions = `Você analisa questões educacionais brasileiras extraídas de PDF. Não invente gabarito, habilidade ou tópico. Use apenas skillCode e topicId presentes no catálogo fornecido; caso incerto, use null. Preserve o conteúdo. Normalize fórmulas para ConTeXt: química inline em \\chemical{}, unidades em \\unit{}, matemática inline em \\m{} e fórmulas destacadas entre \\startformula e \\stopformula. Preserve alternativas A-E e indique alertas de OCR. Retorne somente o JSON do schema.`;

export function extractResponseText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('');
}

export function selectCandidatesForAi(candidates, requestedLimit) {
  const limit = Math.max(1, Math.min(10, Number(requestedLimit) || 5));
  const pending = candidates.filter(
    (item) =>
      !item.aiSuggestion &&
      !['ignored', 'duplicate', 'completed'].includes(item.status),
  );
  return pending.filter((item) => item.selected).slice(0, limit);
}

const normalizeSearchText = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

const localTopicRules = [
  ['Produto de solubilidade', /\bkps\b|produto de solubilidade/],
  ['Equilíbrio iônico e pH', /\bph\b|equilibrio ionico|acido-base/],
  ['Termoquímica', /entalpia|lei de hess|termoquim|calor de reacao/],
  [
    'Cinética Química',
    /cinetica|velocidade da reacao|energia de ativacao|catalis/,
  ],
  ['Eletroquímica', /eletroquim|eletrolise|pilha|corros|faraday|\bnox\b/],
  [
    'Estequiometria',
    /estequiometr|rendimento|pureza|reagente limitante|massa molar/,
  ],
  ['Funções Inorgânicas', /funcao inorgan|acido|base|sal|oxido/],
  ['Radioatividade', /radioativ|fissao|fusao nuclear|meia-vida/],
  [
    'Ligações Químicas',
    /ligacao quim|ligacao ionica|ligacao covalente|geometria molecular/,
  ],
  ['Polímeros', /polimer/],
  ['Bioquímica', /carboidr|proteina|lipidio/],
  [
    'Química Ambiental',
    /combustivel|atmosfera|residuo|saneamento|quimica verde/,
  ],
  ['Química Orgânica', /organica|hidrocarbon|isomer|cadeia carbonica/],
  ['Equilíbrio Químico', /equilibrio|constante de equilibrio/],
];

export function createLocalDemoAnalysis({ candidates, catalog }) {
  const topics = catalog.topics || [];
  const questions = candidates.map((candidate) => {
    const searchable = normalizeSearchText(candidate.rawText);
    const rule = localTopicRules.find(([, pattern]) =>
      pattern.test(searchable),
    );
    const topic = rule
      ? topics.find(
          (item) =>
            normalizeSearchText(item.topic) === normalizeSearchText(rule[0]),
        )
      : null;
    return {
      candidateId: candidate.id,
      normalizedText: candidate.rawText,
      questionType: candidate.questionType,
      subject: topic?.subject || null,
      grade: candidate.grade || topic?.grade_range || null,
      difficulty: candidate.difficulty || null,
      correctAnswers:
        candidate.answerStatus === 'confirmed'
          ? candidate.correctAnswers || []
          : [],
      skillCode: topic?.skill_codes?.[0] || null,
      topicId: topic?.id || null,
      confidence: topic ? 0.45 : 0.2,
      warnings: [
        'Modo de demonstração local: classificação heurística, sem análise por IA.',
        'Texto preservado sem conversão automática de fórmulas.',
      ],
    };
  });
  return {
    questions,
    provider: 'local_demo',
    model: 'regras-locais-v1',
    responseId: `local-${Date.now()}`,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

export async function requestExamAnalysis({
  candidates,
  catalog,
  fetchImpl = fetch,
}) {
  if (process.env.EXAM_AI_PROVIDER === 'local_demo')
    return createLocalDemoAnalysis({ candidates, catalog });
  if (!process.env.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY não configurada no worker de importação.');
  const model = process.env.OPENAI_EXAM_MODEL || 'gpt-5-mini';
  const response = await fetchImpl(
    `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/responses`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: JSON.stringify({
          catalog,
          questions: candidates.map(
            ({ id, sourceNumber, rawText, pageNumber }) => ({
              candidateId: id,
              sourceNumber,
              rawText: rawText.slice(0, 30000),
              pageNumber,
            }),
          ),
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'exam_analysis',
            strict: true,
            schema: examAnalysisJsonSchema,
          },
        },
      }),
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body?.error?.message || `OpenAI respondeu HTTP ${response.status}.`,
    );
  if (body.status !== 'completed')
    throw new Error(`Análise da OpenAI terminou com status ${body.status}.`);
  const parsed = JSON.parse(extractResponseText(body));
  if (!Array.isArray(parsed.questions))
    throw new Error('Resposta estruturada sem questões.');
  return {
    questions: parsed.questions,
    provider: 'openai',
    model: body.model || model,
    responseId: body.id,
    usage: body.usage || {},
  };
}

export async function analyzeExamImport({
  institutionId,
  examImportId,
  onProgress = async () => {},
  shouldCancel = async () => false,
}) {
  const source = await pool.query(
    'SELECT extracted_candidates FROM exam_imports WHERE id=$1 AND institution_id=$2',
    [examImportId, institutionId],
  );
  if (!source.rowCount)
    throw Object.assign(new Error('Importação não encontrada.'), {
      statusCode: 404,
    });
  const allCandidates = source.rows[0].extracted_candidates || [];
  const candidates = selectCandidatesForAi(
    allCandidates,
    process.env.OPENAI_EXAM_BATCH_SIZE,
  );
  if (!candidates.length)
    throw new Error(
      'Selecione ao menos uma questão pendente e ainda sem sugestão de IA.',
    );
  await onProgress('loading_catalog', 10);
  const catalogResult = await pool.query(
    `SELECT topic.id,topic.name AS topic,topic.grade_range,
            discipline.name AS subject,
            COALESCE(jsonb_agg(skill.code ORDER BY skill.code)
              FILTER (WHERE skill.id IS NOT NULL),'[]') AS skill_codes
       FROM pedagogical_topics topic
       JOIN pedagogical_disciplines discipline ON discipline.id=topic.discipline_id
       LEFT JOIN pedagogical_topic_skills relation ON relation.topic_id=topic.id
       LEFT JOIN curriculum_skills skill ON skill.id=relation.skill_id
      WHERE discipline.institution_id=$1
      GROUP BY topic.id,discipline.name
      ORDER BY discipline.name,topic.name`,
    [institutionId],
  );
  const skillsResult = await pool.query(
    `SELECT DISTINCT skill.code,skill.description
       FROM pedagogical_disciplines discipline
       JOIN pedagogical_discipline_skills relation ON relation.discipline_id=discipline.id
       JOIN curriculum_skills skill ON skill.id=relation.skill_id
      WHERE discipline.institution_id=$1 AND discipline.stage='Ensino Médio'
      ORDER BY skill.code`,
    [institutionId],
  );
  if (await shouldCancel())
    throw Object.assign(new Error('Análise cancelada.'), {
      code: 'IMPORT_CANCELLED',
    });
  await onProgress('analyzing_with_ai', 30);
  const analysis = await requestExamAnalysis({
    candidates,
    catalog: { topics: catalogResult.rows, skills: skillsResult.rows },
  });
  const validIds = new Set(candidates.map((item) => item.id));
  const topicIds = new Set(catalogResult.rows.map((item) => item.id));
  const skillCodes = new Set(skillsResult.rows.map((item) => item.code));
  const topicSkillCodes = new Map(
    catalogResult.rows.map((item) => [item.id, new Set(item.skill_codes)]),
  );
  const suggestions = new Map(
    analysis.questions
      .filter((item) => validIds.has(item.candidateId))
      .map((item) => [
        item.candidateId,
        {
          ...item,
          topicId: topicIds.has(item.topicId) ? item.topicId : null,
          skillCode:
            skillCodes.has(item.skillCode) &&
            (!item.topicId ||
              !topicSkillCodes.get(item.topicId)?.size ||
              topicSkillCodes.get(item.topicId)?.has(item.skillCode))
              ? item.skillCode
              : null,
          provider: analysis.provider,
          model: analysis.model,
          promptVersion: EXAM_AI_PROMPT_VERSION,
          analyzedAt: new Date().toISOString(),
        },
      ]),
  );
  await onProgress('saving_suggestions', 85);
  await transaction(async (client) => {
    const locked = await client.query(
      'SELECT extracted_candidates FROM exam_imports WHERE id=$1 AND institution_id=$2 FOR UPDATE',
      [examImportId, institutionId],
    );
    const updated = (locked.rows[0].extracted_candidates || []).map((item) =>
      suggestions.has(item.id)
        ? { ...item, aiSuggestion: suggestions.get(item.id) }
        : item,
    );
    await client.query(
      'UPDATE exam_imports SET extracted_candidates=$3::jsonb,updated_at=now() WHERE id=$1 AND institution_id=$2',
      [examImportId, institutionId, JSON.stringify(updated)],
    );
  });
  const remainingQuestions = allCandidates.filter(
    (item) =>
      !suggestions.has(item.id) &&
      !item.aiSuggestion &&
      !['ignored', 'duplicate', 'completed'].includes(item.status),
  ).length;
  return { ...analysis, remainingQuestions };
}
