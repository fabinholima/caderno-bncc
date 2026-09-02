import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';

test('converte o contrato imutável para t-basicexam e escapa conteúdo', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.assessment.title = 'Prova 100% segura & versionada';
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\usemodule\[basicexam\]\[mode=student\]/);
  assert.match(tex, /Prova 100\\% segura \\& versionada/);
  assert.match(tex, /\\startcitem\[\*\] 30 \\stopcitem/);
  assert.match(tex, /\\stoptext/);
});
