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
    'Calcule x² e 20% do total.',
  );
  assert.equal(questionBankSummary('Texto '.repeat(200)).length, 240);
  assert.doesNotMatch(
    questionBankSummary(String.raw`Questão \startMPcode draw origin;`),
    /draw|origin/,
  );
});
test('summary keeps currency values and drops formula delimiters', () => {
  assert.equal(
    questionBankSummary('Um táxi cobra R$ 5,00 fixos mais R$ 2,50 por km.'),
    'Um táxi cobra R$ 5,00 fixos mais R$ 2,50 por km.',
  );
  assert.equal(questionBankSummary('Custa US$10 e vale $x+1$.'), 'Custa US$10 e vale x+1.');
});
test('summary turns common math notation into readable text', () => {
  assert.equal(questionBankSummary(String.raw`Calcule $\frac{1}{2} + \frac{x+1}{3}$.`), 'Calcule 1/2 + (x+1)/3.');
  assert.equal(questionBankSummary(String.raw`A área é $\pi r^{2}$ e a raiz $\sqrt{16}$.`), 'A área é πr² e a raiz √16.');
  assert.equal(questionBankSummary(String.raw`A água \chemical{H_2O} ferve a 100^\circ C.`), 'A água H₂O ferve a 100° C.');
  assert.equal(questionBankSummary(String.raw`Se $x \geq 2$ e $y \neq 0$, então $x \cdot y$.`), 'Se x ≥ 2 e y ≠ 0, então x · y.');
  assert.equal(questionBankSummary(String.raw`$\Delta S = v \times t$ com $10^{-3}$`), 'ΔS = v × t com 10⁻³');
});
