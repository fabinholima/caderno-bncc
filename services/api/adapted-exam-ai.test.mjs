import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarPdfsAdaptados } from './adapted-exam-pdf.mjs';
import {
  extrairSaidaTexto,
  reescreverQuestoesComIA,
} from './adapted-exam-ai.mjs';
import {
  montarSnapshotAdaptado,
  questoesParaReescrita,
  validarQuestoesReescritas,
} from '../../lib/prova-adaptada.mjs';

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const alternativas = () =>
  ['alt-a', 'alt-b', 'alt-c', 'alt-d', 'alt-e'].map((stableKey, i) => ({
    stableKey,
    label: 'ABCDE'[i],
    content: [{ type: 'paragraph', text: `Opção ${i + 1}` }],
  }));

const questao = (number, extra = {}) => ({
  id: `q${number}`,
  number,
  type: 'single_choice',
  difficulty: 'easy',
  source: { institution: 'ENEM', year: 2023 },
  statement: [{ type: 'paragraph', text: `Quanto é ${number} + 1?` }],
  alternatives: alternativas(),
  answer: { correctStableKeys: ['alt-c'] },
  points: 1,
  skills: [],
  ...extra,
});

const snapshot = {
  schemaVersion: '1.0',
  assessment: {
    id: 'a1',
    title: 'Prova',
    subject: 'Matemática',
    grade: '7º ano',
    instructions: ['Leia.'],
  },
  institution: { id: 'i1', name: 'Escola' },
  version: {
    id: 'base',
    code: 'A',
    seed: 3,
    generatedAt: '2026-01-01T00:00:00Z',
  },
  candidateFields: ['name'],
  questions: [questao(1), questao(2, { difficulty: 'hard' }), questao(3)],
  totals: { points: 3, questions: 3 },
  render: {
    locale: 'pt-BR',
    paper: 'A4',
    mode: 'student',
    template: 'basicexam-v1',
    font: 'plex',
    fontSize: 11,
  },
};

test('seleciona só questões simples com texto e imagem para reescrita', () => {
  const selecionadas = questoesParaReescrita(snapshot).map((q) => q.number);
  assert.deepEqual(selecionadas, [1, 3]);
  const comFormula = questao(4, { statement: [{ type: 'math', tex: 'x^2' }] });
  assert.equal(
    questoesParaReescrita({ ...snapshot, questions: [comFormula] }).length,
    0,
  );
});

test('valida a saída da IA e descarta o que não respeita as regras', () => {
  const originais = questoesParaReescrita(snapshot);
  const saida = {
    questions: [
      {
        sourceNumber: 1,
        statement: 'Quanto é 1 + 1?',
        alternatives: ['1', '2', '3'],
        correctIndex: 1,
      },
      {
        sourceNumber: 1,
        statement: 'Repetida',
        alternatives: ['1', '2', '3'],
        correctIndex: 0,
      },
      {
        sourceNumber: 3,
        statement: 'Quanto é 3 + 1?',
        alternatives: ['3', '4'],
        correctIndex: 1,
      },
      {
        sourceNumber: 9,
        statement: 'Desconhecida',
        alternatives: ['a', 'b', 'c'],
        correctIndex: 0,
      },
      {
        sourceNumber: 3,
        statement: 'Quanto é 3 + 1?',
        alternatives: ['3', '4', '5'],
        correctIndex: 5,
      },
      {
        sourceNumber: 3,
        statement: 'Quanto é 3 + 1?',
        alternatives: ['4', '4', '5'],
        correctIndex: 0,
      },
    ],
  };
  const { validas, descartadas } = validarQuestoesReescritas(saida, originais);
  assert.deepEqual(
    validas.map((item) => item.sourceNumber),
    [1],
  );
  assert.deepEqual(
    descartadas.map((item) => item.motivo),
    [
      'questão repetida',
      'não tem exatamente três alternativas',
      'questão de origem desconhecida',
      'gabarito inválido',
      'alternativas repetidas',
    ],
  );
});

test('monta snapshot com caixa alta, três alternativas e gabarito na posição informada', () => {
  const originais = questoesParaReescrita(snapshot);
  const { validas } = validarQuestoesReescritas(
    {
      questions: [
        {
          sourceNumber: 3,
          statement: 'Quanto é 3 + 1?',
          alternatives: ['3', '4', '5'],
          correctIndex: 1,
        },
      ],
    },
    originais,
  );
  const adaptada = montarSnapshotAdaptado(snapshot, validas, originais);
  const [q] = adaptada.questions;
  assert.equal(q.statement[0].text, 'QUANTO É 3 + 1?');
  assert.deepEqual(
    q.alternatives.map((alt) => alt.label),
    ['A', 'B', 'C'],
  );
  assert.deepEqual(q.answer.correctStableKeys, ['alt-b']);
  assert.equal(adaptada.render.omitAnswerSheet, true);
});

