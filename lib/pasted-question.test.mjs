import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSinglePastedQuestion, parsePastedExam} from './pasted-exam.mjs';

test('single paste preserves irrigation question formulas and separates metadata', () => {
  const statement = String.raw`Um agricultor pretende instalar irrigação em três pontos, \m{p_1}, \m{p_2} e \m{p_3}. O ângulo será de \m{60^\circ}.`;
  const resolution = String.raw`Pela Lei dos Cossenos:
\startformula
d^2 = 10^2 + 16^2 - 2 \cdot 10 \cdot 16 \cdot \cos(60^\circ)
\stopformula
Somando as áreas:
\startformula
A_{total} = \pi (36 + 16 + 100) = 152\pi
\stopformula`;
  const input = `QUESTÃO 30\n${statement}\n\n(A) \\m{40 \\pi}.\n(B) \\m{131 \\pi}.\n(C) \\m{152 \\pi}.\n(D) \\m{171 \\pi}.\n(E) \\m{608 \\pi}.\n\nGABARITO: C\nHABILIDADE: EM13MAT504 - Investigar processos. (Nota: EM13MAT505 ou EM13MAT308).\n\nRESOLUÇÃO:\n${resolution}`;
  const q = parseSinglePastedQuestion(input);
  assert.equal(q.statement, statement);
  assert.equal(q.resolution, resolution);
  assert.deepEqual(q.correctAnswers, ['C']);
  assert.equal(q.skill, 'EM13MAT504');
  assert.equal(q.alternatives.E, String.raw`\m{608 \pi}.`);
  assert.deepEqual(q, parsePastedExam(input)[0]);
  assert.equal(parseSinglePastedQuestion(input.replace('QUESTÃO 30\n', '')).statement, statement);
});
test('single entry rejects batches and malformed code instead of silently importing', () => {
  const q = 'QUESTÃO 1\nEnunciado de exemplo suficientemente longo.';
  assert.throws(() => parseSinglePastedQuestion(q+'\n'+q.replace('1','2')), /apenas uma/);
  assert.throws(() => parseSinglePastedQuestion(q+'\n\\startformula'), /não finalizado/);
});
