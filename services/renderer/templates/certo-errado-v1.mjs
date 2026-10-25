import { basicExamV1 } from './basicexam-v1.mjs';

const judgmentBubble = `\\framed[width=4.6mm,height=4.6mm,frame=on,rulethickness=.6pt,corner=round,radius=2.3mm,offset=overlay]{}`;

function judgmentAnswerBlock(start, end) {
  const rows = Array.from({ length: end - start + 1 }, (_, offset) => {
    const number = String(start + offset).padStart(2, '0');
    return `\\NC \\switchtobodyfont[7pt]${number} \\NC \\hbox to 14mm{\\hfil ${judgmentBubble} \\hskip .8mm ${judgmentBubble}\\hfil} \\NC\\NR`;
  }).join('\n');
  const choices = `\\hbox to 14mm{\\hfil\\hbox to 4.6mm{\\hfil{\\switchtobodyfont[6pt]\\bf C}\\hfil}\\hskip .8mm\\hbox to 4.6mm{\\hfil{\\switchtobodyfont[6pt]\\bf E}\\hfil}\\hfil}`;
  return `\\vtop{\\hsize=21mm\\switchtobodyfont[7pt]\\starttabulate[|cw(7mm)|cw(14mm)|]
\\NC {\\switchtobodyfont[6pt]\\bf ITEM} \\NC {\\switchtobodyfont[6pt]\\bf RESPOSTA} \\NC\\NR
\\NC \\NC ${choices} \\NC\\NR
${rows}
\\stoptabulate}`;
}

function judgmentAnswerSheet(questionCount) {
  const count = Number(questionCount) || 0;
  if (!count) return '';
  const columns = Math.min(6, Math.ceil(count / 15));
  const rowsPerColumn = Math.ceil(count / columns);
  const blocks = Array.from({ length: columns }, (_, column) => {
    const start = column * rowsPerColumn + 1;
    return judgmentAnswerBlock(
      start,
      Math.min(start + rowsPerColumn - 1, count),
    );
  });
  return `\\hbox to \\textwidth{${blocks.join('\\hfill\n')}}`;
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
