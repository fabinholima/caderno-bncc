import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { qrSigningSecret, qrSigningWarning, signQrId } from './qr-signing.mjs';

test('mantém a assinatura compatível com o formato anterior', () => {
  const expected = crypto
    .createHmac('sha256', 'segredo')
    .update('abc')
    .digest('hex')
    .slice(0, 20);
  assert.equal(signQrId('abc', { QR_SIGNING_SECRET: 'segredo' }), expected);
});

test('sem segredo, mantém a assinatura anterior e avisa em produção', () => {
  assert.equal(qrSigningSecret({}), 'caderno-local-development');
  assert.equal(
    qrSigningSecret({ NODE_ENV: 'production' }),
    'caderno-local-development',
  );
  assert.match(
    qrSigningWarning({ NODE_ENV: 'production' }),
    /QR_SIGNING_SECRET/,
  );
  assert.equal(
    qrSigningWarning({ NODE_ENV: 'production', QR_SIGNING_SECRET: 'x' }),
    '',
  );
});
