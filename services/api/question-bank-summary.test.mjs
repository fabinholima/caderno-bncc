import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBankSummary } from '../../lib/question-bank-summary.mjs';
test('bank summary strips entire MetaPost without exposing drawing code', () => {
  const text = String.raw`Uma plataforma gira. \startMPcode numeric u; u:=1cm; label(textext("$\omega$"),origin); draw fullcircle; \stopMPcode Determine a força.`;
  const summary = questionBankSummary(text);
  assert.equal(summary, 'Uma plataforma gira. [Ilustração] Determine a força.');
  assert.doesNotMatch(summary, /numeric|label|textext|draw|omega/);
});
test('summary stays bounded and retains readable prose and percentages', () => {
  assert.equal(
    questionBankSummary(String.raw`Calcule \m{x^2} e 20% do total.`),
    'Calcule x^2 e 20% do total.',
  );
  assert.equal(questionBankSummary('Texto '.repeat(200)).length, 240);
  assert.doesNotMatch(
    questionBankSummary(String.raw`Questão \startMPcode draw origin;`),
    /draw|origin/,
  );
});
