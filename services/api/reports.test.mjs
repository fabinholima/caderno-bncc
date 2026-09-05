import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateApplicationReport } from './reports.mjs';

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
              status: 'correct',
              skills: [{ code: 'EM13CNT101', primary: true }],
            },
            {
              status: 'incorrect',
              skills: [{ code: 'EM13CNT101', primary: true }],
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
  });
  assert.equal(report.skills[0].percentage, 50);
  assert.equal(report.competencies[0].percentage, 50);
  assert.equal(report.students[1].status, 'review');
});
