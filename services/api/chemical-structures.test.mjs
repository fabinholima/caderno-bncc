import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareChemicalStructureBlocks,
  renderChemicalStructure,
} from './chemical-structures.mjs';

test('valida SMILES e gera estrutura química vetorial segura', async () => {
  const result = await renderChemicalStructure({ smiles: 'c1ccccc1' });
  assert.equal(result.canonicalSmiles, 'c1ccccc1');
  assert.match(result.svg, /^<svg /);
  assert.doesNotMatch(result.svg, /<script|foreignObject|href=['"]https?:/i);
  assert.match(result.svgDataUrl, /^data:image\/svg\+xml;base64,/);
});

test('rejeita SMILES inválido', async () => {
  await assert.rejects(
    () => renderChemicalStructure({ smiles: 'não é uma molécula' }),
    /SMILES contém caracteres inválidos|não pôde ser interpretada/,
  );
});

test('regenera o SVG no servidor antes de persistir o bloco', async () => {
  const [block] = await prepareChemicalStructureBlocks([
    {
      type: 'chemicalStructure',
      smiles: 'CCO',
      approved: true,
      svgDataUrl: 'data:image/svg+xml;base64,adulterado',
    },
  ]);
  assert.equal(block.smiles, 'CCO');
  assert.notEqual(block.svgDataUrl, 'data:image/svg+xml;base64,adulterado');
});
