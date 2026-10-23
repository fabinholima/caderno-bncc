import test from 'node:test';
import assert from 'node:assert/strict';
import {
  workspaceConfigurationSchema,
  workspaceSaveSchema,
} from './assessment-workspaces.mjs';
import { createAssessmentSchema } from './assessments.mjs';
import { applicationSchema } from './academic.mjs';
const id = '00000000-0000-4000-8000-000000000001';
const config = {
  title: '',
  grade: '',
  header: {
    institutionName: '',
    teacherName: '',
    className: '',
    term: '',
    date: '',
    transcriptionPhrase: '',
    logoDataUrl: '',
  },
  sections: [],
};
test('rascunho permite identificação incompleta, mas limita estrutura e pontuação', () => {
  assert.equal(workspaceConfigurationSchema.parse(config).title, '');
  assert.equal(
    workspaceConfigurationSchema.safeParse({
      ...config,
      questionPoints: { [id]: -1 },
    }).success,
    false,
  );
  assert.equal(
    workspaceConfigurationSchema.safeParse({
      ...config,
      sections: [
        {
          id: 's',
          subject: 'Matemática',
          columns: 1,
          startOnNewPage: false,
          questionIds: ['invalid'],
          fullWidthQuestionIds: [],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    workspaceSaveSchema.safeParse({ configuration: config, revision: 0 })
      .success,
    false,
  );
});
test('prova mantém controles explícitos de ordem e pontos', () => {
  const value = createAssessmentSchema.parse({
    title: 'Prova teste',
    grade: '7º ano',
    sections: [{ subject: 'Matemática', questionIds: [id] }],
    versionCount: 1,
    shuffleQuestions: false,
    questionPoints: { [id]: 2.5 },
  });
  assert.equal(value.shuffleQuestions, false);
  assert.equal(value.questionPoints[id], 2.5);
});
test('aplicação rejeita seleção vazia ou duplicada de alunos', () => {
  const base = { assessmentId: id, classId: id };
  assert.equal(
    applicationSchema.safeParse({ ...base, studentIds: [] }).success,
    false,
  );
  assert.equal(
    applicationSchema.safeParse({ ...base, studentIds: [id, id] }).success,
    false,
  );
  assert.deepEqual(
    applicationSchema.parse({ ...base, studentIds: [id] }).studentIds,
    [id],
  );
});
