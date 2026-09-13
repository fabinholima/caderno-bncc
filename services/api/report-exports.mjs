import ExcelJS from 'exceljs';

const percentage = (value) =>
  value == null || Number.isNaN(Number(value)) ? null : Number(value) / 100;

const text = (value) => (value == null ? '' : String(value));

const studentStatus = (value) =>
  value === 'corrected'
    ? 'Corrigido'
    : value === 'manual_review'
      ? 'Revisão manual'
      : value === 'review'
        ? 'Revisar cartão'
        : 'Aguardando';

const csvCell = (value) => {
  const normalized = text(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return `"${normalized.replaceAll('"', '""')}"`;
};

const csvRow = (values) => values.map(csvCell).join(';');

export function buildClassReportCsv(report) {
  const rows = [
    ['Categoria', 'Código', 'Nome', 'Acertos', 'Erros', 'Em branco', 'Total', 'Resultado (%)', 'Classificação', 'Diagnóstico'],
  ];
  for (const student of report.students ?? [])
    rows.push([
      'Aluno',
      student.number ?? '',
      student.name,
      student.score ?? '',
      '',
      '',
      student.maxScore ?? '',
      student.percentage ?? '',
      studentStatus(student.status),
      `Versão ${student.versionCode}`,
    ]);
  const dimensions = [
    ['Habilidade BNCC', report.skills ?? []],
    ['Descritor SAEB', report.saebDescriptors ?? []],
    ['Tópico', report.topics ?? []],
    ['Competência BNCC', report.competencies ?? []],
  ];
  for (const [category, items] of dimensions)
    for (const item of items)
      rows.push([
        category,
        item.code ?? item.sourceKey ?? '',
        item.topic ?? item.area ?? item.description ?? item.code ?? '',
        item.correct ?? '',
        item.incorrect ?? '',
        item.unanswered ?? '',
        item.total ?? '',
        item.percentage ?? '',
        item.classification ?? '',
        '',
      ]);
  for (const question of report.questions ?? [])
    rows.push([
      'Questão',
      question.questionNumber,
      `Questão ${question.questionNumber}`,
      question.correct,
      question.incorrect,
      question.unanswered,
      question.total,
      question.percentage,
      question.classification,
      (question.reviewReasons ?? []).join('; '),
    ]);
  return `\uFEFF${rows.map(csvRow).join('\r\n')}\r\n`;
}

const palette = {
  navy: 'FF17365D',
  red: 'FFFCE4D6',
  amber: 'FFFFF2CC',
  white: 'FFFFFFFF',
  text: 'FF1F2937',
};

function styleWorksheet(sheet, widths) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.showGridLines = false;
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(widths.length).letter}1` };
  sheet.getRow(1).height = 26;
  sheet.getRow(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: palette.white } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.navy } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.columns.forEach((column, index) => {
    column.width = widths[index];
    column.font = { name: 'Arial', size: 10, color: { argb: palette.text } };
    column.alignment = { vertical: 'top', wrapText: true };
  });
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).alignment = { vertical: 'top', wrapText: true };
    if (row % 2 === 0)
      sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  }
}

function addSheet(workbook, name, columns, rows, widths) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(columns);
  sheet.addRows(rows);
  styleWorksheet(sheet, widths);
  return sheet;
}

export async function buildClassReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Caderno BNCC';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  const summary = workbook.addWorksheet('Resumo');
  summary.showGridLines = false;
  summary.columns = [
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];
  summary.mergeCells('A1:E1');
  summary.getCell('A1').value = 'Relatório pedagógico da turma';
  summary.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: palette.navy } };
  summary.getCell('A3').value = 'Avaliação';
  summary.getCell('B3').value = report.application.title;
  summary.getCell('A4').value = 'Turma';
  summary.getCell('B4').value = report.application.className;
  summary.getCell('A5').value = 'Etapa/série';
  summary.getCell('B5').value = report.application.grade;
  summary.getCell('A6').value = 'Ano letivo';
  summary.getCell('B6').value = report.application.schoolYear;
  summary.addRow([]);
  summary.addRow(['Indicador', 'Alunos', 'Corrigidos', 'Em revisão', 'Aguardando']);
  summary.addRow([
    'Quantidade',
    report.summary.students,
    report.summary.corrected,
    report.summary.review,
    report.summary.awaiting,
  ]);
  summary.addRow(['Média da turma', percentage(report.summary.averagePercentage)]);
  summary.addRow(['Mediana', percentage(report.summary.medianPercentage)]);
  summary.addRow(['Desvio-padrão (p.p.)', report.summary.standardDeviation]);
  summary.getRow(8).font = { name: 'Arial', size: 10, bold: true, color: { argb: palette.white } };
  summary.getRow(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.navy } };
  summary.getCell('B10').numFmt = '0.0%';
  summary.getCell('B11').numFmt = '0.0%';
  summary.getColumn(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: palette.text } };
  summary.getColumn(2).font = { name: 'Arial', size: 10, color: { argb: palette.text } };
  summary.views = [{ state: 'frozen', ySplit: 1 }];

  const students = addSheet(
    workbook,
    'Alunos',
    ['Número', 'Aluno', 'Versão', 'Situação', 'Nota', 'Nota máxima', 'Resultado'],
    (report.students ?? []).map((item) => [
      item.number ?? '',
      item.name,
      item.versionCode,
      studentStatus(item.status),
      item.score,
      item.maxScore,
      percentage(item.percentage),
    ]),
    [12, 34, 12, 18, 12, 15, 15],
  );
  students.getColumn(7).numFmt = '0.0%';

  const questions = addSheet(
    workbook,
    'Questões',
    ['Questão', 'Acertos', 'Erros', 'Em branco', 'Total', 'Resultado', 'A', 'B', 'C', 'D', 'E', 'Discriminação (p.p.)', 'Classificação', 'Revisar', 'Motivos'],
    (report.questions ?? []).map((item) => [
      item.questionNumber,
      item.correct,
      item.incorrect,
      item.unanswered,
      item.total,
      percentage(item.percentage),
      item.selectedDistribution?.A ?? 0,
      item.selectedDistribution?.B ?? 0,
      item.selectedDistribution?.C ?? 0,
      item.selectedDistribution?.D ?? 0,
      item.selectedDistribution?.E ?? 0,
      item.discriminationIndex,
      item.discriminationClassification,
      item.needsReview ? 'Sim' : 'Não',
      (item.reviewReasons ?? []).join('; '),
    ]),
    [11, 11, 10, 13, 10, 14, 7, 7, 7, 7, 7, 21, 25, 11, 55],
  );
  questions.getColumn(6).numFmt = '0.0%';
  questions.addConditionalFormatting({
    ref: `N2:N${Math.max(2, questions.rowCount)}`,
    rules: [{ type: 'containsText', operator: 'containsText', text: 'Sim', style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.red } }, font: { color: { argb: 'FF9C0006' }, bold: true } } }],
  });

  const dimensions = [
    ['Habilidades', report.skills ?? [], (item) => [item.code, item.primary ? 'Sim' : 'Não', item.correct, item.incorrect, item.unanswered, item.validAnswers, percentage(item.percentage), item.classification]],
    ['Descritores SAEB', report.saebDescriptors ?? [], (item) => [item.code, item.topic, item.primary ? 'Sim' : 'Não', item.correct, item.incorrect, item.unanswered, item.validAnswers, percentage(item.percentage), item.classification]],
    ['Tópicos', report.topics ?? [], (item) => [item.code, item.topic, item.correct, item.incorrect, item.unanswered, item.validAnswers, percentage(item.percentage), item.classification]],
    ['Competências', report.competencies ?? [], (item) => [item.number, item.area, item.description, item.correct, item.incorrect, item.unanswered, item.validAnswers, percentage(item.percentage), item.classification]],
  ];
  const definitions = {
    Habilidades: [['Código', 'Principal', 'Acertos', 'Erros', 'Em branco', 'Respostas válidas', 'Resultado', 'Classificação'], [18, 12, 11, 10, 13, 18, 14, 25]],
    'Descritores SAEB': [['Código', 'Tópico', 'Principal', 'Acertos', 'Erros', 'Em branco', 'Respostas válidas', 'Resultado', 'Classificação'], [18, 40, 12, 11, 10, 13, 18, 14, 25]],
    Tópicos: [['Código', 'Tópico/subtópico', 'Acertos', 'Erros', 'Em branco', 'Respostas válidas', 'Resultado', 'Classificação'], [40, 40, 11, 10, 13, 18, 14, 25]],
    Competências: [['Número', 'Área', 'Descrição', 'Acertos', 'Erros', 'Em branco', 'Respostas válidas', 'Resultado', 'Classificação'], [10, 35, 75, 11, 10, 13, 18, 14, 25]],
  };
  for (const [name, items, mapper] of dimensions) {
    const [columns, widths] = definitions[name];
    const sheet = addSheet(workbook, name, columns, items.map(mapper), widths);
    sheet.getColumn(columns.indexOf('Resultado') + 1).numFmt = '0.0%';
  }

  const priorities = addSheet(
    workbook,
    'Prioridades',
    ['Dimensão', 'Código', 'Conteúdo', 'Acertos', 'Respostas válidas', 'Resultado', 'Classificação', 'Prioridade'],
    (report.priorities ?? []).map((item) => [item.dimension, item.code, item.label, item.correct, item.validAnswers, percentage(item.percentage), item.classification, item.priority]),
    [20, 30, 55, 11, 18, 14, 25, 14],
  );
  priorities.getColumn(6).numFmt = '0.0%';
  priorities.addConditionalFormatting({
    ref: `H2:H${Math.max(2, priorities.rowCount)}`,
    rules: [{ type: 'containsText', operator: 'containsText', text: 'Alta', style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.amber } }, font: { color: { argb: 'FF9C6500' }, bold: true } } }],
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
