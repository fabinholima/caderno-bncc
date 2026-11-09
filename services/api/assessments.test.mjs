import { assertAssessmentQuestionStyle } from '../../lib/render-templates.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssessmentSchema,
  questionUsesFullWidth,
  seededShuffle,
} from './assessments.mjs';

test('valida a montagem de avaliação', () => {
  const input = createAssessmentSchema.parse({
    title: 'Avaliação bimestral',
    grade: '7º ano',
    header: {
      institutionName: 'Escola Municipal Paulo Freire',
      teacherName: 'Ana Souza',
      className: '7º A',
      term: '2º bimestre',
      date: '15/09/2026',
    },
    sections: [
      {
        subject: 'Matemática',
        columns: 2,
        startOnNewPage: false,
        questionIds: ['10000000-0000-4000-8000-000000000001'],
        fullWidthQuestionIds: ['10000000-0000-4000-8000-000000000001'],
      },
      {
        subject: 'Química',
        columns: 1,
        startOnNewPage: true,
        questionIds: ['10000000-0000-4000-8000-000000000002'],
      },
    ],
    versionCount: 3,
    paper: 'A5',
    template: 'basicexam-v1',
    font: 'schola',
    fontSize: 14,
    instructions: [],
  });
  assert.equal(input.versionCount, 3);
  assert.equal(input.sections[0].columns, 2);
  assert.deepEqual(input.sections[0].fullWidthQuestionIds, [
    '10000000-0000-4000-8000-000000000001',
  ]);
  assert.equal(input.paper, 'A5');
  assert.equal(input.template, 'basicexam-v1');
  assert.equal(input.font, 'schola');
  assert.equal(input.fontSize, 14);
  assert.equal(input.header.teacherName, 'Ana Souza');
});

test('rejeita questão em largura total fora da própria seção', () => {
  assert.throws(() =>
    createAssessmentSchema.parse({
      title: 'Simulado de Geografia',
      grade: '2º ano',
      sections: [
        {
          subject: 'Geografia',
          columns: 2,
          questionIds: ['10000000-0000-4000-8000-000000000001'],
          fullWidthQuestionIds: ['10000000-0000-4000-8000-000000000002'],
        },
      ],
      versionCount: 1,
    }),
  );
});

test('valida formato e tamanho do logotipo do cabeçalho', () => {
  const base = {
    title: 'Avaliação de Ciências',
    grade: '9º ano',
    header: { institutionName: 'Escola Modelo' },
    sections: [
      {
        subject: 'Ciências',
        questionIds: ['10000000-0000-4000-8000-000000000001'],
      },
    ],
    versionCount: 1,
  };
  const valid = createAssessmentSchema.parse({
    ...base,
    header: {
      ...base.header,
      logoDataUrl: `data:image/png;base64,${Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('logo')]).toString('base64')}`,
    },
  });
  assert.match(valid.header.logoDataUrl, /^data:image\/png;base64,/);
  assert.throws(() =>
    createAssessmentSchema.parse({
      ...base,
      header: { ...base.header, logoDataUrl: 'https://site.example/logo.png' },
    }),
  );
});

test('aplica o layout padrão e rejeita identificador arbitrário', () => {
  const base = {
    title: 'Avaliação de Ciências',
    grade: '9º ano',
    sections: [
      {
        subject: 'Química',
        questionIds: ['10000000-0000-4000-8000-000000000001'],
      },
    ],
    versionCount: 1,
  };
  assert.equal(createAssessmentSchema.parse(base).template, 'basicexam-v1');
  assert.equal(createAssessmentSchema.parse(base).font, 'plex');
  assert.equal(createAssessmentSchema.parse(base).fontSize, 11);
  assert.throws(() =>
    createAssessmentSchema.parse({ ...base, template: '../../layout.tex' }),
  );
  assert.throws(() => createAssessmentSchema.parse({ ...base, font: 'times' }));
  assert.throws(() => createAssessmentSchema.parse({ ...base, fontSize: 17 }));
});

test('não permite repetir uma questão entre seções', () => {
  const questionId = '10000000-0000-4000-8000-000000000001';
  assert.throws(() =>
    createAssessmentSchema.parse({
      title: 'Simulado multidisciplinar',
      grade: 'Ensino Médio',
      sections: [
        { subject: 'Matemática', questionIds: [questionId] },
        { subject: 'Química', questionIds: [questionId] },
      ],
      versionCount: 2,
    }),
  );
});

test('embaralhamento é determinístico por semente', () => {
  assert.deepEqual(
    seededShuffle([1, 2, 3, 4], 42),
    seededShuffle([1, 2, 3, 4], 42),
  );
  assert.notDeepEqual(
    seededShuffle([1, 2, 3, 4], 42),
    seededShuffle([1, 2, 3, 4], 43),
  );
});

test('prova de Certo/Errado exige seleção exclusiva e rejeita a mistura', () => {
  assert.doesNotThrow(() =>
    assertAssessmentQuestionStyle([{ type: 'true_false' }], 'certo-errado-v1'),
  );
  assert.throws(
    () =>
      assertAssessmentQuestionStyle(
        [{ type: 'true_false' }, { type: 'single_choice' }],
        'certo-errado-v1',
      ),
    /somente questões/,
  );
  assert.throws(
    () =>
      assertAssessmentQuestionStyle([{ type: 'true_false' }], 'basicexam-v1'),
    /não podem ser mescladas/,
  );
});

test('questão marcada para uma coluna no cadastro sempre usa largura total', () => {
  const chosen = new Set(['q1']);
  assert.equal(
    questionUsesFullWidth({ id: 'q1', recommend_single_column: false }, chosen),
    true,
  );
  assert.equal(
    questionUsesFullWidth({ id: 'q2', recommend_single_column: true }, chosen),
    true,
  );
  assert.equal(
    questionUsesFullWidth({ id: 'q3', recommend_single_column: false }, chosen),
    false,
  );
  assert.equal(questionUsesFullWidth({ id: 'q4' }, new Set()), false);
});
