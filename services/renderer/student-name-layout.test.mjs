import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';

async function studentTex(name, number = '12') {
  const base = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  const snapshot = structuredClone(base);
  snapshot.render.mode = 'student';
  snapshot.candidate = { name, number };
  return renderAssessment(snapshot);
}

test('nome curto segue na mesma linha do Nº e da assinatura', async () => {
  const tex = await studentTex('Fabio de Souza');
  assert.match(
    tex,
    /Aluno\(a\):\}\\hskip 1\.5mm\{\\switchtobodyfont\[9pt\]\\bold\{Fabio de Souza\}\}\\hskip 3mm Nº 12/,
  );
  assert.doesNotMatch(tex, /\\vbox\{\\hsize=/);
});

test('nome longo quebra em bloco próprio com Nº e assinatura na linha de baixo', async () => {
  const longName =
    'Maria Eduarda Fernandes de Oliveira Albuquerque Santos Pereira Lima da Silva';
  const tex = await studentTex(longName);
  assert.match(tex, /\\vbox\{\\hsize=\\dimexpr\\textwidth-4mm\\relax/);
  assert.match(tex, /\\bold\{Nº\} 12/);
  assert.match(tex, /\\bold\{Assinatura:\}/);
});
