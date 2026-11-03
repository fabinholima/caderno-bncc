import assert from 'node:assert/strict';
import test from 'node:test';
import { apiSecurityHeaders, clientIp, configuredOrigins, jsonBodyAllowed, mutationOriginAllowed } from './request-security.mjs';

const request = (remoteAddress, forwarded) => ({
  socket: { remoteAddress },
  headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
});

test('usa o IP do socket quando não há proxy confiável', () => {
  assert.equal(clientIp(request('::ffff:10.0.0.5', '1.2.3.4'), 0), '10.0.0.5');
});

test('usa a entrada adicionada pelo proxy confiável e ignora as forjadas', () => {
  assert.equal(clientIp(request('10.0.0.5', '6.6.6.6, 203.0.113.9'), 1), '203.0.113.9');
  assert.equal(clientIp(request('10.0.0.5', '6.6.6.6, 203.0.113.9, 10.1.1.1'), 2), '203.0.113.9');
});

test('volta ao socket quando o cabeçalho é inválido ou curto demais', () => {
  assert.equal(clientIp(request('10.0.0.5', 'lixo'), 1), '10.0.0.5');
  assert.equal(clientIp(request('10.0.0.5', '203.0.113.9'), 2), '10.0.0.5');
  assert.equal(clientIp(request('10.0.0.5'), 1), '10.0.0.5');
});

const allowedOrigins = new Set(['https://ufaprova.com.br']);
const check = (overrides) => mutationOriginAllowed({ method: 'POST', allowedOrigins, ...overrides });

test('leituras não exigem origem', () => {
  assert.equal(check({ method: 'GET', origin: 'https://evil.example', cookie: 'caderno_session=x' }), true);
});

test('alterações exigem origem autorizada', () => {
  assert.equal(check({ origin: 'https://ufaprova.com.br', cookie: 'caderno_session=x' }), true);
  assert.equal(check({ origin: 'https://evil.example', cookie: 'caderno_session=x' }), false);
  assert.equal(check({ method: 'DELETE', origin: 'null', cookie: 'caderno_session=x' }), false);
});

test('sem Origin, bloqueia apenas quem envia o cookie de sessão', () => {
  assert.equal(check({ cookie: 'outro=1; caderno_session=x' }), false);
  assert.equal(check({ cookie: 'caderno_session=x', mobileClient: 'mobile' }), true);
  assert.equal(check({ cookie: '' }), true);
});

test('HSTS só é enviado em produção', () => {
  assert.equal(apiSecurityHeaders({ production: false })['strict-transport-security'], undefined);
  assert.match(apiSecurityHeaders({ production: true })['strict-transport-security'], /max-age=/);
  assert.equal(apiSecurityHeaders({ production: false })['x-content-type-options'], 'nosniff');
});

const browser = { cookie: 'caderno_session=x', 'content-length': '20' };
test('navegador com sessão precisa enviar JSON nas alterações', () => {
  assert.equal(jsonBodyAllowed({ method: 'POST', headers: { ...browser, 'content-type': 'application/json; charset=utf-8' } }), true);
  assert.equal(jsonBodyAllowed({ method: 'POST', headers: { ...browser, 'content-type': 'text/plain' } }), false);
  assert.equal(jsonBodyAllowed({ method: 'PUT', headers: { ...browser, 'content-type': 'application/x-www-form-urlencoded' } }), false);
  assert.equal(jsonBodyAllowed({ method: 'POST', headers: { ...browser } }), false);
});

test('não exige JSON sem corpo, sem sessão, no aplicativo ou em leituras', () => {
  assert.equal(jsonBodyAllowed({ method: 'DELETE', headers: { cookie: 'caderno_session=x' } }), true);
  assert.equal(jsonBodyAllowed({ method: 'POST', headers: { 'content-length': '20', 'content-type': 'text/plain' } }), true);
  assert.equal(jsonBodyAllowed({ method: 'POST', headers: { ...browser, 'x-client': 'mobile' } }), true);
  assert.equal(jsonBodyAllowed({ method: 'GET', headers: { ...browser } }), true);
});

test('origens vêm de CORS_ORIGIN e AUTH_FRONTEND_URL', () => {
  const origins = configuredOrigins({ CORS_ORIGIN: 'https://a.example/, https://b.example', AUTH_FRONTEND_URL: 'https://app.example/portal' });
  assert.deepEqual([...origins].sort(), ['https://a.example', 'https://app.example', 'https://b.example']);
  assert.deepEqual([...configuredOrigins({})], ['http://localhost:3000']);
  const production = configuredOrigins({ NODE_ENV: 'production', CORS_ORIGIN: 'https://ufaprova.com.br' });
  assert.ok(production.has('https://www.ufaprova.com.br'));
  assert.ok(!production.has('https://ufaprova-frontend.onrender.com'));
  assert.ok(production.has('https://professor.ufaprova.com.br'));
  assert.ok(production.has('https://aluno.ufaprova.com.br'));
  assert.ok(!configuredOrigins({ CORS_ORIGIN: 'http://localhost:3000' }).has('https://aluno.ufaprova.com.br'), 'fora de produção só valem as origens configuradas');
});
