// Chamadas ao Gemini para a redação: transcrição (OCR) das páginas e
// sugestão de correção por competência. Só roda no worker (essay-worker.mjs),
// nunca dentro de uma requisição HTTP. A resposta é estruturada (JSON Schema)
// e conferida localmente em essay-grading.mjs.
import { geminiResponseSchema } from './exam-import-gemini.mjs';
import {
  aiGradingJsonSchema,
  ocrJsonSchema,
  reviewOcr,
  sanitizeAiGrading,
} from './essay-grading.mjs';

export const ESSAY_PROMPT_VERSION = 'essay-v1';

/** IA ligada para redação? (a API só enfileira; quem chama o provedor é o worker) */
export function essayAiProvider(env = process.env) {
  const provider = String(env.ESSAY_AI_PROVIDER || '').toLowerCase();
  return provider === 'gemini' ? 'gemini' : '';
}

export function essayAiModel(env = process.env) {
  const model =
    env.ESSAY_AI_MODEL || env.GEMINI_EXAM_MODEL || 'gemini-3.5-flash-lite';
  if (!/^[a-zA-Z0-9._-]+$/.test(model))
    throw new Error('Modelo Gemini inválido.');
  return model;
}

async function geminiJson({
  instructions,
  parts,
  schema,
  env = process.env,
  fetchImpl = fetch,
  maxOutputTokens = 16384,
  timeoutMs = 180_000,
}) {
  if (!env.GEMINI_API_KEY)
    throw Object.assign(
      new Error('GEMINI_API_KEY não configurada no worker de redações.'),
      { permanent: true },
    );
  const model = essayAiModel(env);
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': env.GEMINI_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseJsonSchema: geminiResponseSchema(schema),
          maxOutputTokens,
        },
      }),
    },
  );
  if (response.status === 429 || response.status === 503) {
    const seconds = Number(response.headers?.get('retry-after'));
    throw Object.assign(
      new Error(
        'Cota ou capacidade do Gemini atingida; nova tentativa agendada.',
      ),
      {
        code: 'AI_QUOTA_EXHAUSTED',
        retryAfterSeconds:
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(86400, Math.max(60, seconds))
            : 900,
      },
    );
  }
  if (!response.ok) {
    const failure = await Promise.resolve()
      .then(() => response.json())
      .catch(() => ({}));
    const status = /^[A-Z_]{1,80}$/.test(failure?.error?.status || '')
      ? failure.error.status
      : 'UNKNOWN';
    // Sem corpo bruto nem credenciais nos logs.
    console.error('Gemini (redação) rejeitou a requisição', {
      httpStatus: response.status,
      status,
      model,
    });
    throw Object.assign(
      new Error(
        `O provedor de IA recusou a requisição (HTTP ${response.status}, ${status}).`,
      ),
      { permanent: response.status >= 400 && response.status < 500 },
    );
  }
  const body = await response.json();
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason !== 'STOP')
    throw new Error('A IA não concluiu a resposta; nova tentativa agendada.');
  const parsed = JSON.parse(
    (candidate.content?.parts || [])
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join(''),
  );
  return {
    parsed,
    provider: 'gemini',
    model: body.modelVersion || model,
    usage: {
      input_tokens: body.usageMetadata?.promptTokenCount || 0,
      output_tokens:
        (body.usageMetadata?.candidatesTokenCount || 0) +
        (body.usageMetadata?.thoughtsTokenCount || 0),
      total_tokens: body.usageMetadata?.totalTokenCount || 0,
    },
  };
}

