import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPedagogicalDisciplineSchema,
  setDisciplineSkillsSchema,
  pedagogicalTopicFilterSchema,
} from './pedagogical-disciplines.mjs';

test('valida uma disciplina pedagógica ligada à área oficial', () => {
  const value = createPedagogicalDisciplineSchema.parse({
    name: 'Química',
    areaSourceKey: 'em-area-cnt',
  });
  assert.equal(value.name, 'Química');
});

test('valida o filtro do catálogo de subtópicos pedagógicos', () => {
  assert.equal(pedagogicalTopicFilterSchema.parse({ disciplineId: '' }).disciplineId, '');
  assert.throws(() => pedagogicalTopicFilterSchema.parse({ disciplineId: 'Química' }));
});

test('remove a possibilidade de identificadores inválidos na seleção', () => {
  assert.throws(() =>
    setDisciplineSkillsSchema.parse({ skillIds: ['EM13CNT101'] }),
  );
});
