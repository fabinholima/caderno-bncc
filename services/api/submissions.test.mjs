import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSubmission } from './submissions.mjs';

const snapshot = {
  questions: [
    {
      number: 1,
      type: 'single_choice',
      points: 1,
      alternatives: [
        { stableKey: 'alt-a', label: 'A' },
        { stableKey: 'alt-b', label: 'B' },
      ],
      answer: { correctStableKeys: ['alt-b'] },
    },
    {
      number: 2,
      type: 'multiple_choice',
      points: 2,
      alternatives: [
        { stableKey: 'alt-a', label: 'C' },
        { stableKey: 'alt-b', label: 'A' },
        { stableKey: 'alt-c', label: 'B' },
      ],
      answer: { correctStableKeys: ['alt-a', 'alt-c'] },
    },
    {
      number: 3,
      type: 'essay',
      points: 3,
      alternatives: [],
      answer: { correctStableKeys: [] },
    },
  ],
};

test('corrige respostas objetivas pela letra da versão congelada', () => {
  const graded = gradeSubmission(snapshot, {
    candidate: { name: 'Ana Souza', class: '3º A', number: '12' },
    responses: [
      { questionNumber: 1, selectedLabels: ['B'] },
      { questionNumber: 2, selectedLabels: ['B', 'C'] },
      { questionNumber: 3, text: 'Resposta discursiva.' },
    ],
  });
  assert.equal(graded.score, 3);
  assert.equal(graded.maxScore, 6);
  assert.equal(graded.requiresManualReview, true);
  assert.equal(graded.result.items[0].status, 'correct');
  assert.equal(graded.result.items[2].status, 'pending_manual_review');
});

test('não concede ponto parcial em múltipla escolha nesta versão do contrato', () => {
  const graded = gradeSubmission(snapshot, {
    candidate: { name: 'Bruno Lima' },
    responses: [{ questionNumber: 2, selectedLabels: ['B'] }],
  });
  assert.equal(graded.score, 0);
  assert.equal(graded.result.items[1].status, 'incorrect');
});

test('rejeita resposta para questão fora da versão', () => {
  assert.throws(
    () =>
      gradeSubmission(snapshot, {
        candidate: { name: 'Carla Dias' },
        responses: [{ questionNumber: 99, selectedLabels: ['A'] }],
      }),
    /não pertence/,
  );
});
