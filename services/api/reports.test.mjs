import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateApplicationReport,
  aggregateStudentProgress,
} from './reports.mjs';

test('consolida turma, habilidades e competências BNCC', () => {
  const report = aggregateApplicationReport(
    { id: 'app-1', title: 'Química', className: '3º A' },
    [
      {
        student_id: 's1',
        student_name: 'Ana',
        number: 1,
        version_code: 'A',
        scan_status: 'completed',
        submission_id: 'sub1',
        score: 1,
        max_score: 2,
        requires_manual_review: false,
        result: {
          items: [
            {
              questionNumber: 1,
              status: 'correct',
              skills: [{ code: 'EM13CNT101', primary: true }],
              saebDescriptors: [
                { code: 'D20', topic: 'Relação entre Textos', primary: true },
              ],
            },
            {
              questionNumber: 2,
              status: 'incorrect',
              skills: [{ code: 'EM13CNT101', primary: true }],
              saebDescriptors: [
                { code: 'D20', topic: 'Relação entre Textos', primary: true },
              ],
            },
          ],
        },
      },
      {
        student_id: 's2',
        student_name: 'Bruno',
        scan_status: 'review',
        submission_id: null,
      },
      {
        student_id: 's3',
        student_name: 'Carla',
        scan_status: null,
        submission_id: null,
      },
    ],
    [
      {
        skill_code: 'EM13CNT101',
        source_key: 'cnt-ce-1',
        number: 1,
        description: 'Analisar fenômenos naturais.',
        area_name: 'Ciências da Natureza',
      },
    ],
  );
  assert.deepEqual(report.summary, {
    students: 3,
    corrected: 1,
    review: 1,
    awaiting: 1,
    averagePercentage: 50,
    medianPercentage: 50,
    standardDeviation: 0,
  });
  assert.equal(report.skills[0].percentage, 50);
  assert.equal(report.skills[0].classification, 'Em desenvolvimento');
  assert.equal(report.saebDescriptors[0].percentage, 50);
  assert.equal(report.questions.length, 2);
  assert.equal(report.competencies[0].percentage, 50);
  assert.equal(report.students[1].status, 'review');
});

test('calcula evolução longitudinal do aluno por avaliação e habilidade', () => {
  const progress = aggregateStudentProgress(
    { id: 's1', name: 'Ana', registration: '10' },
    [
      {
        application_id: 'a1',
        assessment_title: 'Diagnóstica',
        class_name: '3º A',
        scheduled_at: '2026-02-01T12:00:00Z',
        score: 1,
        max_score: 2,
        result: {
          items: [
            {
              status: 'correct',
              skills: [{ code: 'EM13CNT101' }],
              saebDescriptors: [{ code: 'D1', topic: 'Procedimentos' }],
            },
            {
              status: 'incorrect',
              skills: [{ code: 'EM13CNT101' }],
            },
          ],
        },
      },
      {
        application_id: 'a2',
        assessment_title: 'Simulado',
        class_name: '3º A',
        scheduled_at: '2026-04-01T12:00:00Z',
        score: 2,
        max_score: 2,
        result: {
          items: [
            {
              status: 'correct',
              skills: [{ code: 'EM13CNT101' }],
              saebDescriptors: [{ code: 'D1', topic: 'Procedimentos' }],
            },
            { status: 'correct', skills: [{ code: 'EM13CNT101' }] },
          ],
        },
      },
    ],
    [
      {
        skill_code: 'EM13CNT101',
        source_key: 'cnt-ce-1',
        number: 1,
        description: 'Analisar fenômenos naturais.',
        area_name: 'Ciências da Natureza',
      },
    ],
  );
  assert.deepEqual(progress.summary, {
    assessments: 2,
    averagePercentage: 75,
    bestPercentage: 100,
    currentPercentage: 100,
    trend: 50,
  });
  assert.equal(progress.timeline[1].change, 50);
  assert.equal(progress.skills[0].percentage, 75);
  assert.equal(progress.skills[0].assessments, 2);
  assert.equal(progress.competencies[0].percentage, 75);
  assert.equal(progress.saebDescriptors[0].percentage, 100);
});
