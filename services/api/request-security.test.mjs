import assert from 'node:assert/strict';
import test from 'node:test';
import { apiSecurityHeaders, clientIp, mutationOriginAllowed } from './request-security.mjs';

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
