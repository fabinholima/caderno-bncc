import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptarProva, caixaAltaTexto } from './prova-adaptada.mjs';

const alternativas = () =>
  ['alt-a', 'alt-b', 'alt-c', 'alt-d', 'alt-e'].map((stableKey, indice) => ({
    stableKey,
    label: 'ABCDE'[indice],
    content: [{ type: 'paragraph', text: `Opção ${stableKey}` }],
  }));

function questao(numero, extra = {}) {
  return {
    id: `q-${numero}`,
    sourceQuestionId: `src-${numero}`,
    sourceRevision: 1,
    number: numero,
    type: 'single_choice',
    source: { institution: 'ENEM', year: 2023 },
    difficulty: 'easy',
    statement: [{ type: 'paragraph', text: `Enunciado da questão ${numero}.` }],
    alternatives: alternativas(),
    answer: { correctStableKeys: ['alt-c'] },
    points: 1,
    skills: [],
    ...extra,
  };
}

function snapshot(questions, extra = {}) {
  return {
    schemaVersion: '1.0',
    assessment: {
      id: 'prova-1',
      title: 'Prova bimestral',
      subject: 'Matemática',
      grade: '7º ano',
      instructions: ['Leia com atenção.'],
    },
    institution: { id: 'inst', name: 'Escola Teste' },
    version: {
      id: 'v1',
      code: 'A',
      seed: 42,
      generatedAt: '2026-01-01T00:00:00Z',
    },
    candidateFields: ['name'],
    sections: [],
    questions,
    totals: { points: questions.length, questions: questions.length },
    render: {
      locale: 'pt-BR',
      paper: 'A4',
      mode: 'student',
      template: 'basicexam-v1',
      font: 'plex',
      fontSize: 11,
    },
    ...extra,
  };
}

test('caixa alta preserva comandos TeX e argumentos de fórmula e unidade', () => {
  assert.equal(caixaAltaTexto('Quanto é 2 + 3?'), 'QUANTO É 2 + 3?');
  assert.equal(
    caixaAltaTexto('Água \\bold{importante} com \\chemical{NaCl} em \\unit{m}'),
    'ÁGUA \\bold{IMPORTANTE} COM \\chemical{NaCl} EM \\unit{m}',
  );
});

test('mantém uma questão com três alternativas, reletradas e com gabarito correto', () => {
  const { snapshot: adaptada, relatorio } = adaptarProva(
    snapshot([questao(1), questao(2)]),
  );
  assert.equal(relatorio.questoesMantidas, 2);
  assert.equal(relatorio.alternativasRemovidas, 4);
  for (const item of adaptada.questions) {
    assert.deepEqual(
      item.alternatives.map((alt) => alt.label),
      ['A', 'B', 'C'],
    );
    const keys = item.alternatives.map((alt) => alt.stableKey);
    assert.equal(
      keys.filter((key) => item.answer.correctStableKeys.includes(key)).length,
      1,
    );
    assert.ok(item.alternatives.some((alt) => alt.stableKey === 'alt-c'));
  }
  assert.equal(adaptada.totals.questions, 2);
});

test('enunciado e alternativas vão para caixa alta; instruções ganham aviso de marcação', () => {
  const { snapshot: adaptada } = adaptarProva(snapshot([questao(1)]));
  assert.equal(
    adaptada.questions[0].statement[0].text,
    'ENUNCIADO DA QUESTÃO 1.',
  );
  assert.match(
    adaptada.questions[0].alternatives[0].content[0].text,
    /^OPÇÃO ALT-[A-E]$/,
  );
  assert.deepEqual(adaptada.assessment.instructions, [
    'LEIA COM ATENÇÃO.',
    'MARQUE APENAS UMA ALTERNATIVA POR QUESTÃO.',
  ]);
  assert.equal(adaptada.render.fontSize, 13);
});

test('exclui questões fora do perfil simples e informa o motivo', () => {
  const questoes = [
    questao(1),
    questao(2, { difficulty: 'hard' }),
    questao(3, { type: 'essay' }),
    questao(4, { sharedTextId: 'texto-1' }),
    questao(5, { statement: [{ type: 'paragraph', text: 'x'.repeat(500) }] }),
    questao(6, { statement: [{ type: 'romanList', items: ['um', 'dois'] }] }),
    questao(7, { alternatives: alternativas().slice(0, 2) }),
  ];
  const { snapshot: adaptada, relatorio } = adaptarProva(snapshot(questoes));
  assert.equal(adaptada.questions.length, 1);
  assert.deepEqual(
    relatorio.removidas.map((item) => item.motivo),
    [
      'dificuldade acima do pedido',
      'não é de resposta única',
      'depende de texto-base',
      'enunciado longo',
      'enunciado com recurso complexo',
      'alternativas insuficientes',
    ],
  );
});

test('renumera questões de forma contínua, inclusive dentro das seções', () => {
  const base = snapshot([], {
    sections: [
      {
        id: 's1',
        title: 'Parte 1',
        subject: 'Matemática',
        columns: 1,
        startOnNewPage: false,
        questions: [questao(1), questao(2, { difficulty: 'hard' })],
      },
      {
        id: 's2',
        title: 'Parte 2',
        subject: 'Matemática',
        columns: 1,
        startOnNewPage: true,
        questions: [questao(3), questao(4)],
      },
    ],
  });
  const { snapshot: adaptada } = adaptarProva(base);
  assert.deepEqual(
    adaptada.sections.map((secao) =>
      secao.questions.map((item) => item.number),
    ),
    [[1], [2, 3]],
  );
  assert.deepEqual(
    adaptada.questions.map((item) => item.number),
    [1, 2, 3],
  );
});

test('a mesma semente gera a mesma adaptação', () => {
  const entrada = snapshot([questao(1), questao(2), questao(3)]);
  const primeira = adaptarProva(entrada, { seed: 7 }).snapshot;
  const segunda = adaptarProva(entrada, { seed: 7 }).snapshot;
  assert.deepEqual(primeira, segunda);
});

test('rejeita snapshot inválido e configuração fora do limite', () => {
  assert.throws(
    () => adaptarProva({ schemaVersion: '2.0', questions: [] }),
    /inválido/,
  );
  assert.throws(
    () => adaptarProva(snapshot([questao(1)]), { alternativas: 1 }),
    /2 a 8/,
  );
  assert.throws(
    () => adaptarProva(snapshot([questao(1)]), { dificuldades: [] }),
    /dificuldade/,
  );
});
