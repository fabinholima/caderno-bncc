import test from 'node:test';
import assert from 'node:assert/strict';
import { authOriginAllowed } from './auth-origin.mjs';
const allowedOrigins = new Set(['https://ufaprova-frontend.onrender.com']);
const check = (path, origin, mobileClient) => authOriginAllowed({ path, origin, mobileClient, allowedOrigins });
test('native password login accepts the mobile header without Origin', () => {
  assert.equal(check('/api/auth/login', undefined, 'mobile'), true);
  assert.equal(check('/api/auth/login', undefined, undefined), false);
});
test('the mobile header does not permit a disallowed browser origin', () => {
  assert.equal(check('/api/auth/login', 'https://untrusted.example', 'mobile'), false);
  assert.equal(check('/api/auth/login', 'https://ufaprova-frontend.onrender.com', undefined), true);
});
test('registration, logout and profile changes still require approved browser origins', () => {
  for (const path of ['/api/auth/register', '/api/auth/logout', '/api/auth/complete-cpf', '/api/auth/reset-password']) assert.equal(check(path, undefined, 'mobile'), false);
});
