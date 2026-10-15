import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreQuestionClassification } from '../../lib/question-editor-classification.mjs';
const catalog = {
  disciplines: [
    { id: 'lp', name: 'Língua Portuguesa', stage: 'Ensino Médio' },
    { id: 'f', name: 'Física', stage: 'Ensino Médio' },
  ],
  topics: [
    {
      id: 'root',
      name: 'Leitura',
      discipline_id: 'lp',
      grade_range: '2ª série',
      parent_id: null,
    },
    {
      id: 'child',
      name: 'Texto',
      discipline_id: 'lp',
      grade_range: '2ª série',
      parent_id: 'root',
    },
    {
      id: 'other',
      name: 'Leitura',
      discipline_id: 'lp',
      grade_range: '1ª série',
      parent_id: null,
    },
  ],
  highSchoolAreas: { Linguagens: ['Língua Portuguesa'], Natureza: ['Física'] },
  elementaryAreas: { Linguagens: ['Língua Portuguesa'] },
};
test('opening language question restores its own area, primary skill and exact topic ids', () => {
  const q = {
    subject: 'Língua Portuguesa',
    grade: '2ª série',
    pedagogicalTopicId: 'child',
    knowledgeTopic: 'antigo',
    skills: [{ code: 'EM13LGG101' }, { code: 'EM13LP02', isPrimary: true }],
  };
  const r = restoreQuestionClassification(q, catalog);
  assert.equal(r.subject, q.subject);
  assert.equal(r.area, 'Linguagens');
  assert.equal(r.skill, 'EM13LP02');
  assert.equal(r.objectId, 'root');
  assert.equal(r.subtopicId, 'child');
});
test('late or incomplete catalogs do not replace saved subject or skill', () => {
  const r = restoreQuestionClassification(
    { subject: 'Física', grade: '3ª série', skills: [{ code: 'EM13CNT305' }] },
    {},
  );
  assert.equal(r.subject, 'Física');
  assert.equal(r.skill, 'EM13CNT305');
  assert.equal(r.objectId, '');
});
test('no skill or topic remains unlinked instead of selecting first option', () => {
  const r = restoreQuestionClassification(
    { subject: 'Língua Portuguesa', grade: '2ª série', skills: [] },
    catalog,
  );
  assert.equal(r.skill, '');
  assert.equal(r.objectId, '');
});
test('fundamental stage and grade-specific legacy topic paths are restored', () => {
  assert.equal(
    restoreQuestionClassification(
      {
        subject: 'Língua Portuguesa',
        grade: '8º ano',
        skills: [{ code: 'EF89LP05' }],
      },
      catalog,
    ).stage,
    'Ensino Fundamental',
  );
  const r = restoreQuestionClassification(
    {
      subject: 'Língua Portuguesa',
      grade: '2ª série',
      knowledgeTopic: 'Leitura > Texto',
    },
    catalog,
  );
  assert.equal(r.objectId, 'root');
  assert.equal(r.subtopicId, 'child');
});

test('saved topic id survives even if its catalog has not loaded yet', () => {
  const r = restoreQuestionClassification({
    subject: 'Física',
    grade: '2ª série',
    pedagogicalTopicId: 'saved-topic',
    skills: [{ code: 'EM13CNT101' }],
  });
  assert.equal(r.objectId, 'saved-topic');
  assert.equal(r.skill, 'EM13CNT101');
});
