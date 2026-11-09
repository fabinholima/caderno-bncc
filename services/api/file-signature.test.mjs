import test from 'node:test';
import assert from 'node:assert/strict';
import { dataUrlMatchesSignature } from './file-signature.mjs';

const url = (mime, bytes) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const png = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.alloc(40),
]);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(40),
]);
const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');

test('aceita PNG, JPEG e PDF com a assinatura certa', () => {
  assert.equal(dataUrlMatchesSignature(url('image/png', png)), true);
  assert.equal(dataUrlMatchesSignature(url('image/jpeg', jpeg)), true);
  assert.equal(dataUrlMatchesSignature(url('application/pdf', pdf)), true);
  assert.equal(
    dataUrlMatchesSignature('data:image/png;base64,iVBORw0KGgo='),
    true,
  );
});

test('recusa conteúdo com rótulo trocado ou desconhecido', () => {
  assert.equal(dataUrlMatchesSignature(url('image/png', jpeg)), false);
  assert.equal(dataUrlMatchesSignature(url('image/jpeg', pdf)), false);
  assert.equal(dataUrlMatchesSignature(url('application/pdf', png)), false);
  assert.equal(
    dataUrlMatchesSignature(
      url('image/png', Buffer.from('<svg onload=alert(1)>')),
    ),
    false,
  );
  assert.equal(
    dataUrlMatchesSignature(url('image/gif', Buffer.from('GIF89a'))),
    false,
  );
  assert.equal(dataUrlMatchesSignature('data:image/png;base64,'), false);
  assert.equal(dataUrlMatchesSignature(undefined), false);
});
