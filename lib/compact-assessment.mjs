// Millimetres relative to the centres of the four registration marks.
// The ConTeXt drawing and the camera reader consume this same geometry.
export const COMPACT_TEMPLATE_IDS = Object.freeze(['compacto-10-v1', 'certo-errado-10-v1']);

export function isCompactTemplate(template) {
  return COMPACT_TEMPLATE_IDS.includes(template);
}

export function isJudgmentTemplate(template) {
  return template === 'certo-errado-v1' || template === 'certo-errado-10-v1';
}

export function compactCardProfile(template, questionCount) {
  if (!isCompactTemplate(template)) return null;
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 10)
    throw new Error('O modelo compacto aceita de 1 a 10 questões.');
  return {
    id: template,
    questionCount,
    labels: isJudgmentTemplate(template) ? ['C', 'E'] : ['A', 'B', 'C', 'D', 'E'],
    widthMm: 112,
    heightMm: 42,
    markerSizeMm: 2.4,
    rowsPerColumn: 5,
    columnStartsMm: [16, 72],
    columnSpacingMm: isJudgmentTemplate(template) ? 14 : 7,
    firstRowMm: 12,
    rowSpacingMm: 6,
    radiusMm: 1.9,
  };
}
