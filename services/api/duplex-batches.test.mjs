import assert from 'node:assert/strict';
import test from 'node:test';
import { blankPagesToEvenCount, blankPdfBuffer } from './duplex-batches.mjs';

test('adds one blank page only when a student PDF ends on the front of a sheet', () => {
  assert.equal(blankPagesToEvenCount(1), 1);
  assert.equal(blankPagesToEvenCount(3), 1);
  assert.equal(blankPagesToEvenCount(2), 0);
  assert.equal(blankPagesToEvenCount(0), 0);
  assert.equal(blankPagesToEvenCount(undefined), 0);
});

test('builds a valid one-page blank PDF', () => {
  const pdf = blankPdfBuffer().toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /\/Count 1/);
  assert.match(pdf, /startxref\n\d+\n%%EOF\n$/);
});