test('chama a API de respostas com JSON estrito e lê o texto de saída', async () => {
  let enviado;
  const fetchImpl = async (url, options) => {
    enviado = {
      url,
      body: JSON.parse(options.body),
      auth: options.headers.authorization,
      signal: options.signal,
    };
    return {
      ok: true,
      json: async () => ({
        id: 'resp_1',
        model: 'gpt-5-mini',
        usage: { total_tokens: 10 },
        output: [
          {
            content: [
              { type: 'output_text', text: JSON.stringify({ questions: [] }) },
            ],
          },
        ],
      }),
    };
  };
  const resultado = await reescreverQuestoesComIA({
    questions: [
      { sourceNumber: 1, statement: 'x', alternatives: ['a', 'b', 'c'] },
    ],
    fetchImpl,
    env: { OPENAI_API_KEY: 'chave' },
  });
  assert.equal(enviado.url, 'https://api.openai.com/v1/responses');
  assert.equal(enviado.auth, 'Bearer chave');
  assert.equal(enviado.body.text.format.type, 'json_schema');
  assert.equal(enviado.body.store, false);
  assert.ok(
    enviado.signal instanceof AbortSignal,
    'a chamada tem tempo limite',
  );
  assert.deepEqual(resultado.questions, []);
  assert.equal(resultado.responseId, 'resp_1');
});

test('erros da IA viram exceções com mensagem clara', async () => {
  const semChave = reescreverQuestoesComIA({ questions: [], env: {} });
  await assert.rejects(semChave, /OPENAI_API_KEY/);
  const erroHttp = reescreverQuestoesComIA({
    questions: [],
    env: { OPENAI_API_KEY: 'k' },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'limite' } }),
    }),
  });
  await assert.rejects(erroHttp, /limite/);
  const jsonInvalido = reescreverQuestoesComIA({
    questions: [],
    env: { OPENAI_API_KEY: 'k' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ output_text: '{não é json' }),
    }),
  });
  await assert.rejects(jsonInvalido, /JSON válido/);
});

test('extrai o texto de saída nos dois formatos de resposta', () => {
  assert.equal(extrairSaidaTexto({ output_text: 'a' }), 'a');
  assert.equal(
    extrairSaidaTexto({
      output: [{ content: [{ type: 'output_text', text: 'b' }] }],
    }),
    'b',
  );
  assert.equal(extrairSaidaTexto({}), '');
});

test('gera os dois PDFs do snapshot adaptado', async () => {
  const originais = questoesParaReescrita(snapshot);
  const { validas } = validarQuestoesReescritas(
    {
      questions: [
        {
          sourceNumber: 1,
          statement: 'Quanto é 1 + 1?',
          alternatives: ['1', '2', '3'],
          correctIndex: 1,
        },
      ],
    },
    originais,
  );
  const adaptada = montarSnapshotAdaptado(snapshot, validas, originais);
  adaptada.questions[0].statement.push({
    type: 'image',
    dataUrl: PNG_1x1,
    alt: 'figura',
  });
  const { studentPdf, answerKeyPdf } = await montarPdfsAdaptados(adaptada);
  assert.equal(Buffer.from(studentPdf).subarray(0, 5).toString(), '%PDF-');
  assert.equal(Buffer.from(answerKeyPdf).subarray(0, 5).toString(), '%PDF-');
  assert.ok(studentPdf.length > answerKeyPdf.length);
});

test('reescrita pelo Gemini envia contexto e schema, e lê o JSON da resposta', async () => {
  const { reescreverQuestoesComGemini } = await import('./adapted-exam-ai.mjs');
  let enviado;
  const fetchImpl = async (url, options) => {
    enviado = {
      url,
      body: JSON.parse(options.body),
      chave: options.headers['x-goog-api-key'],
    };
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    questions: [
                      {
                        sourceNumber: 3,
                        statement: 'Nova',
                        alternatives: ['a', 'b', 'c'],
                        correctIndex: 2,
                        imagePrompt: '',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: { totalTokenCount: 9 },
      }),
    };
  };
  const resultado = await reescreverQuestoesComGemini({
    contexto: { serie: '6º ano', disciplina: 'Matemática' },
    questions: [
      {
        sourceNumber: 3,
        tema: 'Matemática > Frações',
        statement: 'x',
        alternatives: ['a', 'b', 'c'],
      },
    ],
    fetchImpl,
    env: { GEMINI_API_KEY: 'g' },
  });
  assert.match(enviado.url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(enviado.chave, 'g');
  assert.equal(
    enviado.body.generationConfig.responseMimeType,
    'application/json',
  );
  assert.equal(enviado.body.generationConfig.responseSchema.type, 'OBJECT');
  assert.match(enviado.body.contents[0].parts[0].text, /6º ano/);
  assert.match(enviado.body.contents[0].parts[0].text, /Matemática > Frações/);
  assert.equal(resultado.questions[0].correctIndex, 2);
  await assert.rejects(
    reescreverQuestoesComGemini({ questions: [], env: {} }),
    /GEMINI_API_KEY/,
  );
});
