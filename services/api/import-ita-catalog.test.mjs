import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeItaRows } from './import-ita-catalog.mjs';

test('agrupa prova e gabarito da primeira fase', () => {
  const items = normalizeItaRows([
    ['2025', '1ª fase', 'Prova', 'https://example.test/prova.pdf', 'ok'],
    ['2025', '1ª fase', 'Gabarito', 'https://example.test/gabarito.pdf', 'ok'],
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].subjectMode, 'multidisciplinary');
  assert.deepEqual(items[0].documents.map((item) => item.kind), [
    'exam',
    'answer_key',
  ]);
});

test('cria uma avaliação por disciplina da segunda fase', () => {
  const items = normalizeItaRows([
    ['2024', '2ª fase', 'Matemática', 'https://example.test/mat.pdf', 'ok'],
    ['2024', '2ª fase', 'Química', 'https://example.test/qui.pdf', 'ok'],
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.primarySubject), [
    'Matemática',
    'Química',
  ]);
  assert.ok(items.every((item) => item.subjectMode === 'single'));
});
