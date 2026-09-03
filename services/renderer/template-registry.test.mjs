import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRenderTemplate,
  listRenderTemplates,
} from './template-registry.mjs';

test('expõe somente metadados seguros dos layouts registrados', () => {
  const templates = listRenderTemplates();
  assert.equal(templates.length, 1);
  assert.equal(templates[0].id, 'basicexam-v1');
  assert.equal(templates[0].engine, 'ConTeXt / LuaMetaTeX');
  assert.equal('render' in templates[0], false);
});

test('não aceita nome ou caminho de layout arbitrário', () => {
  assert.throws(
    () => getRenderTemplate('../../layout-externo'),
    /Layout de impressão não permitido/,
  );
});
