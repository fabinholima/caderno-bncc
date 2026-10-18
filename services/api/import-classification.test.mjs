import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImportClassification } from '../../lib/import-classification.mjs';
const disciplines = [
  { id: 'f', name: 'Física', stage: 'Ensino Médio' },
  { id: 'q', name: 'Química', stage: 'Ensino Médio' },
  { id: 'b', name: 'Biologia', stage: 'Ensino Médio' },
];
const topics = [
  { id: 'ft', discipline_id: 'f', grade_range: '2ª série' },
  { id: 'bt', discipline_id: 'b', grade_range: '2ª série' },
];
const base = {
  disciplines,
  topics,
  item: { primarySubject: 'Física' },
  settings: { grade: '2ª série', objectId: 'ft', skill: 'EM13CNT101' },
};
test('inherits actual source discipline rather than Chemistry', () => {
  const c = resolveImportClassification(base);
  assert.equal(c.subject, 'Física');
  assert.equal(c.topicId, 'ft');
  assert.equal(c.skill, 'EM13CNT101');
});
test('individual discipline wins and never inherits another discipline topic or skill', () => {
  const c = resolveImportClassification({
    ...base,
    candidate: { pedagogicalDisciplineId: 'b' },
  });
  assert.equal(c.subject, 'Biologia');
  assert.equal(c.topicId, '');
  assert.equal(c.skill, '');
  const selected = resolveImportClassification({
    ...base,
    candidate: {
      pedagogicalDisciplineId: 'b',
      pedagogicalTopicId: 'bt',
      skill: 'EM13CNT202',
    },
  });
  assert.equal(selected.topicId, 'bt');
  assert.equal(selected.skill, 'EM13CNT202');
});
test('changing grade or selecting a stale topic does not cross classify', () => {
  assert.equal(
    resolveImportClassification({ ...base, candidate: { grade: '3ª série' } })
      .topicId,
    '',
  );
  assert.equal(
    resolveImportClassification({
      ...base,
      candidate: { pedagogicalDisciplineId: 'b', pedagogicalTopicId: 'ft' },
    }).topicId,
    '',
  );
});
test('multidisciplinary import can classify each question without a source subject', () => {
  assert.equal(
    resolveImportClassification({
      ...base,
      item: {},
      candidate: { pedagogicalDisciplineId: 'b', pedagogicalTopicId: 'bt' },
    }).subject,
    'Biologia',
  );
  assert.equal(
    resolveImportClassification({
      ...base,
      item: {},
      settings: {
        ...base.settings,
        pedagogicalDisciplineId: 'b',
        objectId: 'bt',
      },
    }).topicId,
    'bt',
  );
});

test('chemistry imports retain subtopics with inherited grades and equivalent year labels', () => {
  const input = {
    disciplines,
    topics: [
      { id: 'qr', discipline_id: 'q', grade_range: '2ª série' },
      { id: 'qs', discipline_id: 'q', parent_id: 'qr', grade_range: null },
    ],
    settings: {
      pedagogicalDisciplineId: 'q',
      grade: '2ª série',
      topicId: 'qs',
      skill: 'EM13CNT101',
    },
    candidate: { grade: '2º ano' },
  };
  const result = resolveImportClassification(input);
  assert.equal(result.topicId, 'qs');
  assert.equal(result.grade, '2ª série');
  assert.equal(result.skill, 'EM13CNT101');
  assert.equal(
    resolveImportClassification({ ...input, candidate: { grade: '3ª série' } })
      .topicId,
    '',
  );
});
