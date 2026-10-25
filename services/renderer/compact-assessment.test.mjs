import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';
import { assertAssessmentQuestionStyle } from '../../lib/render-templates.mjs';
import { compactCardProfile } from '../../lib/compact-assessment.mjs';

test('compact models put one calibrated card before questions and keep distinct labels', async () => {
  const base = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  for (const template of ['compacto-10-v1', 'certo-errado-10-v1']) {
    const profile = compactCardProfile(template, 10);
    const snapshot = structuredClone(base);
    snapshot.render.template = template;
    snapshot.version.qrFileName = 'qr.png';
    snapshot.questions = Array.from({length: 10}, (_, index) => ({
      ...base.questions[0], number: index + 1,
      type: profile.labels.length === 2 ? 'true_false' : 'single_choice',
      alternatives: profile.labels.map((label, option) => ({
        stableKey: `alt-${String.fromCharCode(97 + option)}`, label,
        content: [{type: 'paragraph', text: label}],
      })),
      answer: {correctStableKeys: ['alt-a']},
    }));
    const tex = renderAssessment(snapshot);
    assert.ok(tex.indexOf('QUADRO DE RESPOSTAS') < tex.indexOf('\\startquestion'));
    assert.equal((tex.match(/QUADRO DE RESPOSTAS/g) || []).length, 1);
    assert.equal((tex.match(/draw fullcircle/g) || []).length, 10 * profile.labels.length);
    assert.equal((tex.match(/\)\) withcolor \.65white;/g) || []).length, 10 * profile.labels.length);
    assert.equal((tex.match(/fill unitsquare scaled 2.4mm/g) || []).length, 4);
    assert.equal((tex.match(/\\externalfigure\[qr.png\]/g) || []).length, 1);
    snapshot.render.mode = 'answer-key';
    assert.ok(!renderAssessment(snapshot).includes('QUADRO DE RESPOSTAS'));
    snapshot.render.paper = 'A5';
    assert.throws(() => renderAssessment(snapshot), /papel A4/);
  }
});

test('compact models reject more than ten items and incompatible question types', () => {
  assert.throws(() => assertAssessmentQuestionStyle(Array(11).fill({type:'single_choice'}), 'compacto-10-v1'), /10 questões/);
  assert.throws(() => assertAssessmentQuestionStyle([{type:'multiple_choice'}], 'compacto-10-v1'), /resposta única/);
  assert.throws(() => assertAssessmentQuestionStyle([{type:'single_choice'}], 'certo-errado-10-v1'), /somente questões/);
  assert.doesNotThrow(() => assertAssessmentQuestionStyle([{type:'true_false'}], 'certo-errado-10-v1'));
});
