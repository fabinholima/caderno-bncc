import test from 'node:test';
import assert from 'node:assert/strict';
import { questionCodePrefix } from './questions.mjs';

test('usa prefixo da disciplina e não classifica Física como LP', () => {
  assert.equal(questionCodePrefix('Física'), 'FIS');
  assert.equal(questionCodePrefix('Biologia'), 'BIO');
  assert.equal(questionCodePrefix('Língua Portuguesa'), 'LP');
  assert.equal(questionCodePrefix('História'), 'HIS');
  assert.equal(questionCodePrefix('disciplina nova'), 'QST');
});
