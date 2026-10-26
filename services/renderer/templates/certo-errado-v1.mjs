import { basicExamV1 } from './basicexam-v1.mjs';

function judgmentAnswerBlock(start, end) {
  const count = end - start + 1;
  const height = 10 + count * 6;
  const rows = Array.from({ length: count }, (_, offset) => {
    const number = String(start + offset).padStart(2, '0');
    const y = height - 10 - offset * 6;
    return `label(textext("{\\switchtobodyfont[7pt]${number}}"), (3.5mm,${y}mm));
draw fullcircle scaled 4.6mm shifted (10mm,${y}mm) withpen pencircle scaled .7pt;
draw fullcircle scaled 4.6mm shifted (16mm,${y}mm) withpen pencircle scaled .7pt;
label(textext("{\\switchtobodyfont[6pt]\\bf C}"), (10mm,${y}mm));
label(textext("{\\switchtobodyfont[6pt]\\bf E}"), (16mm,${y}mm));`;
  }).join('\n');
  return `\\vtop{\\hsize=21mm\\startMPcode
label(textext("{\\switchtobodyfont[6pt]\\bf ITEM}"), (3.5mm,${height - 4}mm));
label(textext("{\\switchtobodyfont[6pt]\\bf RESPOSTA}"), (13mm,${height - 4}mm));
${rows}
setbounds currentpicture to unitsquare xscaled 21mm yscaled ${height}mm;
\\stopMPcode}`;
}

function judgmentAnswerSheet(questionCount) {
  const count = Number(questionCount) || 0;
  if (!count) return '';
  const columns = Math.min(6, Math.ceil(count / 20));
  const rowsPerColumn = Math.ceil(count / columns);
  const blocks = Array.from({ length: columns }, (_, column) => {
    const start = column * rowsPerColumn + 1;
    return judgmentAnswerBlock(
      start,
      Math.min(start + rowsPerColumn - 1, count),
    );
  });
  return `\\hbox{${blocks.join('\\hskip 8mm\n')}}`;
}

export const judgmentExamV1 = Object.freeze({
  id: 'certo-errado-v1',
  render(options) {
    return basicExamV1
      .render({
        ...options,
        answerLabels: ['C', 'E'],
        answerSheetBody: judgmentAnswerSheet(options.questionCount),
        content:
          options.mode === 'student'
            ? 'Julgue cada item e marque C para certo ou E para errado.\\blank[medium]\n' +
              options.content
            : options.content,
      })
      .replace('layout basicexam-v1', 'layout certo-errado-v1');
  },
});
