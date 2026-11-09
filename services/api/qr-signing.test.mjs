import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  missingProductionSecrets,
  qrSigningSecret,
  signQrId,
} from './qr-signing.mjs';

test('mantém a assinatura compatível com o formato anterior', () => {
  const expected = crypto
    .createHmac('sha256', 'segredo')
    .update('abc')
    .digest('hex')
    .slice(0, 20);
  assert.equal(signQrId('abc', { QR_SIGNING_SECRET: 'segredo' }), expected);
});

test('o segredo padrão só vale fora de produção', () => {
  assert.equal(qrSigningSecret({}), 'caderno-local-development');
  assert.throws(
    () => qrSigningSecret({ NODE_ENV: 'production' }),
    /QR_SIGNING_SECRET/,
  );
});

test('produção exige os segredos do QR e do CPF', () => {
  const secret = 'x'.repeat(32);
  assert.deepEqual(missingProductionSecrets({}), []);
  assert.deepEqual(missingProductionSecrets({ NODE_ENV: 'production' }), [
    'QR_SIGNING_SECRET',
    'CPF_HASH_SECRET',
  ]);
  assert.deepEqual(
    missingProductionSecrets({
      NODE_ENV: 'production',
      QR_SIGNING_SECRET: secret,
      CPF_HASH_SECRET: 'curto',
    }),
    ['CPF_HASH_SECRET'],
  );
  assert.deepEqual(
    missingProductionSecrets({
      NODE_ENV: 'production',
      QR_SIGNING_SECRET: secret,
      CPF_HASH_SECRET: secret,
    }),
    [],
  );
});
