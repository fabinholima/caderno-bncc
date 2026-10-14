import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  billingConfigured,
  checkoutSelection,
  verifySignature,
  checkoutUrl,
  accessUntil,
} from './mercado-pago.mjs';

test('billing is opt-in and forbidden with development bypass', () => {
  const env = {
    MP_BILLING_ENABLED: 'true',
    MP_ACCESS_TOKEN: 'test',
    MP_WEBHOOK_SECRET: 'secret',
    MP_BACK_URL: 'https://example.com/portal',
  };
  assert.equal(billingConfigured({}), false);
  assert.equal(billingConfigured(env), true);
  assert.equal(billingConfigured({ ...env, DEV_AUTH_BYPASS: 'true' }), false);
  assert.equal(
    billingConfigured({ ...env, MP_BACK_URL: 'http://localhost:3000' }),
    false,
  );
});
test('prices are server-controlled and input cannot override amount', () => {
  assert.equal(
    checkoutSelection({ plan: 'professor', cycle: 'monthly', amount: 1 }).cents,
    4990,
  );
  assert.equal(
    checkoutSelection({ plan: 'escola', cycle: 'annual' }).cents,
    199900,
  );
  assert.throws(() => checkoutSelection({ plan: 'trial', cycle: 'monthly' }));
  assert.throws(() =>
    checkoutSelection({ plan: 'professor', cycle: '__proto__' }),
  );
});
test('webhook HMAC validates signed resource and rejects tampering', () => {
  const signature = createHmac('sha256', 'secret')
    .update('id:abc123;request-id:request;ts:1234567890;')
    .digest('hex');
  const headers = {
    'x-request-id': 'request',
    'x-signature': `ts=1234567890,v1=${signature}`,
  };
  assert.equal(verifySignature(headers, 'ABC123', 'secret'), true);
  assert.equal(verifySignature(headers, 'other', 'secret'), false);
  assert.equal(verifySignature(headers, 'ABC123', 'wrong'), false);
  assert.equal(verifySignature({}, 'ABC123', 'secret'), false);
  assert.equal(
    verifySignature(
      { ...headers, 'x-signature': 'ts=1,v1=ff' },
      'ABC123',
      'secret',
    ),
    false,
  );
});
test('checkout redirects are restricted to Mercado Pago Brazil', () => {
  assert.equal(
    checkoutUrl('https://www.mercadopago.com.br/subscriptions/checkout?id=123'),
    'https://www.mercadopago.com.br/subscriptions/checkout?id=123',
  );
  for (const value of [
    'javascript:alert(1)',
    'https://www.mercadopago.com.br.evil.com/',
    'http://www.mercadopago.com.br',
    'https://evil@www.mercadopago.com.br',
  ])
    assert.throws(() => checkoutUrl(value));
});
test('paid periods clamp month ends and leap years', () => {
  assert.equal(
    accessUntil('2026-01-31T10:00:00Z', 1),
    '2026-02-28T10:00:00.000Z',
  );
  assert.equal(
    accessUntil('2024-02-29T10:00:00Z', 12),
    '2025-02-28T10:00:00.000Z',
  );
  assert.throws(() => accessUntil('invalid', 1));
});
