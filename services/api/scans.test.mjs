import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSchema } from './scans.mjs';

test('valida a confirmação humana do cartão', () => {
  const value = reviewSchema.parse({
    applicationStudentId: '10000000-0000-4000-8000-000000000001',
    responses: [
      { questionNumber: 1, selectedLabels: ['C'] },
      { questionNumber: 2, selectedLabels: [] },
    ],
  });
  assert.equal(value.responses[0].selectedLabels[0], 'C');
  assert.throws(() =>
    reviewSchema.parse({
      applicationStudentId: 'inválido',
      responses: [{ questionNumber: 1, selectedLabels: ['F'] }],
    }),
  );
});
