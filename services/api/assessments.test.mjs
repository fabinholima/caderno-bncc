import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentSchema, seededShuffle } from './assessments.mjs';

test('valida a montagem de avaliação', () => {
  const input = createAssessmentSchema.parse({ title: 'Avaliação bimestral', subject: 'Matemática', grade: '7º ano', questionIds: ['10000000-0000-4000-8000-000000000001'], versionCount: 3, instructions: [] });
  assert.equal(input.versionCount, 3);
});

test('embaralhamento é determinístico por semente', () => {
  assert.deepEqual(seededShuffle([1, 2, 3, 4], 42), seededShuffle([1, 2, 3, 4], 42));
  assert.notDeepEqual(seededShuffle([1, 2, 3, 4], 42), seededShuffle([1, 2, 3, 4], 43));
});
