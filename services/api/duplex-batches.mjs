// Cada prova ou cartão do lote precisa ocupar um número par de páginas. Assim
// a impressão frente e verso não faz a primeira página do aluno seguinte cair
// no verso da última página do anterior.

// PDF de uma página A4 em branco, com tabela xref calculada.
export function blankPdfBuffer(width = 595.28, height = 841.89) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> >>`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// Quantidade de páginas em branco necessárias para fechar a última folha.
export function blankPagesToEvenCount(pageCount) {
  return Number.isInteger(pageCount) && pageCount > 0 && pageCount % 2 === 1 ? 1 : 0;
}
