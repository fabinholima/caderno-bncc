// Regras puras da correção de redações (sem banco): contagens do texto,
// validação e cálculo da nota pelo modelo de correção, e saneamento da
// sugestão da IA. A nota é sempre calculada aqui, no servidor.
import { z } from 'zod';

const fail = (message, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });

/** Caracteres de uma linha manuscrita na folha (estimativa para o texto digitado). */
export const CHARS_PER_LINE = 80;

export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Linhas que o texto ocuparia na folha: cada parágrafo quebra a cada ~80 caracteres. */
export function countLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)),
      0,
    );
}

const text = (max) => z.string().trim().max(max).default('');

export const gradingInputSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.string().min(1).max(40),
        score: z.number().int().nullable().default(null),
        observations: z
          .record(
            z.string().max(40),
            z.union([z.literal(true), z.string().max(40)]),
          )
          .default({}),
        note: text(2000),
        evidence: z
          .array(z.string().trim().min(1).max(600))
          .max(20)
          .default([]),
        feedback: text(3000),
      }),
    )
    .max(20)
    .default([]),
  annulmentReason: z.string().trim().max(40).default(''),
  comments: text(6000),
  strengths: text(4000),
  improvements: text(4000),
  rewriteSuggestions: text(6000),
  basedOnGradingId: z.uuid().nullable().optional(),
  revision: z.number().int().positive().optional(),
});

/**
 * Valida a correção contra o modelo e calcula a nota total.
 * complete=true exige nota em todas as competências (finalização).
 * Marcações (observations) são apoio pedagógico: não alteram a nota.
 */
export function computeGrading(rubric, input, { complete = false } = {}) {
  const value = gradingInputSchema.parse(input);
  const criteria = rubric?.criteria || [];
  if (!criteria.length) throw fail('O modelo de correção não tem critérios.');
  const byId = new Map(value.scores.map((item) => [item.criterionId, item]));
  for (const id of byId.keys())
    if (!criteria.some((criterion) => criterion.id === id))
      throw fail(`Critério desconhecido no modelo de correção: ${id}.`);
  const annulment = value.annulmentReason
    ? (rubric.annulmentReasons || []).find(
        (reason) => reason.id === value.annulmentReason,
      )
    : null;
  if (value.annulmentReason && !annulment)
    throw fail('Motivo de anulação inválido para este modelo.');

  const scores = criteria.map((criterion) => {
    const item = byId.get(criterion.id) || {
      criterionId: criterion.id,
      score: null,
      observations: {},
      note: '',
      evidence: [],
      feedback: '',
    };
    const allowed = (criterion.levels || []).map((level) => level.score);
    const score = annulment ? 0 : item.score;
    if (score !== null) {
      if (score < 0 || score > criterion.maxScore)
        throw fail(
          `A nota da competência ${criterion.numeral || criterion.id} deve ficar entre 0 e ${criterion.maxScore}.`,
        );
      if (allowed.length && !allowed.includes(score))
        throw fail(
          `Use um dos níveis da competência ${criterion.numeral || criterion.id}: ${allowed.join(', ')}.`,
        );
    } else if (complete)
      throw fail(
        `Atribua a nota da competência ${criterion.numeral || criterion.id} antes de finalizar.`,
      );
    const observations = {};
    for (const [id, choice] of Object.entries(item.observations)) {
      const observation = (criterion.observations || []).find(
        (entry) => entry.id === id,
      );
      if (!observation)
        throw fail(
          `Marcação desconhecida na competência ${criterion.numeral}.`,
        );
      if (observation.options?.length) {
        if (!observation.options.some((option) => option.id === choice))
          throw fail(`Escolha uma opção válida para “${observation.label}”.`);
      } else if (choice !== true)
        throw fail(`Marcação inválida: “${observation.label}”.`);
      observations[id] = choice;
    }
    return { ...item, criterionId: criterion.id, score, observations };
  });
  const scored = scores.filter((item) => item.score !== null);
  const total = scored.length
    ? scored.reduce((sum, item) => sum + item.score, 0)
    : null;
  const maxScore =
    rubric.maxScore ??
    criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
  if (total !== null && total > maxScore)
    throw fail(`A nota total não pode passar de ${maxScore}.`);
  return {
    scores,
    annulmentReason: annulment?.id || '',
    total: complete || scored.length === criteria.length ? total : null,
    partialTotal: total,
    maxScore,
    comments: value.comments,
    strengths: value.strengths,
    improvements: value.improvements,
    rewriteSuggestions: value.rewriteSuggestions,
    basedOnGradingId: value.basedOnGradingId ?? null,
    revision: value.revision,
  };
}

