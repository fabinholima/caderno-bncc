import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPedagogicalTopicSchema,
  createPedagogicalDisciplineSchema,
  setDisciplineSkillsSchema,
  pedagogicalTopicFilterSchema,
  updatePedagogicalTopicSchema,
} from './pedagogical-disciplines.mjs';

test('valida uma disciplina pedagógica ligada à área oficial', () => {
  const value = createPedagogicalDisciplineSchema.parse({
    name: 'Química',
    areaSourceKey: 'em-area-cnt',
  });
  assert.equal(value.name, 'Química');
});

test('valida o filtro do catálogo de subtópicos pedagógicos', () => {
  assert.equal(
    pedagogicalTopicFilterSchema.parse({ disciplineId: '' }).disciplineId,
    '',
  );
  assert.throws(() =>
    pedagogicalTopicFilterSchema.parse({ disciplineId: 'Química' }),
  );
});

test('remove a possibilidade de identificadores inválidos na seleção', () => {
  assert.throws(() =>
    setDisciplineSkillsSchema.parse({ skillIds: ['EM13CNT101'] }),
  );
});

test('valida objetos, subtópicos e alterações do catálogo institucional', () => {
  const object = createPedagogicalTopicSchema.parse({
    disciplineId: '11111111-1111-4111-8111-111111111111',
    name: 'Química dos Alimentos',
    gradeRange: '3ª série',
  });
  assert.equal(object.gradeRange, '3ª série');
  const child = createPedagogicalTopicSchema.parse({
    disciplineId: '11111111-1111-4111-8111-111111111111',
    parentId: '22222222-2222-4222-8222-222222222222',
    name: 'Aditivos alimentares',
  });
  assert.equal(child.parentId, '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(updatePedagogicalTopicSchema.parse({ active: false }), {
    active: false,
  });
  assert.throws(() => updatePedagogicalTopicSchema.parse({}));
});
