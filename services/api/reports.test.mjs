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
              selectedLabels: ['C'],
              correctLabels: ['C'],
              knowledgeTopic: 'Termoquímica > Lei de Hess',
              skills: [{ code: 'EM13CNT101', primary: true }],
              saebDescriptors: [
                { code: 'D20', topic: 'Relação entre Textos', primary: true },
              ],
            },
            {
              questionNumber: 2,
              status: 'incorrect',
              selectedLabels: ['B'],
              correctLabels: ['C'],
              knowledgeTopic: 'Termoquímica > Lei de Hess',
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
  assert.equal(report.questions[0].selectedDistribution.C, 1);
  assert.equal(report.questions[1].selectedDistribution.B, 1);
  assert.equal(report.questions[0].discriminationIndex, null);
  assert.equal(
    report.questions[0].discriminationClassification,
    'Amostra insuficiente',
  );
  assert.equal(report.competencies[0].percentage, 50);
  assert.equal(report.topics[0].code, 'Termoquímica > Lei de Hess');
  assert.equal(report.topics[0].percentage, 50);
  assert.equal(report.priorities[0].priority, 'Atenção');
  assert.equal(report.priorities[0].percentage, 50);
  assert.equal(report.students[1].status, 'review');
});

test('calcula discriminação entre grupos superior e inferior', () => {
  const rows = [
    ['s1', 10, 'correct'],
    ['s2', 8, 'correct'],
    ['s3', 4, 'incorrect'],
    ['s4', 2, 'incorrect'],
  ].map(([studentId, score, status]) => ({
    student_id: studentId,
    student_name: studentId,
    submission_id: `sub-${studentId}`,
    score,
    max_score: 10,
    result: {
      items: [
        {
          questionNumber: 1,
          status,
          selectedLabels: status === 'correct' ? ['A'] : ['B'],
          correctLabels: ['A'],
        },
      ],
    },
  }));
  const report = aggregateApplicationReport(
    { id: 'app-discrimination', title: 'Diagnóstica' },
    rows,
    [],
  );
  assert.equal(report.questions[0].discriminationIndex, 100);
  assert.equal(
    report.questions[0].discriminationClassification,
    'Discriminação alta',
  );
  assert.equal(report.questions[0].discriminationSampleSize, 2);
  assert.equal(report.questions[0].needsReview, false);
});

test('sinaliza questão problemática com razões estatísticas', () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    student_id: `s${index}`,
    student_name: `Aluno ${index}`,
    submission_id: `sub${index}`,
    score: 10 - index,
    max_score: 10,
    result: {
      items: [
        {
          questionNumber: 1,
          status: 'incorrect',
          selectedLabels: ['B'],
          correctLabels: ['A'],
        },
      ],
    },
  }));
  const report = aggregateApplicationReport(
    { id: 'app-review', title: 'Revisão de itens' },
    rows,
    [],
  );
  assert.equal(report.questions[0].needsReview, true);
  assert.equal(report.questions[0].dominantDistractor, 'B');
  assert.deepEqual(report.questions[0].reviewReasons, [
    'Taxa de acerto inferior a 20%',
    'Distrator B concentrou ao menos 60% das respostas válidas',
  ]);
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
              questionNumber: 1,
              status: 'correct',
              knowledgeTopic: 'Termoquímica > Lei de Hess',
              skills: [{ code: 'EM13CNT101' }],
              saebDescriptors: [{ code: 'D1', topic: 'Procedimentos' }],
            },
            {
              questionNumber: 2,
              status: 'incorrect',
              knowledgeTopic: 'Termoquímica > Lei de Hess',
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
              questionNumber: 1,
              status: 'correct',
              knowledgeTopic: 'Termoquímica > Lei de Hess',
              skills: [{ code: 'EM13CNT101' }],
              saebDescriptors: [{ code: 'D1', topic: 'Procedimentos' }],
            },
            {
              questionNumber: 2,
              status: 'correct',
              knowledgeTopic: 'Termoquímica > Lei de Hess',
              skills: [{ code: 'EM13CNT101' }],
            },
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
  assert.equal(progress.topics[0].percentage, 75);
  assert.equal(progress.topics[0].assessments, 2);
});