// ---------- Sugestão da IA ----------

const normalize = (value) =>
  String(value || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[“”«»"'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Códigos de habilidade da BNCC (ex.: EM13LP01, EF89LP03) não entram em feedback. */
const bnccCode = /\b(?:EF|EM|EI)\d{2}[A-Z]{2,4}\d{2,3}[A-Z]?\b/g;
export const stripBnccCodes = (value) =>
  String(value || '')
    .replace(bnccCode, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

export const aiGradingSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterionId: z.string(),
        suggestedScore: z.number(),
        justification: z.string().default(''),
        evidence: z
          .array(
            z.object({
              quote: z.string().default(''),
              comment: z.string().default(''),
            }),
          )
          .default([]),
        problems: z.array(z.string()).default([]),
        suggestions: z.array(z.string()).default([]),
        feedback: z.string().default(''),
      }),
    )
    .min(1),
  generalFeedback: z.string().default(''),
  strengths: z.string().default(''),
  improvements: z.string().default(''),
  rewriteSuggestions: z.string().default(''),
  transcriptionLimitations: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

/** Esquema JSON pedido ao modelo (mesma forma do aiGradingSchema). */
export const aiGradingJsonSchema = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterionId: { type: 'string' },
          suggestedScore: { type: 'integer' },
          justification: { type: 'string' },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                quote: { type: 'string' },
                comment: { type: 'string' },
              },
              required: ['quote', 'comment'],
            },
          },
          problems: { type: 'array', items: { type: 'string' } },
          suggestions: { type: 'array', items: { type: 'string' } },
          feedback: { type: 'string' },
        },
        required: [
          'criterionId',
          'suggestedScore',
          'justification',
          'evidence',
          'problems',
          'suggestions',
          'feedback',
        ],
      },
    },
    generalFeedback: { type: 'string' },
    strengths: { type: 'string' },
    improvements: { type: 'string' },
    rewriteSuggestions: { type: 'string' },
    transcriptionLimitations: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'criteria',
    'generalFeedback',
    'strengths',
    'improvements',
    'rewriteSuggestions',
    'transcriptionLimitations',
    'warnings',
  ],
};

const clip = (value, max) => stripBnccCodes(value).slice(0, max);

/**
 * Confere a resposta da IA contra o modelo e o texto do aluno:
 * - nota fora dos níveis vai para o nível válido mais próximo (com aviso);
 * - trechos citados que não existem no texto são descartados (com aviso);
 * - códigos da BNCC são removidos.
 */
