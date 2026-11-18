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

test('simulado tira o nome longo do rótulo fixo e o imprime completo no rodapé', async () => {
  const longName =
    'Maria Eduarda Fernandes de Oliveira Albuquerque Santos Pereira Lima da Silva Gonçalves Rodrigues Monteiro';
  const base = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  const snapshot = structuredClone(base);
  snapshot.render = {
    ...snapshot.render,
    template: 'simulado-v1',
    mode: 'student',
  };
  snapshot.candidate = { name: longName, number: '12' };
  const tex = renderAssessment(snapshot);
  assert.match(
    tex,
    /label\.rt\(btex \\switchtobodyfont\[8pt\]\\ss  etex, \(x\+0\.2cm,1\.85cm\)\)/,
  );
  assert.match(tex, /Aluno\(a\): Maria Eduarda Fernandes/);
});

test('caderno de duas colunas mantém o nome longo numa faixa de altura fixa', async () => {
  const longName =
    'Maria Eduarda Fernandes de Oliveira Albuquerque Santos Pereira Lima da Silva Gonçalves Rodrigues Monteiro Cavalcante Barbosa';
  const base = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  const snapshot = structuredClone(base);
  snapshot.render = {
    ...snapshot.render,
    template: 'caderno-duas-colunas-v1',
    mode: 'student',
  };
  snapshot.candidate = { name: longName, number: '12' };
  const tex = renderAssessment(snapshot);
  assert.match(
    tex,
    /\\vtop\{\\hsize=\\dimexpr\\dimexpr\\textwidth-4mm\\relax-100mm\\relax/,
  );
  assert.match(tex, /\\switchtobodyfont\[6pt\]\\bold\{Maria/);
});
