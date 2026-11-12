import assert from 'node:assert/strict';
import test from 'node:test';
import {
  examAnalysisJsonSchema,
  createLocalDemoAnalysis,
  extractResponseText,
  requestExamAnalysis,
  selectCandidatesForAi,
  validateExamAnalysis,
} from './exam-import-ai.mjs';

test('conversão exige todas as questões, valida comandos e não inventa gabarito', () => {
  const candidates = [
    { id: 'q1', rawText: 'Uma questão para revisão.', questionType: 'essay' },
  ];
  const question = createLocalDemoAnalysis({ candidates, catalog: {} })
    .questions[0];
  assert.deepEqual(
    validateExamAnalysis(
      [{ ...question, correctAnswers: ['A'] }],
      candidates,
    )[0].correctAnswers,
    [],
  );
  assert.throws(() => validateExamAnalysis([], candidates), /incompleta/);
  assert.throws(
    () => validateExamAnalysis([question, question], candidates),
    /duplicada/,
  );
  assert.throws(
    () =>
      validateExamAnalysis(
        [{ ...question, normalizedText: 'Texto \\input arquivo externo' }],
        candidates,
      ),
    /não permitido/,
  );
});

test('o contrato estruturado rejeita propriedades livres', () => {
  assert.equal(examAnalysisJsonSchema.additionalProperties, false);
  assert.equal(
    examAnalysisJsonSchema.properties.questions.items.additionalProperties,
    false,
  );
});

test('modo local apenas preserva texto e gabarito previamente confirmado', () => {
  const result = createLocalDemoAnalysis({
    candidates: [
      {
        id: 'q1',
        rawText: 'Calcule a entalpia pela Lei de Hess.',
        questionType: 'single_choice',
        answerStatus: 'missing',
        correctAnswers: ['C'],
      },
    ],
    catalog: {
      topics: [
        {
          id: 't1',
          topic: 'Termoquímica',
          subject: 'Química',
          grade_range: '2ª série',
          skill_codes: ['EM13CNT101'],
        },
      ],
      skills: [],
    },
  });
  assert.equal(result.provider, 'local_demo');
  assert.equal(
    result.questions[0].normalizedText,
    'Calcule a entalpia pela Lei de Hess.',
  );
  assert.deepEqual(result.questions[0].correctAnswers, []);
  assert.equal(result.questions[0].skillCode, 'EM13CNT101');
  assert.equal(result.questions[0].topicId, 't1');
});

test('extrai texto tanto do atalho quanto dos itens da Responses API', () => {
  assert.equal(
    extractResponseText({ output_text: '{"questions":[]}' }),
    '{"questions":[]}',
  );
  assert.equal(
    extractResponseText({
      output: [{ content: [{ type: 'output_text', text: 'ok' }] }],
    }),
    'ok',
  );
});

test('envia schema estrito e não armazena a resposta no provedor', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  let requestBody;
  try {
    const result = await requestExamAnalysis({
      candidates: [
        {
          id: 'candidate-1',
          sourceNumber: 1,
          rawText: 'Questão de teste suficientemente extensa.',
        },
      ],
      catalog: { topics: [], skills: [] },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            id: 'resp_1',
            status: 'completed',
            model: 'test-model',
            output_text: '{"questions":[]}',
            usage: { total_tokens: 12 },
          }),
        };
      },
    });
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.text.format.strict, true);
    assert.equal(result.usage.total_tokens, 12);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('piloto envia no máximo cinco questões selecionadas e ainda não analisadas', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1),
    selected: true,
    status: 'review',
    ...(index === 0 ? { aiSuggestion: { confidence: 1 } } : {}),
  }));
  assert.deepEqual(
    selectCandidatesForAi(candidates, 5).map((item) => item.id),
    ['2', '3', '4', '5', '6'],
  );
});

test('análise separa texto-base em qualquer tipo e valida o ConTeXt', () => {
  const candidates = [
    {
      id: 'q1',
      rawText: 'Texto para os itens 1 e 2. Crônica. Item 1.',
      questionType: 'true_false',
    },
    {
      id: 'q2',
      rawText: 'Questão discursiva com texto.',
      questionType: 'essay',
    },
  ];
  const [first, second] = createLocalDemoAnalysis({
    candidates,
    catalog: {},
  }).questions;
  const shared = {
    title: 'Crônica',
    source: '',
    content: 'Estranhei muito.',
    sourceNumbers: [1, 2],
  };
  const [judgment, essay] = validateExamAnalysis(
    [
      {
        ...first,
        questionType: 'true_false',
        normalizedText: 'Item 1 da prova.',
        sharedText: shared,
      },
      {
        ...second,
        questionType: 'essay',
        normalizedText: 'Explique o texto.',
        sharedText: shared,
      },
    ],
    candidates,
  );
  assert.deepEqual(judgment.sharedText, shared);
  assert.deepEqual(essay.sharedText, shared);
  assert.equal(essay.normalizedText, 'Explique o texto.');
  assert.throws(
    () =>
      validateExamAnalysis(
        [
          {
            ...first,
            questionType: 'true_false',
            sharedText: { ...shared, content: '\\input /etc/passwd' },
          },
          second,
        ],
        candidates,
      ),
    /não permitido/,
  );
  assert.ok(
    examAnalysisJsonSchema.properties.questions.items.required.includes(
      'sharedText',
    ),
  );
});