export function sanitizeAiGrading(rubric, essayText, raw) {
  const parsed = aiGradingSchema.parse(raw);
  const warnings = parsed.warnings.map((item) => clip(item, 400));
  const haystack = normalize(essayText);
  const scores = rubric.criteria.map((criterion) => {
    const suggestion = parsed.criteria.find(
      (item) => item.criterionId === criterion.id,
    );
    if (!suggestion) {
      warnings.push(
        `A IA não avaliou a competência ${criterion.numeral}; avalie manualmente.`,
      );
      return {
        criterionId: criterion.id,
        score: null,
        observations: {},
        note: '',
        evidence: [],
        feedback: '',
        justification: '',
        problems: [],
        suggestions: [],
      };
    }
    const allowed = criterion.levels.map((level) => level.score);
    let score = Math.round(suggestion.suggestedScore);
    if (!allowed.includes(score)) {
      const nearest = allowed.reduce((best, level) =>
        Math.abs(level - score) < Math.abs(best - score) ? level : best,
      );
      warnings.push(
        `Competência ${criterion.numeral}: a IA sugeriu ${score}, fora dos níveis; ajustado para ${nearest}.`,
      );
      score = nearest;
    }
    const evidence = [];
    for (const item of suggestion.evidence.slice(0, 8)) {
      const quote = String(item.quote || '').trim();
      if (!quote) continue;
      if (normalize(quote).length < 3 || !haystack.includes(normalize(quote))) {
        warnings.push(
          `Competência ${criterion.numeral}: um trecho citado pela IA não existe no texto e foi descartado.`,
        );
        continue;
      }
      evidence.push(
        `“${quote.slice(0, 500)}”${item.comment ? ` — ${clip(item.comment, 300)}` : ''}`,
      );
    }
    return {
      criterionId: criterion.id,
      score,
      observations: {},
      note: '',
      evidence,
      feedback: clip(suggestion.feedback, 3000),
      justification: clip(suggestion.justification, 3000),
      problems: suggestion.problems.slice(0, 12).map((item) => clip(item, 400)),
      suggestions: suggestion.suggestions
        .slice(0, 12)
        .map((item) => clip(item, 400)),
    };
  });
  const scored = scores.filter((item) => item.score !== null);
  return {
    scores,
    total:
      scored.length === scores.length
        ? scored.reduce((sum, item) => sum + item.score, 0)
        : null,
    comments: clip(parsed.generalFeedback, 6000),
    strengths: clip(parsed.strengths, 4000),
    improvements: clip(parsed.improvements, 4000),
    rewriteSuggestions: clip(parsed.rewriteSuggestions, 6000),
    warnings: [
      ...parsed.transcriptionLimitations.map(
        (item) => `Transcrição: ${clip(item, 400)}`,
      ),
      ...warnings,
    ].slice(0, 40),
  };
}

// ---------- Transcrição (OCR) ----------

export const ocrSchema = z.object({
  text: z.string().default(''),
  lines: z
    .array(
      z.object({
        text: z.string().default(''),
        confidence: z.number().min(0).max(1).default(0),
        illegible: z.boolean().default(false),
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
});

export const ocrJsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          confidence: { type: 'number' },
          illegible: { type: 'boolean' },
        },
        required: ['text', 'confidence', 'illegible'],
      },
    },
    confidence: { type: 'number' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['text', 'lines', 'confidence', 'warnings'],
};

/** Transcrição pronta para gravar; needsReview bloqueia a correção automática. */
export function reviewOcr(raw, minConfidence = 0.85) {
  const parsed = ocrSchema.parse(raw);
  const lines = parsed.lines.slice(0, 200).map((line) => ({
    text: line.text.slice(0, 600),
    confidence: Math.round(line.confidence * 1000) / 1000,
    illegible: line.illegible,
  }));
  const transcript = (
    parsed.text || lines.map((line) => line.text).join('\n')
  ).slice(0, 20000);
  const illegible = lines.filter((line) => line.illegible).length;
  const lowLines = lines.filter((line) => line.confidence < minConfidence);
  const warnings = parsed.warnings
    .slice(0, 20)
    .map((item) => item.slice(0, 400));
  if (illegible)
    warnings.push(`${illegible} linha(s) marcadas como ilegíveis.`);
  if (!transcript.trim()) warnings.push('Nenhum texto foi reconhecido.');
  const confidence = Math.round(parsed.confidence * 1000) / 1000;
  return {
    text: transcript,
    lines,
    confidence,
    warnings,
    needsReview:
      !transcript.trim() ||
      confidence < minConfidence ||
      illegible > 0 ||
      lowLines.length > Math.max(2, lines.length * 0.1),
  };
}
