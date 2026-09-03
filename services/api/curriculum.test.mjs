import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createKnowledgeObjectSchema,
  createSkillSchema,
  createSubjectSchema,
} from './curriculum.mjs';

test('valida um componente curricular', () => {
  const value = createSubjectSchema.parse({
    name: 'Química',
    stage: 'Ensino Médio',
  });
  assert.equal(value.name, 'Química');
});

test('valida um objeto de conhecimento', () => {
  const value = createKnowledgeObjectSchema.parse({
    subjectId: '40000000-0000-4000-8000-000000000001',
    name: 'Transformações químicas',
    gradeRange: '1ª série',
    description: '',
  });
  assert.equal(value.gradeRange, '1ª série');
});

test('rejeita habilidade sem código BNCC válido', () => {
  assert.throws(() =>
    createSkillSchema.parse({
      knowledgeObjectId: '40000000-0000-4000-8000-000000000001',
      code: 'quimica-1',
      description: 'Descrição suficientemente completa para a habilidade.',
    }),
  );
});
