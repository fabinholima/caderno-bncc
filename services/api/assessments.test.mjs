import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentSchema, seededShuffle } from './assessments.mjs';

test('valida a montagem de avaliação', () => {
  const input = createAssessmentSchema.parse({
    title: 'Avaliação bimestral',
    grade: '7º ano',
    sections: [
      {
        subject: 'Matemática',
        columns: 2,
        startOnNewPage: false,
        questionIds: ['10000000-0000-4000-8000-000000000001'],
      },
      {
        subject: 'Química',
        columns: 1,
        startOnNewPage: true,
        questionIds: ['10000000-0000-4000-8000-000000000002'],
      },
    ],
    versionCount: 3,
    paper: 'A5',
    template: 'basicexam-v1',
    instructions: [],
  });
  assert.equal(input.versionCount, 3);
  assert.equal(input.sections[0].columns, 2);
  assert.equal(input.paper, 'A5');
  assert.equal(input.template, 'basicexam-v1');
});

test('aplica o layout padrão e rejeita identificador arbitrário', () => {
  const base = {
    title: 'Avaliação de Ciências',
    grade: '9º ano',
    sections: [
      {
        subject: 'Química',
        questionIds: ['10000000-0000-4000-8000-000000000001'],
      },
    ],
    versionCount: 1,
  };
  assert.equal(createAssessmentSchema.parse(base).template, 'basicexam-v1');
  assert.throws(() =>
    createAssessmentSchema.parse({ ...base, template: '../../layout.tex' }),
  );
});

test('não permite repetir uma questão entre seções', () => {
  const questionId = '10000000-0000-4000-8000-000000000001';
  assert.throws(() =>
    createAssessmentSchema.parse({
      title: 'Simulado multidisciplinar',
      grade: 'Ensino Médio',
      sections: [
        { subject: 'Matemática', questionIds: [questionId] },
        { subject: 'Química', questionIds: [questionId] },
      ],
      versionCount: 2,
    }),
  );
});

test('embaralhamento é determinístico por semente', () => {
  assert.deepEqual(
    seededShuffle([1, 2, 3, 4], 42),
    seededShuffle([1, 2, 3, 4], 42),
  );
  assert.notDeepEqual(
    seededShuffle([1, 2, 3, 4], 42),
    seededShuffle([1, 2, 3, 4], 43),
  );
});
