import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  buildClassReportCsv,
  buildClassReportWorkbook,
} from './report-exports.mjs';

const report = {
  application: {
    id: 'app-1',
    title: 'Avaliação de Química',
    className: '3º A',
    grade: '3º ano do Ensino Médio',
    schoolYear: 2026,
  },
  summary: {
    students: 1,
    corrected: 1,
    review: 0,
    awaiting: 0,
    averagePercentage: 75,
    medianPercentage: 75,
    standardDeviation: 0,
  },
  students: [
    {
      number: 1,
      name: 'Ana Souza',
      versionCode: 'A',
      status: 'corrected',
      score: 3,
      maxScore: 4,
      percentage: 75,
    },
  ],
  questions: [
    {
      questionNumber: 1,
      correct: 0,
      incorrect: 1,
      unanswered: 0,
      total: 1,
      percentage: 0,
      selectedDistribution: { A: 1 },
      discriminationIndex: null,
      discriminationClassification: 'Amostra insuficiente',
      needsReview: true,
      reviewReasons: ['Taxa de acerto inferior a 20%'],
      classification: 'Requer intervenção',
    },
  ],
  skills: [
    {
      code: 'EM13CNT101',
      primary: true,
      correct: 3,
      incorrect: 1,
      unanswered: 0,
      total: 4,
      validAnswers: 4,
      percentage: 75,
      classification: 'Adequado',
    },
  ],
  saebDescriptors: [],
  topics: [],
  competencies: [],
  priorities: [],
};

test('gera CSV UTF-8 com linhas normalizadas do relatório', () => {
  const csv = buildClassReportCsv(report);
  assert.ok(csv.startsWith('\uFEFF"Categoria";'));
  assert.match(csv, /"Aluno";"1";"Ana Souza"/);
  assert.match(csv, /"Questão";"1";"Questão 1"/);
  assert.match(csv, /"Habilidade BNCC";"EM13CNT101"/);
});

test('gera XLSX com abas, valores numéricos e alertas', async () => {
  const bytes = await buildClassReportWorkbook(report);
  assert.ok(bytes.length > 1_000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    'Resumo',
    'Alunos',
    'Questões',
    'Habilidades',
    'Descritores SAEB',
    'Tópicos',
    'Competências',
    'Prioridades',
  ]);
  assert.equal(workbook.getWorksheet('Alunos').getCell('G2').value, 0.75);
  assert.equal(workbook.getWorksheet('Alunos').getCell('D2').value, 'Corrigido');
  assert.notEqual(workbook.getWorksheet('Resumo').getCell('B9').numFmt, '0.0%');
  assert.equal(workbook.getWorksheet('Resumo').getCell('B10').numFmt, '0.0%');
  assert.equal(workbook.getWorksheet('Questões').getCell('N2').value, 'Sim');
  assert.equal(
    workbook.getWorksheet('Questões').getCell('O2').value,
    'Taxa de acerto inferior a 20%',
  );
});
