import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db.mjs';
import { searchSchools, schoolCatalogReady } from './inep-schools.mjs';

test('busca escolas por nome normalizado e UF, limitada a dez resultados', async () => {
  const original = pool.query;
  let captured;
  pool.query = async (sql, values) => {
    captured = { sql, values };
    return { rows: [{ inep: '12345678', name: 'Escola São João', city: 'Campo Grande', state: 'MS' }] };
  };
  try {
    const rows = await searchSchools({ q: 'SAO   JOAO', uf: 'ms' });
    assert.equal(rows[0].inep, '12345678');
    assert.match(captured.sql, /name_normalized LIKE/);
    assert.match(captured.sql, /state = \$1/);
    assert.match(captured.sql, /LIMIT \$3/);
    assert.deepEqual(captured.values, ['MS', 'sao joao%', 10]);
  } finally { pool.query = original; }
});

test('busca por INEP usa código exato e ignora filtro UF inválido', async () => {
  const original = pool.query;
  let captured;
  pool.query = async (sql, values) => { captured = { sql, values }; return { rows: [] }; };
  try {
    assert.deepEqual(await searchSchools({ q: '12345678', uf: 'XX' }), []);
    assert.equal(captured, undefined);
    await searchSchools({ q: '12345678', uf: 'MS' });
    assert.match(captured.sql, /inep_code = \$2/);
    assert.deepEqual(captured.values, ['MS', '12345678', 10]);
  } finally { pool.query = original; }
});

test('detecta quando o catálogo local do Censo ainda está vazio', async () => {
  const original = pool.query;
  pool.query = async () => ({ rows: [{ available: false }] });
  try { assert.equal(await schoolCatalogReady(), false); }
  finally { pool.query = original; }
});
