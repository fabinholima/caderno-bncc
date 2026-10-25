const LABELS = ['A', 'B', 'C', 'D', 'E'];
const OPTION_X = [13, 19, 25, 31, 37];
const ROW_STEP_MM = 5.4;
const BLOCK_WIDTH_MM = 41.4;

export function fiveOptionAnswerBlock(start, end, marked = {}) {
  const count = Math.max(0, end - start + 1);
  const height = count * ROW_STEP_MM + 13;
  const commands = [
    `label(textext("{\\switchtobodyfont[6pt]\\bf ITEM}"), (3mm,${height - 3}mm));`,
    `label(textext("{\\switchtobodyfont[6pt]\\bf RESPOSTA}"), (25mm,${height - 3}mm));`,
  ];
  LABELS.forEach((label, index) => {
    commands.push(`label(textext("{\\switchtobodyfont[7pt]\\bf ${label}}"), (${OPTION_X[index]}mm,${height - 8}mm));`);
  });
  for (let offset = 0; offset < count; offset++) {
    const number = start + offset;
    const y = height - 14 - offset * ROW_STEP_MM;
    commands.push(`label(textext("{\\switchtobodyfont[7pt]${String(number).padStart(2, '0')}}"), (3mm,${y}mm));`);
    OPTION_X.forEach((x, index) => {
      commands.push(`draw fullcircle scaled 4.6mm shifted (${x}mm,${y}mm) withpen pencircle scaled .6pt;`);
      commands.push(`label(textext("{\\switchtobodyfont[6pt]\\bf ${LABELS[index]}}"), (${x}mm,${y}mm)) withcolor .65white;`);
      if (marked[number] === LABELS[index])
        commands.push(`fill fullcircle scaled 2.8mm shifted (${x}mm,${y}mm);`);
    });
  }
  commands.push(`setbounds currentpicture to unitsquare xscaled ${BLOCK_WIDTH_MM}mm yscaled ${height}mm;`);
  return `\\startMPcode\n${commands.join('\n')}\n\\stopMPcode`;
}

export function fiveOptionAnswerSheet(questionCount) {
  const count = Number(questionCount) || 0;
  if (!count) return '';
  const columns = Math.min(4, Math.ceil(count / 15));
  const rowsPerColumn = Math.ceil(count / columns);
  const blocks = Array.from({ length: columns }, (_, column) => {
    const start = column * rowsPerColumn + 1;
    return fiveOptionAnswerBlock(start, Math.min(start + rowsPerColumn - 1, count));
  });
  return `\\hbox to \\textwidth{${blocks.join('\\hfill\n')}}`;
}
