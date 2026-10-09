import test from 'node:test';
import assert from 'node:assert/strict';
import { authOriginAllowed } from './auth-origin.mjs';
const allowedOrigins = new Set(['https://ufaprova-frontend.onrender.com']);
const check = (path, origin, mobileClient) => authOriginAllowed({ path, origin, mobileClient, allowedOrigins });
test('native password login accepts the mobile header without Origin', () => {
  assert.equal(check('/api/auth/login', undefined, 'mobile'), true);
  assert.equal(check('/api/auth/login', undefined, undefined), false);
});
test('only the two Google mobile POST endpoints accept native requests without Origin', () => {
  for (const path of ['/api/auth/google/mobile/start','/api/auth/google/mobile/status']) {
    assert.equal(check(path, undefined, 'mobile'), true);
    assert.equal(check(path, undefined, undefined), false);
    assert.equal(check(path, 'https://untrusted.example', 'mobile'), false);
  }
  assert.equal(check('/api/auth/google/start', undefined, 'mobile'), false);
});
test('the mobile header does not permit a disallowed browser origin', () => {
  assert.equal(check('/api/auth/login', 'https://untrusted.example', 'mobile'), false);
  assert.equal(check('/api/auth/login', 'https://ufaprova-frontend.onrender.com', undefined), true);
});
test('educator registration and sensitive profile changes require approved browser origins', () => {
  for (const path of ['/api/auth/register', '/api/auth/complete-cpf', '/api/auth/reset-password']) assert.equal(check(path, undefined, 'mobile'), false);
});

test('native student signup and verification require the mobile header and reject foreign origins',()=>{for(const path of ['/api/auth/student/register','/api/auth/resend-verification','/api/auth/verify-email','/api/auth/logout']){assert.equal(check(path,undefined,'mobile'),true);assert.equal(check(path,undefined,undefined),false);assert.equal(check(path,'https://untrusted.example','mobile'),false);}});
