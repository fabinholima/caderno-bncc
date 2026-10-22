import { isCompactTemplate, isJudgmentTemplate } from './compact-assessment.mjs';
export const DEFAULT_RENDER_TEMPLATE = 'basicexam-v1';
export const DEFAULT_RENDER_FONT = 'plex';

export const renderFontCatalog = Object.freeze([
  Object.freeze({ id: 'plex', label: 'IBM Plex' }),
  Object.freeze({ id: 'heros', label: 'TeX Gyre Heros (Helvetica)' }),
  Object.freeze({ id: 'bonum', label: 'TeX Gyre Bonum (Bookman)' }),
  Object.freeze({ id: 'schola', label: 'TeX Gyre Schola (Schoolbook)' }),
  Object.freeze({ id: 'libertinus', label: 'Libertinus' }),
]);

export const renderFontIds = Object.freeze(
  renderFontCatalog.map((font) => font.id),
);

export function isRenderFontId(value) {
  return renderFontIds.includes(value);
}

export const renderTemplateCatalog = Object.freeze([
  ...[
    ['compacto-10-v1', 'Compacto - 10 questões A–E', 'Até 10 questões de resposta única, com QR e cartão A–E na primeira página.'],
    ['certo-errado-10-v1', 'Compacto - 10 questões C/E', 'Até 10 itens de Certo/Errado, com QR e cartão C/E na primeira página.'],
  ].map(([id, label, description]) => Object.freeze({id, label, description, engine: 'ConTeXt / LuaMetaTeX', version: 1})),
  Object.freeze({
    id: DEFAULT_RENDER_TEMPLATE,
    label: 'Caderno clássico',
    description:
      'Layout escolar limpo, com t-basicexam, cabeçalho institucional e gabarito separado.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  }),
  Object.freeze({
    id: 'certo-errado-v1',
    label: 'Prova de Certo/Errado',
    description: 'Prova exclusiva de itens Certo/Errado, com folha de respostas C/E e gabarito apenas com C ou E.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  }),
  Object.freeze({
    id: 'simulado-v1',
    label: 'Simulado (cartão compacto)',
    description:
      'Layout exclusivo para simulados, com identificação, instruções, QR e grade A–E de até 90 questões.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  }),
  Object.freeze({
    id: 'caderno-duas-colunas-v1',
    label: 'Modelo 3 - Caderno em duas colunas',
    description:
      'Prova compacta em duas colunas com cabeçalho editorial e folha de respostas OMR personalizada.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  }),
]);

export const renderTemplateIds = Object.freeze(
  renderTemplateCatalog.map((template) => template.id),
);

export function isRenderTemplateId(value) {
  return renderTemplateIds.includes(value);
}

/** @param {Array<{type?: string}>} questions @param {string} template */
export function assertAssessmentQuestionStyle(questions, template) {
  const judgment = isJudgmentTemplate(template);
  if (isCompactTemplate(template) && (questions.length < 1 || questions.length > 10))
    throw Object.assign(new Error('O modelo compacto aceita de 1 a 10 questões.'), { statusCode: 422 });
  if (template === 'compacto-10-v1' && questions.some(question => question.type !== 'single_choice'))
    throw Object.assign(new Error('O compacto A–E aceita somente questões de resposta única.'), { statusCode: 422 });
  if (questions.some(question => (question.type === 'true_false') !== judgment)) {
    throw Object.assign(new Error(judgment
      ? 'A prova de Certo/Errado aceita somente questões de Certo/Errado.'
      : 'Questões de Certo/Errado exigem a prova exclusiva de Certo/Errado; não podem ser mescladas com outros tipos.'), { statusCode: 422 });
  }
}
