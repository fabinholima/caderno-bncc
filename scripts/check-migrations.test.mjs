import assert from 'node:assert/strict';
import test from 'node:test';
import { findMigrationProblems } from './check-migrations.mjs';

test('aceita as duplicatas antigas e números únicos', () => {
  assert.deepEqual(findMigrationProblems(['071_a.sql', '071_b.sql', '102_c.sql', 'README.md']), []);
});

test('rejeita um número novo repetido', () => {
  assert.match(findMigrationProblems(['102_a.sql', '102_b.sql'])[0], /102/);
});
