const templatesWithAnswerCardOnLastPage = new Set([
  'basicexam-v1',
  'certo-errado-v1',
  'simulado-v1',
  'caderno-duas-colunas-v1',
]);

export function hasSeparateFinalAnswerCard(templateVersion) {
  return templatesWithAnswerCardOnLastPage.has(
    templateVersion || 'basicexam-v1',
  );
}

export function selectFinalAnswerCardPage(fileNames, prefix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pagePattern = new RegExp(`^${escapedPrefix}(\\d+)\\.pdf$`);
  const pages = fileNames
    .map((fileName) => ({
      fileName,
      pageNumber: Number(pagePattern.exec(fileName)?.[1]),
    }))
    .filter((page) => Number.isInteger(page.pageNumber) && page.pageNumber > 0)
    .sort((a, b) => b.pageNumber - a.pageNumber);
  return pages[0]?.fileName ?? null;
}

export function parsePdfPageCount(pdfInfoOutput) {
  const match = /^Pages:\s+(\d+)\s*$/m.exec(pdfInfoOutput);
  const pageCount = Number(match?.[1]);
  return Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : null;
}
