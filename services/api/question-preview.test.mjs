import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotFromQuestion,
  createQuestionPdfPreview,
} from './question-preview.mjs';
import { renderAssessment } from '../renderer/render-contract.mjs';
const question = {
  type: 'single_choice',
  statement: 'Quanto é dois mais dois?',
  subject: 'Matemática',
  grade: '1ª série',
  sourceInstitution: 'UfaProva',
  sourceYear: 2026,
  difficulty: 'Média',
  alternatives: [
    { stableKey: 'alt-a', content: '3', isCorrect: false, position: 1 },
    { stableKey: 'alt-b', content: '4', isCorrect: true, position: 2 },
  ],
  answerBlocks: [
    {
      type: 'contextRaw',
      code: 'Resolução de exemplo.\\startformula 2+2=4 \\stopformula',
    },
  ],
};
test('prévia da questão não revela a resolução; prévia do gabarito inclui resposta correta e comandos matemáticos', () => {
  const student = renderAssessment(snapshotFromQuestion(question));
  const answer = renderAssessment(snapshotFromQuestion(question, 'answer-key'));
  assert.doesNotMatch(student, /Resolução de exemplo/);
  assert.match(answer, /Resolução de exemplo/);
  assert.match(answer, /\\startformula 2\+2=4 \\stopformula/);
  assert.match(answer, /Comentários e critérios de correção/);
  assert.match(answer, /\\NC 1 \\NC Matemática \\NC B/);
});
test('prévia da resolução mantém resposta discursiva em texto quando não há blocos ricos', () => {
  const snapshot = snapshotFromQuestion(
    {
      ...question,
      type: 'essay',
      alternatives: [],
      answerBlocks: [],
      answerGuide: 'Critérios para correção.',
    },
    'answer-key',
  );
  assert.match(renderAssessment(snapshot), /Critérios para correção/);
});
test('rejeita modo desconhecido antes de invocar o compilador', async () => {
  await assert.rejects(
    createQuestionPdfPreview({ ...question, previewMode: 'invalid' }),
  );
});
const completeQuestion = {
  ...question,
  alternatives: [
    ...question.alternatives,
    ...['c', 'd', 'e'].map((letter, index) => ({
      stableKey: `alt-${letter}`,
      content: String(index + 5),
      isCorrect: false,
      position: index + 3,
    })),
  ],
};
test('informa a ausência de resolução sem tentar compilar PDF vazio', async () => {
  await assert.rejects(
    createQuestionPdfPreview({
      ...completeQuestion,
      answerBlocks: undefined,
      previewMode: 'answer-key',
    }),
    { statusCode: 422 },
  );
});
test('a prévia da resolução não inventa uma alternativa correta', async () => {
  await assert.rejects(
    createQuestionPdfPreview({
      ...completeQuestion,
      alternatives: completeQuestion.alternatives.map((a) => ({
        ...a,
        isCorrect: false,
      })),
      previewMode: 'answer-key',
    }),
    /exatamente uma correta/,
  );
});
