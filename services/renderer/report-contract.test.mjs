import test from 'node:test';
import assert from 'node:assert/strict';
import { renderClassReport, renderStudentReport } from './report-contract.mjs';

test('gera relatório ConTeXt com tabelas e gráficos MetaPost', () => {
  const tex = renderClassReport({
    schemaVersion: '1.0',
    generatedAt: '2026-09-05T12:00:00.000Z',
    application: {
      title: 'Simulado & revisão',
      className: '3º A',
      grade: 'Ensino Médio',
      schoolYear: 2026,
    },
    summary: {
      students: 30,
      corrected: 28,
      averagePercentage: 67.5,
      medianPercentage: 70,
      standardDeviation: 12.8,
    },
    skills: [
      {
        code: 'EM13CNT101',
        correct: 20,
        validAnswers: 28,
        percentage: 71.4,
        classification: 'Adequado',
      },
    ],
    saebDescriptors: [
      {
        code: 'D20',
        topic: 'Relação entre Textos',
        correct: 18,
        validAnswers: 28,
        percentage: 64.3,
        classification: 'Adequado',
      },
    ],
  });
  assert.match(tex, /\\startMPcode/);
  assert.match(tex, /EM13CNT101/);
  assert.match(tex, /D20/);
  assert.match(tex, /Simulado \\& revisão/);
});

test('gera relatório individual com comparação e respostas', () => {
  const tex = renderStudentReport({
    schemaVersion: '1.0',
    generatedAt: '2026-09-05T12:00:00.000Z',
    scope: { type: 'student' },
    application: { title: 'Simulado', className: '3º A' },
    student: { name: 'Ana Souza', versionCode: 'B' },
    summary: {
      percentage: 75,
      classAveragePercentage: 65,
      differenceFromClass: 10,
      correct: 3,
      incorrect: 1,
      unanswered: 0,
    },
    skills: [],
    saebDescriptors: [],
    questions: [
      {
        questionNumber: 1,
        status: 'correct',
        selectedLabels: ['C'],
        correctLabels: ['C'],
        skills: [{ code: 'EM13CNT101' }],
        saebDescriptors: [],
      },
    ],
  });
  assert.match(tex, /Ana Souza/);
  assert.match(tex, /acima da média da turma em 10 pontos/);
  assert.match(tex, /EM13CNT101/);
});
