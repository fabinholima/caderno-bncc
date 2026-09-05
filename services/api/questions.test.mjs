import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuestionSchema,
  questionFiltersSchema,
  questionStatusSchema,
} from './questions.mjs';

const baseQuestion = {
  type: 'single_choice',
  statement: 'Qual é o resultado de 6 vezes 7?',
  subject: 'Matemática',
  grade: '7º ano',
  sourceInstitution: 'ENEM',
  sourceYear: 2023,
  skill: 'EF07MA02',
  difficulty: 'Fácil',
  alternatives: [
    { stableKey: 'alt-a', content: '36', isCorrect: false, position: 1 },
    { stableKey: 'alt-b', content: '42', isCorrect: true, position: 2 },
    { stableKey: 'alt-c', content: '48', isCorrect: false, position: 3 },
    { stableKey: 'alt-d', content: '54', isCorrect: false, position: 4 },
    { stableKey: 'alt-e', content: '60', isCorrect: false, position: 5 },
  ],
};

test('aceita uma questão objetiva completa com metadados de origem', () => {
  const parsed = createQuestionSchema.parse(baseQuestion);
  assert.equal(parsed.sourceInstitution, 'ENEM');
  assert.equal(parsed.sourceYear, 2023);
  assert.equal(parsed.alternatives[1].isCorrect, true);
});

test('aceita fórmulas matemáticas e químicas seguras', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    mathFormula: '\\frac{n}{V} = \\frac{m}{M \\cdot V}',
    chemicalFormula: '2H_2 + O_2 -> 2H_2O',
  });
  assert.equal(parsed.chemicalFormula, '2H_2 + O_2 -> 2H_2O');
});

test('aceita conteúdo científico em enunciado, alternativa e resolução', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    statementBlocks: [
      { type: 'paragraph', text: 'Considere a reação abaixo.' },
      {
        type: 'chemical',
        formula: 'N_2 + 3H_2 <=> 2NH_3',
        display: true,
        conditionAbove: '450 °C',
        conditionBelow: 'Fe',
      },
    ],
    alternatives: baseQuestion.alternatives.map((item) => ({
      ...item,
      contentBlocks: [{ type: 'math', tex: '2^3', display: false }],
    })),
    answerBlocks: [{ type: 'chemical', formula: 'NH_3', display: false }],
  });
  assert.equal(parsed.statementBlocks[1].type, 'chemical');
  assert.equal(parsed.alternatives[0].contentBlocks[0].display, false);
});

test('aceita fórmula ConTeXt segura com chemical e unit', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    statementBlocks: [{
      type: 'contextFormula',
      code: '\\chemical{} \\chemical{2HI(g)} \\qquad m=\\unit{18,4 g}',
    }],
  });
  assert.equal(parsed.statementBlocks[0].type, 'contextFormula');
});

test('aceita química e unidades ConTeXt dentro do texto corrido', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    statementBlocks: [
      { type: 'paragraph', text: 'As energias de ligação do' },
      { type: 'contextInline', code: '\\chemical{H_2}' },
      { type: 'paragraph', text: 'e do' },
      { type: 'contextInline', code: '\\chemical{Cl_2}' },
      { type: 'paragraph', text: 'são dadas em' },
      { type: 'contextInline', code: '\\unit{kilo joule inverse mol}' },
    ],
  });
  assert.equal(parsed.statementBlocks[1].type, 'contextInline');
});

test('rejeita comandos perigosos na fórmula ConTeXt', () => {
  assert.throws(() => createQuestionSchema.parse({
    ...baseQuestion,
    statementBlocks: [{ type: 'contextFormula', code: '\\input{segredo}' }],
  }));
  assert.throws(() => createQuestionSchema.parse({
    ...baseQuestion,
    statementBlocks: [{ type: 'contextFormula', code: '\\directlua{os.execute("x")}' }],
  }));
});

test('rejeita comandos arbitrários dentro das fórmulas', () => {
  assert.throws(() =>
    createQuestionSchema.parse({
      ...baseQuestion,
      mathFormula: '\\input{segredo}',
    }),
  );
  assert.throws(() =>
    createQuestionSchema.parse({
      ...baseQuestion,
      chemicalFormula: 'H_2O\\input{x}',
    }),
  );
});

test('rejeita duas respostas corretas em resposta única', () => {
  assert.throws(() =>
    createQuestionSchema.parse({
      ...baseQuestion,
      alternatives: baseQuestion.alternatives.map((answer) => ({
        ...answer,
        isCorrect: true,
      })),
    }),
  );
});

test('rejeita ano de prova fora do intervalo aceito', () => {
  assert.throws(() =>
    createQuestionSchema.parse({ ...baseQuestion, sourceYear: 1800 }),
  );
});

test('aceita múltipla escolha com duas respostas corretas', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    type: 'multiple_choice',
    alternatives: baseQuestion.alternatives.map((answer) => ({
      ...answer,
      isCorrect: true,
    })),
  });
  assert.equal(parsed.type, 'multiple_choice');
});

test('aceita questão discursiva com orientação de correção', () => {
  const parsed = createQuestionSchema.parse({
    ...baseQuestion,
    type: 'essay',
    alternatives: [],
    answerGuide:
      'Espera-se que o estudante justifique a conservação da matéria.',
  });
  assert.equal(parsed.alternatives.length, 0);
});

test('bloqueia comandos MetaPost que acessam execução externa', () => {
  assert.throws(() =>
    createQuestionSchema.parse({
      ...baseQuestion,
      metapostCode: 'runscript "comando externo";',
    }),
  );
});

test('aceita somente estados previstos no fluxo editorial', () => {
  assert.equal(
    questionStatusSchema.parse({ status: 'approved' }).status,
    'approved',
  );
  assert.throws(() => questionStatusSchema.parse({ status: 'deleted' }));
});

test('valida filtros combináveis do banco de questões', () => {
  const filters = questionFiltersSchema.parse({
    subject: 'Matemática',
    knowledgeObjectId: '40000000-0000-4000-8000-000000000003',
    sourceInstitution: 'ENEM',
    sourceYear: '2023',
    difficulty: 'medium',
  });
  assert.equal(filters.sourceYear, 2023);
  assert.throws(() =>
    questionFiltersSchema.parse({ difficulty: 'muito-dificil' }),
  );
});
