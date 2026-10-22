/** @param {string} text @returns {string} */
export function normalizeAlternativeLabels(text) {
  return text.replace(/^\s*\(([A-E])\)\s*/gim, '$1) ');
}
