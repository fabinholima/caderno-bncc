import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSaebReference } from './saeb-import.mjs';

test('parses elementary-school SAEB topics and descriptors without high school', () => {
  const input = `
5º ano do Ensino Fundamental
I. Procedimentos de Leitura
D1 – Localizar informações explícitas
em um texto.
II. Relação entre Textos
D15 – Reconhecer diferentes formas de tratar uma informação.
9º ANO do Ensino Fundamental
I. Procedimentos de Leitura
D1 – Localizar informações explícitas em um texto.
3ª Série do Ensino Médio
D2 – não deve entrar
`;
  const matrices = parseSaebReference(input, {
    key: 'saeb-lp-ef',
    subject: 'Língua Portuguesa',
  });
  assert.equal(matrices.length, 2);
  assert.deepEqual(
    matrices.map((item) => item.descriptors.length),
    [2, 1],
  );
  assert.equal(
    matrices[0].descriptors[0].description,
    'Localizar informações explícitas em um texto.',
  );
});
