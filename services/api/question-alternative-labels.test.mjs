import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAlternativeLabels} from '../../lib/question-alternative-labels.mjs';
test('normalizes parenthesized option labels without changing statement references',()=>{
 const text='Compare (A) e (B) no desenho.\n(A) Primeira alternativa.\n(B) Segunda alternativa.\n(C) Terceira.\n(D) Quarta.\n(E) Quinta.';
 const result=normalizeAlternativeLabels(text);
 assert(result.startsWith('Compare (A) e (B) no desenho.'));
 assert.equal((result.match(/^[A-E]\)/gm)||[]).length,5);
 assert.equal(normalizeAlternativeLabels(result),result);
});
