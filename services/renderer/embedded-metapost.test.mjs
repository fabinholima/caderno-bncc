import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutEmbeddedMetaPost, validMetaPost } from '../../lib/embedded-metapost.mjs';

test('permits textext labels with font and spacing commands while rejecting file and Lua access', () => {
  assert.ok(validMetaPost(String.raw`label(textext("\ss velocidade"), origin); label(textext("$0,3\,c$"), origin);`));
  for (const command of ['input', 'directlua', 'ssinput'])
    assert.equal(validMetaPost(`label(textext("\\${command}{x}"), origin);`), false);
  assert.doesNotThrow(() => withoutEmbeddedMetaPost(String.raw`\startMPcode label(textext("\ss velocidade"), origin); \stopMPcode`));
});

test('accepts embedded MetaPost with native labels and preserves surrounding text', () => {
  assert.equal(withoutEmbeddedMetaPost('Antes\\startMPcode label(btex $B$ etex, origin);\\stopMPcode Depois'), 'Antes Depois');
});
test('rejects unclosed drawings and external execution inside drawings', () => {
  for (const code of ['\\startMPcode draw origin;', '\\stopMPcode', '\\startMPcode runscript "x";\\stopMPcode', '\\startMPcode label(btex ^^5cinput x etex, origin);\\stopMPcode'])
    assert.throws(() => withoutEmbeddedMetaPost(code));
});
