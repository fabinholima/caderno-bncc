// Reescrita das questões para a prova adaptada (laudo) pela API de respostas da OpenAI.
// A IA escreve somente o texto: enunciado, três alternativas e a posição da correta.
// Caixa alta, imagens e validação ficam no código (lib/prova-adaptada.mjs).

// Uma chamada pode levar bastante com lotes grandes; acima disso a geração falha com motivo.
export const TEMPO_LIMITE_MS = 120_000;

export const adaptedExamJsonSchema = {
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
          'sourceNumber',
          'statement',
          'alternatives',
          'correctIndex',
          'imagePrompt',
        ],
        properties: {
          sourceNumber: { type: 'integer' },
          statement: { type: 'string' },
          alternatives: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'string' },
          },
          correctIndex: { type: 'integer', minimum: 0, maximum: 2 },
          // Vazio quando a questão não precisa de figura; senão, descreve a ilustração simples.
          imagePrompt: { type: 'string' },
        },
      },
    },
  },
};

export const adaptedExamInstructions = [
  'Você adapta questões de múltipla escolha para estudantes com laudo.',
  'Quando houver um tema (tópico > subtópico), crie uma questão nova sobre esse conteúdo, em linguagem simples, com frases curtas e uma única ideia por frase, e sem copiar o enunciado de referência.',
  'Quando não houver tema, reescreva o enunciado de referência em linguagem simples, com frases curtas e uma única ideia por frase.',
  'Mantenha exatamente o conceito e a resposta correta da questão original.',
  'Cada questão deve ter exatamente três alternativas: a correta e duas incorretas plausíveis.',
  'Escreva as alternativas curtas e no mesmo formato uma da outra.',
  'Não mencione imagens, figuras ou tabelas que não estejam no texto.',
  'Use texto simples, sem fórmulas em LaTeX nem marcação.',
  'Adeque o vocabulário e a extensão das frases ao ano escolar informado no contexto.',
  'Devolva o sourceNumber de cada questão original e o índice (0, 1 ou 2) da alternativa correta.',
  'Se uma figura ajudar a compreender a questão, descreva em imagePrompt uma ilustração simples, sem texto escrito. Caso contrário, deixe imagePrompt vazio.',
].join('\n');

/** Extrai o JSON do corpo de resposta da API de respostas. */
export function extrairSaidaTexto(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  const partes = (body?.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((conteudo) => conteudo.type === 'output_text')
    .map((conteudo) => conteudo.text ?? '');
  return partes.join('');
}

/**
 * @param {{ questions: object[], fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv }} options
 *   questions: [{ sourceNumber, statement: string, alternatives: string[] }]
 * @returns {Promise<{ questions: object[], model: string, responseId: string, usage: object }>}
 */
export async function reescreverQuestoesComIA({
  questions,
  contexto = {},
  fetchImpl = fetch,
  env = process.env,
}) {
  if (env.ADAPTED_EXAM_PROVIDER === 'desativado')
    throw new Error('A geração de prova adaptada com IA está desativada.');
  if (!env.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY não configurada no worker de geração.');
  const model =
    env.OPENAI_ADAPTED_EXAM_MODEL || env.OPENAI_EXAM_MODEL || 'gpt-5-mini';
  const response = await fetchImpl(
    `${env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/responses`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions: adaptedExamInstructions,
        input: JSON.stringify({ contexto, questions }),
        text: {
          format: {
            type: 'json_schema',
            name: 'adapted_exam',
            strict: true,
            schema: adaptedExamJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error?.message || `A API de IA respondeu ${response.status}.`,
    );
  let parsed;
  try {
    parsed = JSON.parse(extrairSaidaTexto(body));
  } catch {
    throw new Error('A resposta da IA não é um JSON válido.');
  }
  return {
    questions: Array.isArray(parsed?.questions) ? parsed.questions : [],
    model: body.model || model,
    responseId: body.id,
    usage: body.usage || {},
  };
}

// Mesmo contrato da OpenAI, pela API generateContent do Gemini com saída em JSON estrito.
export const adaptedExamGeminiSchema = {
  type: 'OBJECT',
  required: ['questions'],
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: [
          'sourceNumber',
          'statement',
          'alternatives',
          'correctIndex',
          'imagePrompt',
        ],
        properties: {
          sourceNumber: { type: 'INTEGER' },
          statement: { type: 'STRING' },
          alternatives: { type: 'ARRAY', items: { type: 'STRING' } },
          correctIndex: { type: 'INTEGER' },
          imagePrompt: { type: 'STRING' },
        },
      },
    },
  },
};

export async function reescreverQuestoesComGemini({
  questions,
  contexto = {},
  fetchImpl = fetch,
  env = process.env,
}) {
  if (env.ADAPTED_EXAM_PROVIDER === 'desativado')
    throw new Error('A geração de prova adaptada com IA está desativada.');
  if (!env.GEMINI_API_KEY)
    throw new Error(
      'GEMINI_API_KEY não configurada para gerar a prova adaptada.',
    );
  const model = env.GEMINI_ADAPTED_EXAM_MODEL || 'gemini-2.5-flash';
  if (!/^[a-zA-Z0-9._-]+$/.test(model))
    throw new Error('Modelo Gemini inválido.');
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': env.GEMINI_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: adaptedExamInstructions }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify({ contexto, questions }) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: adaptedExamGeminiSchema,
        },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error?.message || `A API Gemini respondeu ${response.status}.`,
    );
  const texto = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((parte) => parte.text ?? '')
    .join('');
  let parsed;
  try {
    parsed = JSON.parse(texto);
  } catch {
    throw new Error('A resposta da IA não é um JSON válido.');
  }
  return {
    questions: Array.isArray(parsed?.questions) ? parsed.questions : [],
    model,
    responseId: body.responseId ?? '',
    usage: body.usageMetadata ?? {},
  };
}
