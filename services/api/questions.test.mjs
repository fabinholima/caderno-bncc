import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionSchema } from './questions.mjs';

test('aceita uma questão objetiva completa', () => {
  const parsed = createQuestionSchema.parse({ statement: 'Qual é o resultado de 6 vezes 7?', subject: 'Matemática', grade: '7º ano', skill: 'EF07MA02', difficulty: 'Fácil', alternatives: [
    { stableKey: 'alt-a', content: '36', isCorrect: false, position: 1 },
    { stableKey: 'alt-b', content: '42', isCorrect: true, position: 2 },
  ] });
  assert.equal(parsed.alternatives[1].isCorrect, true);
});

test('rejeita duas respostas corretas em resposta única', () => {
  assert.throws(() => createQuestionSchema.parse({ statement: 'Escolha uma resposta correta.', subject: 'Matemática', grade: '7º ano', difficulty: 'Média', alternatives: [
    { stableKey: 'alt-a', content: 'A', isCorrect: true, position: 1 },
    { stableKey: 'alt-b', content: 'B', isCorrect: true, position: 2 },
  ] }));
});
