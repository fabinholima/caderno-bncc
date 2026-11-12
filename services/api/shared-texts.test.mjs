import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromQuestion } from './question-preview.mjs';
import { createQuestionSchema } from './questions.mjs';
import { sharedTextSchema } from './shared-texts.mjs';

const item = {
  type: 'true_false',
  statement: 'O texto pertence ao gênero crônica.',
  statementBlocks: [
    { type: 'paragraph', text: 'O texto pertence ao gênero crônica.' },
  ],
  subject: 'Língua Portuguesa',
  grade: '3ª série',
  sourceInstitution: 'ENEM',
  sourceYear: 2025,
  difficulty: 'Média',
  alternatives: ['Certo', 'Errado'].map((content, index) => ({
    stableKey: index ? 'alt-b' : 'alt-a',
    content,
    isCorrect: index === 0,
    position: index + 1,
  })),
};

test('prévia do item inclui o texto-base vinculado', () => {
  const sharedText = {
    id: '6f1d3a52-6c1e-4b8a-9d4e-1b2c3d4e5f60',
    title: 'De próprio punho',
    source: '',
    content: [{ type: 'paragraph', text: 'Estranhei muito.' }],
  };
  const snapshot = snapshotFromQuestion(
    createQuestionSchema.parse({ ...item, sharedTextId: sharedText.id }),
    'student',
    sharedText,
  );
  assert.deepEqual(snapshot.sharedTexts, [sharedText]);
  assert.equal(snapshot.questions[0].sharedTextId, sharedText.id);
  const plain = snapshotFromQuestion(createQuestionSchema.parse(item));
  assert.equal(plain.sharedTexts, undefined);
  assert.equal(plain.questions[0].sharedTextId, undefined);
});

test('valida o vínculo e o conteúdo do texto-base', () => {
  assert.throws(() =>
    createQuestionSchema.parse({ ...item, sharedTextId: 'x' }),
  );
  assert.equal(
    createQuestionSchema.parse({ ...item, sharedTextId: '' }).sharedTextId,
    '',
  );
  assert.throws(() =>
    sharedTextSchema.parse({ title: 'Sem conteúdo', content: [] }),
  );
  assert.throws(() =>
    sharedTextSchema.parse({
      content: [{ type: 'contextRaw', code: '\\input /etc/passwd' }],
    }),
  );
  assert.deepEqual(
    sharedTextSchema.parse({
      content: [{ type: 'paragraph', text: ' Texto ' }],
    }),
    {
      title: '',
      source: '',
      content: [{ type: 'paragraph', text: 'Texto' }],
      keepLineBreaks: false,
      lineNumbering: false,
      fullWidth: false,
    },
  );
});
