import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSaebReference } from './saeb-import.mjs';

test('parses elementary and high-school SAEB topics and descriptors', () => {
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
I. Procedimentos de Leitura
D2 – descritor do ensino médio
II. Implicações do Suporte
D12 – Identificar a finalidade do texto.
D20 – Reconhecer diferentes formas de tratar uma informação.
IV. Coerência e Coesão
D7 – Identificar a tese.
`;
  const matrices = parseSaebReference(input, {
    key: 'saeb-lp-ef',
    subject: 'Língua Portuguesa',
  });
  assert.equal(matrices.length, 3);
  assert.deepEqual(
    matrices.map((item) => item.descriptors.length),
    [2, 1, 4],
  );
  assert.equal(matrices[2].stage, 'Ensino Médio');
  assert.equal(matrices[2].topics[2].name, 'Relação entre Textos');
  assert.equal(
    matrices[0].descriptors[0].description,
    'Localizar informações explícitas em um texto.',
  );
});
