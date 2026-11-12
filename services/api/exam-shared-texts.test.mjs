import test from 'node:test';
import assert from 'node:assert/strict';

test('importação agrupa os itens C/E pelo texto-base detectado pela IA', async () => {
  const { examSharedTextGroups } =
    await import('../../lib/exam-shared-texts.mjs');
  const shared = (content, sourceNumbers, title = '') => ({
    title,
    source: '',
    content,
    sourceNumbers,
  });
  const item = (id, sourceNumber, extra = {}) => ({
    id,
    sourceNumber,
    questionType: 'true_false',
    status: 'review',
    ...extra,
  });
  const { groups, byCandidate } = examSharedTextGroups([
    item('a', 1),
    // Lotes vizinhos repetem a definição, uma delas cortada.
    item('b', 2, { sharedText: shared('Estranhei muito', [2, 3, 4]) }),
    item('c', 3, {
      sharedText: shared('Estranhei muito na primeira vez.', [3, 4], 'Crônica'),
      sharedTextId: 'db-1',
    }),
    item('d', 4),
    item('e', 5, { questionType: 'single_choice' }),
    item('f', 6, { sharedText: shared('Minha terra tem palmeiras', []) }),
    item('g', 7, { status: 'ignored', sharedText: shared('Ignorado', [7, 8]) }),
    item('h', 8, {
      sharedText: shared(
        'Absurdo',
        Array.from({ length: 80 }, (_, i) => i + 1),
      ),
    }),
  ]);
  assert.equal(groups.length, 2);
  const cronica = byCandidate.get('d');
  assert.equal(cronica.key, 'texto-2-4');
  assert.equal(cronica.content, 'Estranhei muito na primeira vez.');
  assert.equal(cronica.title, 'Crônica');
  assert.equal(cronica.sharedTextId, 'db-1');
  assert.deepEqual(cronica.candidateIds, ['b', 'c', 'd']);
  assert.equal(byCandidate.get('a'), undefined);
  assert.equal(byCandidate.get('e'), undefined);
  assert.deepEqual(byCandidate.get('f').candidateIds, ['f']);
  assert.equal(byCandidate.get('g'), undefined);
  assert.equal(byCandidate.get('h'), undefined);
});

test('candidato aceita texto-base sugerido e vínculo ao banco', async () => {
  const { candidateUpdateSchema, mergeReextractedCandidates } =
    await import('./exam-imports.mjs');
  const value = candidateUpdateSchema.parse({
    sharedText: { content: 'Texto', sourceNumbers: [1, 2] },
    sharedTextId: '6f1d3a52-6c1e-4b8a-9d4e-1b2c3d4e5f60',
  });
  assert.deepEqual(value.sharedText, {
    title: '',
    source: '',
    content: 'Texto',
    sourceNumbers: [1, 2],
  });
  assert.equal(
    candidateUpdateSchema.parse({ sharedTextId: null }).sharedTextId,
    null,
  );
  assert.throws(() => candidateUpdateSchema.parse({ sharedTextId: 'x' }));
  assert.throws(() =>
    candidateUpdateSchema.parse({
      sharedText: { content: '', sourceNumbers: [] },
    }),
  );
  const [merged] = mergeReextractedCandidates(
    [{ id: 'novo', sourceNumber: 3, rawText: 'x' }],
    [{ id: 'antigo', sourceNumber: 3, sharedTextId: 'db-1' }],
  );
  assert.equal(merged.sharedTextId, 'db-1');
});
