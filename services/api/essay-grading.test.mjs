import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGrading,
  countLines,
  countWords,
  reviewOcr,
  sanitizeAiGrading,
  stripBnccCodes,
} from './essay-grading.mjs';
import { decodeEssayFile } from './essay-correction.mjs';

const levels = [200, 160, 120, 80, 40, 0].map((score) => ({
  score,
  descriptor: `Nível ${score}`,
}));
const rubric = {
  maxScore: 400,
  criteria: [
    {
      id: 'c1',
      numeral: 'I',
      maxScore: 200,
      levels,
      observations: [{ id: 'ortografia', label: 'Ortografia' }],
    },
    {
      id: 'c5',
      numeral: 'V',
      maxScore: 200,
      levels,
      observations: [
        {
          id: 'agente',
          label: 'Agente',
          options: [
            { id: 'adequado', label: 'Presente e adequado' },
            { id: 'ausente', label: 'Ausente' },
          ],
        },
      ],
    },
  ],
  annulmentReasons: [{ id: 'em-branco', label: 'Folha em branco' }],
};

test('contagem de palavras e de linhas estimadas', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('  Uma frase,   com — travessão. '), 4);
  assert.equal(countLines('a\n\n'), 1);
  assert.equal(countLines('x'.repeat(81)), 2);
});

test('nota calculada no servidor e validada pelos níveis', () => {
  const partial = computeGrading(rubric, {
    scores: [{ criterionId: 'c1', score: 160 }],
  });
  assert.equal(partial.total, null);
  assert.equal(partial.partialTotal, 160);
  const full = computeGrading(
    rubric,
    {
      scores: [
        { criterionId: 'c1', score: 160, observations: { ortografia: true } },
        { criterionId: 'c5', score: 120, observations: { agente: 'ausente' } },
      ],
    },
    { complete: true },
  );
  assert.equal(full.total, 280);
  // Marcações não alteram a nota.
  assert.deepEqual(full.scores[1].observations, { agente: 'ausente' });
  for (const invalid of [
    { scores: [{ criterionId: 'c1', score: 150 }] },
    { scores: [{ criterionId: 'c1', score: 400 }] },
    { scores: [{ criterionId: 'c9', score: 40 }] },
    {
      scores: [
        { criterionId: 'c5', score: 40, observations: { agente: 'talvez' } },
      ],
    },
    {
      scores: [
        { criterionId: 'c1', score: 40, observations: { ortografia: 'sim' } },
      ],
    },
    { annulmentReason: 'inventado' },
  ])
    assert.throws(() => computeGrading(rubric, invalid), { statusCode: 422 });
  assert.throws(
    () => computeGrading(rubric, { scores: [] }, { complete: true }),
    { statusCode: 422 },
  );
  const annulled = computeGrading(
    rubric,
    { annulmentReason: 'em-branco' },
    { complete: true },
  );
  assert.equal(annulled.total, 0);
});

test('sugestão da IA: níveis, evidências literais e sem códigos da BNCC', () => {
  const result = sanitizeAiGrading(
    rubric,
    'O Estado deve investir em transporte coletivo.',
    {
      criteria: [
        {
          criterionId: 'c1',
          suggestedScore: 170,
          justification: 'Atende EF89LP03 parcialmente.',
          evidence: [
            { quote: 'investir em transporte coletivo', comment: 'Correto.' },
            { quote: 'trecho inexistente', comment: '' },
          ],
          problems: [],
          suggestions: [],
          feedback: 'Bom.',
        },
      ],
      generalFeedback: 'Geral EM13LP01.',
    },
  );
  assert.equal(result.scores[0].score, 160);
  assert.equal(result.scores[0].evidence.length, 1);
  assert.equal(result.scores[1].score, null);
  assert.equal(result.total, null);
  assert.ok(!result.scores[0].justification.includes('EF89LP03'));
  assert.equal(result.comments, 'Geral.');
  assert.ok(result.warnings.length >= 3);
  assert.equal(stripBnccCodes('Ver (EM13LP01) aqui'), 'Ver aqui');
});

test('OCR: baixa confiança ou ilegível exige revisão do professor', () => {
  const good = reviewOcr({
    text: 'Linha um\nLinha dois',
    lines: [
      { text: 'Linha um', confidence: 0.97, illegible: false },
      { text: 'Linha dois', confidence: 0.95, illegible: false },
    ],
    confidence: 0.96,
    warnings: [],
  });
  assert.equal(good.needsReview, false);
  assert.equal(reviewOcr({ ...good, confidence: 0.6 }).needsReview, true);
  assert.equal(
    reviewOcr({
      text: 'a',
      lines: [{ text: '[ilegível]', confidence: 0.9, illegible: true }],
      confidence: 0.9,
    }).needsReview,
    true,
  );
  assert.equal(
    reviewOcr({ text: '', lines: [], confidence: 0.99 }).needsReview,
    true,
  );
});

test('arquivos enviados: tipo, assinatura e tamanho', () => {
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.7 teste').toString('base64')}`;
  assert.equal(decodeEssayFile(pdf).mimeType, 'application/pdf');
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64')}`;
  assert.equal(decodeEssayFile(jpeg).mimeType, 'image/jpeg');
  assert.throws(() => decodeEssayFile('data:image/gif;base64,R0lGOD'), {
    statusCode: 422,
  });
  assert.throws(
    () =>
      decodeEssayFile(
        `data:image/png;base64,${Buffer.from('%PDF-1.7').toString('base64')}`,
      ),
    { statusCode: 422 },
  );
  const big = Buffer.alloc(8 * 1024 * 1024 + 10, 0);
  big.write('%PDF-');
  assert.throws(
    () =>
      decodeEssayFile(`data:application/pdf;base64,${big.toString('base64')}`),
    {
      statusCode: 413,
    },
  );
});
