import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCpf, cpfFingerprint } from './cpf.mjs';
import { googleConfigured, validateGoogleProfile } from './google-auth.mjs';

test('CPF normalization and check digits', () => {
  assert.equal(normalizeCpf('123.456.789-09'), '12345678909');
  for (const value of ['00000000000','11111111111','12345678900','123','12345678909abc',null]) assert.equal(normalizeCpf(value),null);
});
test('CPF fingerprint is keyed, stable, and fails closed without secret', () => {
  const key='test-only-secret-of-at-least-32-characters';
  assert.equal(cpfFingerprint('123.456.789-09',key),cpfFingerprint('12345678909',key));
  assert.notEqual(cpfFingerprint('12345678909',key),cpfFingerprint('12345678909',key+'x'));
  assert.throws(() => cpfFingerprint('12345678909',''));
  assert.throws(() => cpfFingerprint('00000000000',key));
});
test('Google configuration and verified profile validation', () => {
  assert.equal(googleConfigured({}),false);
  assert.equal(googleConfigured({ GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'http://localhost:8788/api/auth/google/callback',AUTH_FRONTEND_URL:'http://localhost:3000' }),true);
  assert.equal(googleConfigured({ NODE_ENV:'production',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'http://localhost:8788/api/auth/google/callback',AUTH_FRONTEND_URL:'http://localhost:3000' }),false);
  assert.equal(validateGoogleProfile({sub:'123',email:'TEST@example.com',email_verified:true}).email,'test@example.com');
  assert.throws(() => validateGoogleProfile({sub:'123',email:'test@example.com',email_verified:false}));
});
