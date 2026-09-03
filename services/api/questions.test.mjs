import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionSchema } from './questions.mjs';

const baseQuestion = {
  type: 'single_choice',
  statement: 'Qual é o resultado de 6 vezes 7?',
  subject: 'Matemática',
  grade: '7º ano',
  sourceInstitution: 'ENEM',
  sourceYear: 2023,
  skill: 'EF07MA02',
  difficulty: 'Fácil',
  alternatives: [
    { stableKey: 'alt-a', content: '36', isCorrect: false, position: 1 },
    { stableKey: 'alt-b', content: '42', isCorrect: true, position: 2 },
  ],
};

test('aceita uma questão objetiva completa com metadados de origem', () => {
  const parsed = createQuestionSchema.parse(baseQuestion);
  assert.equal(parsed.sourceInstitution, 'ENEM');
  assert.equal(parsed.sourceYear, 2023);
  assert.equal(parsed.alternatives[1].isCorrect, true);
});

test('rejeita duas respostas corretas em resposta única', () => {
  assert.throws(() =>
    createQuestionSchema.parse({
      ...baseQuestion,
      alternatives: baseQuestion.alternatives.map((answer) => ({
        ...answer,
        isCorrect: true,
      })),
    }),
  );
});

test('rejeita ano de prova fora do intervalo aceito', () => {
  assert.throws(() =>
    createQuestionSchema.parse({ ...baseQuestion, sourceYear: 1800 }),
  );
});

test('aceita múltipla escolha com duas respostas corretas', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    type: 'multiple_choice',
    alternatives: baseQuestion.alternatives.map((answer) => ({
      ...answer,
      isCorrect: true,
    })),
  });
  assert.equal(parsed.type, 'multiple_choice');
});

test('aceita questão discursiva com orientação de correção', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    type: 'essay',
    alternatives: [],
    answerGuide:
      'Espera-se que o estudante justifique a conservação da matéria.',
  });
  assert.equal(parsed.alternatives.length, 0);
});

test('bloqueia comandos MetaPost que acessam execução externa', () => {
  assert.throws(() =>
    createQuestionSchema.parse({
      ...baseQuestion,
      metapostCode: 'runscript "comando externo";',
    }),
  );
});
