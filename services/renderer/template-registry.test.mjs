import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRenderTemplate,
  listRenderTemplates,
} from './template-registry.mjs';

test('expõe somente metadados seguros dos layouts registrados', () => {
  const templates = listRenderTemplates();
  assert.equal(templates.length, 6);
  assert.deepEqual(new Set(templates.map(item => item.id)), new Set([
    'compacto-10-v1', 'certo-errado-10-v1', 'basicexam-v1', 'certo-errado-v1', 'simulado-v1', 'caderno-duas-colunas-v1',
  ]));
  assert.ok(templates.every(item => item.engine === 'ConTeXt / LuaMetaTeX' && !('render' in item)));
});

test('não aceita nome ou caminho de layout arbitrário', () => {
  assert.throws(
    () => getRenderTemplate('../../layout-externo'),
    /Layout de impressão não permitido/,
  );
});