const ocrInstructions = `Você transcreve redações manuscritas de estudantes brasileiros.
Regras obrigatórias:
- Transcreva exatamente o que está escrito, na ordem das linhas, mantendo erros de ortografia, acentuação, pontuação e concordância do aluno. Não corrija nada.
- Ignore cabeçalho, nome, número de linhas impresso e instruções da folha; transcreva só o texto do aluno.
- Use uma entrada em "lines" por linha manuscrita, com a confiança (0 a 1) da leitura dessa linha.
- Quando uma palavra for ilegível, escreva [ilegível] no lugar e marque a linha com illegible=true. Nunca invente palavras.
- "confidence" é a confiança geral da transcrição (0 a 1).
- Em "warnings", registre problemas da imagem: página cortada, borrada, inclinada, sombra, rasuras, texto fora das linhas.`;

/** files: [{mimeType, contents}] na ordem das páginas. */
export async function transcribeEssay({
  files,
  minConfidence,
  env = process.env,
  fetchImpl,
}) {
  const result = await geminiJson({
    env,
    fetchImpl,
    instructions: ocrInstructions,
    schema: ocrJsonSchema,
    parts: [
      ...files.map((file) => ({
        inlineData: {
          mimeType: file.mimeType,
          data: file.contents.toString('base64'),
        },
      })),
      {
        text: `Transcreva a redação das ${files.length} página(s) acima, em ordem.`,
      },
    ],
  });
  return { ...result, transcription: reviewOcr(result.parsed, minConfidence) };
}

function rubricForPrompt(rubric) {
  return rubric.criteria.map((criterion) => ({
    criterionId: criterion.id,
    competencia: criterion.numeral,
    titulo: criterion.title,
    pontuacaoMaxima: criterion.maxScore,
    niveis: criterion.levels.map((level) => ({
      pontos: level.score,
      descritor: level.descriptor,
    })),
    aspectosObservaveis: (criterion.observations || []).map(
      (observation) => observation.label,
    ),
  }));
}

const gradingInstructions = `Você apoia professores na correção de redações escolares. Sua resposta é uma SUGESTÃO que o professor revisará; você não atribui a nota oficial.
Regras obrigatórias:
- Avalie cada competência do modelo de correção recebido e sugira uma pontuação que seja exatamente um dos níveis informados.
- Fundamente cada sugestão com trechos copiados LITERALMENTE do texto do aluno (campo evidence.quote). Nunca invente, resuma ou corrija trechos citados. Se não houver trecho, deixe a lista vazia.
- Separe evidência (o trecho) de interpretação (o comentário e a justificativa).
- Não mencione códigos de habilidades da BNCC.
- Não faça afirmações sobre o aluno como pessoa; comente apenas o texto.
- Se o texto veio de transcrição automática, considere que erros podem ser da leitura e registre essa limitação em transcriptionLimitations, sem penalizar a competência I por trechos [ilegível].
- Escreva em português do Brasil, com linguagem respeitosa, clara e adequada a estudantes.
- Feedback: indique o que está bom, o que melhorar e como reescrever, de forma concreta.`;

export async function suggestEssayGrading({
  rubric,
  prompt,
  essayText,
  fromTranscription,
  env = process.env,
  fetchImpl,
}) {
  const numbered = essayText
    .split('\n')
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n');
  const result = await geminiJson({
    env,
    fetchImpl,
    instructions: gradingInstructions,
    schema: aiGradingJsonSchema,
    parts: [
      {
        text: JSON.stringify({
          modeloDeCorrecao: {
            nome: rubric.name,
            competencias: rubricForPrompt(rubric),
          },
          proposta: {
            tema: prompt.theme,
            titulo: prompt.title,
            tipoTextual: prompt.essayType,
            comando: prompt.productionCommand,
            linhasMinimas: prompt.minLines,
            linhasMaximas: prompt.maxLines,
          },
          origemDoTexto: fromTranscription
            ? 'transcrição automática de manuscrito revisada ou com alta confiança'
            : 'texto digitado pelo aluno',
          redacaoComLinhasNumeradas: numbered.slice(0, 24000),
        }),
      },
    ],
  });
  return {
    ...result,
    grading: sanitizeAiGrading(rubric, essayText, result.parsed),
  };
}
