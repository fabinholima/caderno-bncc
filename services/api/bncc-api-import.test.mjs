import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAreaPayload } from './bncc-api-import.mjs';

test('valida a quantidade e o prefixo das habilidades da área', () => {
  const area = {
    key: 'em-area-mat',
    expectedSkills: 2,
    discipline: 'Matemática',
  };
  const items = validateAreaPayload(
    {
      total: 2,
      itens: [{ codigo: 'EM13MAT101' }, { codigo: 'EM13MAT102' }],
    },
    area,
  );
  assert.equal(items.length, 2);
});

test('rejeita códigos de outra área', () => {
  assert.throws(
    () =>
      validateAreaPayload(
        { total: 1, itens: [{ codigo: 'EM13CNT101' }] },
        {
          key: 'em-area-mat',
          expectedSkills: 1,
          discipline: 'Matemática',
        },
      ),
    /outra área/,
  );
});
