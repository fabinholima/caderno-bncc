import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment, todayInBrazil } from './render-contract.mjs';

test('formata a data de hoje em dd/mm/aaaa no fuso de Campo Grande', () => {
  // 02:00 UTC do dia 3 ainda é dia 2 em Campo Grande (UTC-4).
  assert.equal(todayInBrazil(new Date('2026-11-03T02:00:00Z')), '02/11/2026');
  assert.equal(todayInBrazil(new Date('2026-11-18T15:00:00Z')), '18/11/2026');
});

test('prova do aluno sem data no cabeçalho recebe a data de hoje em todos os layouts', async () => {
  const base = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  const today = todayInBrazil();
  for (const template of [
    'basicexam-v1',
    'simulado-v1',
    'caderno-duas-colunas-v1',
    'compacto-10-v1',
  ]) {
    const snapshot = structuredClone(base);
    snapshot.render.template = template;
    snapshot.render.mode = 'student';
    snapshot.assessment = {
      ...snapshot.assessment,
      header: { ...(snapshot.assessment?.header ?? {}), date: '' },
    };
    snapshot.questions = snapshot.questions.slice(0, 1);
    if (template.startsWith('compacto'))
      snapshot.questions = Array.from({ length: 10 }, (_, i) => ({
        ...snapshot.questions[0],
        number: i + 1,
        type: 'single_choice',
      }));
    if (template.startsWith('compacto')) snapshot.version.qrFileName = 'qr.png';
    snapshot.sections = [
      {
        title: '',
        subject: 'Matemática',
        columns: 1,
        startOnNewPage: false,
        questions: snapshot.questions,
      },
    ];
    const tex = renderAssessment(snapshot);
    assert.ok(tex.includes(today), `${template} sem data`);
  }
});
