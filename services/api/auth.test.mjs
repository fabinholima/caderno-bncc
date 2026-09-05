import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, registerSchema, verifyPassword } from './auth.mjs';

test('hash de senha usa salt e comparação segura', async () => {
  const first = await hashPassword('SenhaSegura123!');
  const second = await hashPassword('SenhaSegura123!');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('SenhaSegura123!', first), true);
  assert.equal(await verifyPassword('senha-incorreta', first), false);
});

test('cadastro exige senha longa e e-mail válido', () => {
  assert.equal(
    registerSchema.parse({
      institutionName: 'Escola Exemplo',
      displayName: 'Professor Exemplo',
      email: 'PROFESSOR@EXEMPLO.COM',
      password: 'SenhaSegura123!',
    }).email,
    'professor@exemplo.com',
  );
  assert.throws(() =>
    registerSchema.parse({
      institutionName: 'Escola',
      displayName: 'Professor',
      email: 'invalido',
      password: 'curta',
    }),
  );
});
