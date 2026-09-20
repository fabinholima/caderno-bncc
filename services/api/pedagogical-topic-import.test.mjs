import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePedagogicalTopicCatalog } from './pedagogical-topic-import.mjs';

const catalog = {
  version: 'BNCC-2018-reviewed',
  subjects: [{
    sourceKey: 'em-quimica', name: 'Química', stage: 'Ensino Médio',
    areaSourceKey: 'em-area-cnt',
    topics: [{ sourceKey: 'termoquimica', name: 'Termoquímica', gradeRange: '2ª série',
      subtopics: [{ sourceKey: 'lei-hess', name: 'Lei de Hess' }] }],
  }],
};

test('normaliza objetos e subtópicos preservando a hierarquia', () => {
  const result = normalizePedagogicalTopicCatalog(catalog);
  assert.deepEqual(result.subjects[0].topics, [
    { sourceKey: 'termoquimica', name: 'Termoquímica', gradeRange: '2ª série', parentSourceKey: null, position: 1 },
    { sourceKey: 'lei-hess', name: 'Lei de Hess', gradeRange: '2ª série', parentSourceKey: 'termoquimica', position: 1 },
  ]);
});

test('rejeita tópico sem série herdada ou informada', () => {
  assert.throws(() => normalizePedagogicalTopicCatalog({
    ...catalog,
    subjects: [{ ...catalog.subjects[0], topics: [{ sourceKey: 'x', name: 'XX', subtopics: [] }] }],
  }), /sem série/);
});

test('rejeita sourceKey duplicado', () => {
  assert.throws(() => normalizePedagogicalTopicCatalog({
    ...catalog,
    subjects: [{ ...catalog.subjects[0], topics: [{ ...catalog.subjects[0].topics[0], subtopics: [{ sourceKey: 'termoquimica', name: 'Outro' }] }] }],
  }), /duplicado/);
});
