import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';
import {
  periodicTableMetaPost,
  renderScienceAppendix,
} from './science-appendix.mjs';
import {
  elementPosition,
  formatAtomicMass,
  periodicElements,
  supportsScienceAppendix,
} from '../../lib/periodic-table.mjs';

const sample = async () =>
  JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );

test('tabela periódica tem os 118 elementos em posições únicas', () => {
  assert.equal(periodicElements.length, 118);
  periodicElements.forEach(([z], index) => assert.equal(z, index + 1));
  const cells = new Set(
    periodicElements.map(([z]) => {
      const { row, column } = elementPosition(z);
      return `${row}:${column}`;
    }),
  );
  assert.equal(cells.size, 118);
  assert.deepEqual(elementPosition(1), { row: 1, column: 1 });
  assert.deepEqual(elementPosition(2), { row: 1, column: 18 });
  assert.deepEqual(elementPosition(5), { row: 2, column: 13 });
  assert.deepEqual(elementPosition(26), { row: 4, column: 8 });
  assert.deepEqual(elementPosition(57), { row: 8, column: 3 });
  assert.deepEqual(elementPosition(72), { row: 6, column: 4 });
  assert.deepEqual(elementPosition(103), { row: 9, column: 17 });
  assert.deepEqual(elementPosition(118), { row: 7, column: 18 });
});

test('massa atômica com duas casas e vírgula decimal', () => {
  assert.equal(formatAtomicMass(16), '16,00');
  assert.equal(formatAtomicMass(1.01), '1,01');
  assert.equal(formatAtomicMass('(98)'), '(98)');
  const tex = periodicTableMetaPost();
  assert.match(tex, /\\startMPcode/);
  assert.match(tex, /\\bf Fe/);
  assert.match(tex, /55,85/);
  assert.match(tex, /TextWidth/);
});

test('anexo só é oferecido em Química e Física', () => {
  assert.equal(supportsScienceAppendix(['Química']), true);
  assert.equal(supportsScienceAppendix(['Matemática', 'FÍSICA']), true);
  assert.equal(supportsScienceAppendix(['Educação Física']), false);
  assert.equal(supportsScienceAppendix(['Biologia', 'História']), false);
  assert.equal(renderScienceAppendix({}), '');
});

test('inclui tabela periódica e constantes no caderno, não no gabarito', async () => {
  const snapshot = await sample();
  assert.doesNotMatch(renderAssessment(snapshot), /Tabela periódica/);
  snapshot.render.includePeriodicTable = true;
  snapshot.render.includePhysicalConstants = true;
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\subject\{Tabela periódica dos elementos\}/);
  assert.match(tex, /\\subject\{Constantes físicas e químicas\}/);
  assert.ok(
    tex.indexOf('Tabela periódica dos elementos') <
      tex.indexOf('Constantes físicas e químicas'),
  );
  snapshot.render.mode = 'answer-key';
  assert.doesNotMatch(
    renderAssessment(snapshot),
    /Tabela periódica|Constantes físicas/,
  );
});

test('pode incluir só a tabela de constantes', async () => {
  const snapshot = await sample();
  snapshot.render.includePhysicalConstants = true;
  const tex = renderAssessment(snapshot);
  assert.match(tex, /Constantes físicas e químicas/);
  assert.doesNotMatch(tex, /Tabela periódica/);
});
