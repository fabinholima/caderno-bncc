import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutEmbeddedMetaPost } from '../../lib/embedded-metapost.mjs';

test('accepts embedded MetaPost with native labels and preserves surrounding text', () => {
  assert.equal(withoutEmbeddedMetaPost('Antes\\startMPcode label(btex $B$ etex, origin);\\stopMPcode Depois'), 'Antes Depois');
});
test('rejects unclosed drawings and external execution inside drawings', () => {
  for (const code of ['\\startMPcode draw origin;', '\\stopMPcode', '\\startMPcode runscript "x";\\stopMPcode', '\\startMPcode label(btex ^^5cinput x etex, origin);\\stopMPcode'])
    assert.throws(() => withoutEmbeddedMetaPost(code));
});
