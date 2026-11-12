import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';
import { materializeQuestionImages } from './worker.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  groupBySharedText,
  sharedTextHeading,
  shuffleKeepingSharedTexts,
} from '../../lib/shared-texts.mjs';

async function judgmentSnapshot(sharedTextIds) {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  const original = snapshot.questions[0];
  snapshot.render.template = 'certo-errado-v1';
  snapshot.questions = sharedTextIds.map((sharedTextId, index) => ({
    ...original,
    number: index + 1,
    type: 'true_false',
    sharedTextId,
    statement: [{ type: 'paragraph', text: `Afirmação ${index + 1}.` }],
    alternatives: [
      {
        stableKey: 'alt-a',
        label: 'C',
        content: [{ type: 'paragraph', text: 'Certo' }],
      },
      {
        stableKey: 'alt-b',
        label: 'E',
        content: [{ type: 'paragraph', text: 'Errado' }],
      },
    ],
    answer: { correctStableKeys: ['alt-a'], explanation: [] },
  }));
  delete snapshot.sections;
  snapshot.sharedTexts = [
    {
      id: 'texto-1',
      title: 'De próprio punho',
      source: 'Fonte: Revista & Cia.',
      content: [
        { type: 'paragraph', text: 'Estranhei muito na primeira vez.' },
      ],
    },
  ];
  return snapshot;
}

test('título do texto-base acompanha a numeração final', () => {
  assert.equal(
    sharedTextHeading([6, 7, 8, 9, 10]),
    'Texto para as questões 6 a 10',
  );
  assert.equal(sharedTextHeading([24, 23]), 'Texto para as questões 23 e 24');
  assert.equal(
    sharedTextHeading([3], { judgment: true }),
    'Texto para o item 3',
  );
  assert.equal(
    sharedTextHeading([1, 2, 3], { judgment: true }),
    'Texto para os itens 1 a 3',
  );
  assert.equal(sharedTextHeading([1, 3, 4]), 'Texto para as questões 1, 3 e 4');
});

test('agrupa questões seguidas e rejeita grupo separado', () => {
  const groups = groupBySharedText([
    { id: 1 },
    { id: 2, sharedTextId: 't' },
    { id: 3, sharedTextId: 't' },
    { id: 4 },
  ]);
  assert.deepEqual(
    groups.map((group) => [
      group.sharedTextId,
      group.questions.map((q) => q.id),
    ]),
    [
      [null, [1]],
      ['t', [2, 3]],
      [null, [4]],
    ],
  );
  assert.throws(
    () =>
      groupBySharedText([
        { sharedTextId: 't' },
        { sharedTextId: null },
        { sharedTextId: 't' },
      ]),
    /precisam ficar juntas/,
  );
});

test('embaralhamento mantém o grupo unido e na ordem interna', () => {
  const questions = [
    { id: 'a' },
    { id: 'b', sharedTextId: 't' },
    { id: 'c', sharedTextId: 't' },
    { id: 'd', sharedTextId: 't' },
    { id: 'e' },
  ];
  const ordered = shuffleKeepingSharedTexts(questions, (items) =>
    [...items].reverse(),
  );
  assert.deepEqual(
    ordered.map((question) => question.id),
    ['e', 'b', 'c', 'd', 'a'],
  );
});

test('imprime o texto-base uma vez, fora das questões, antes do grupo', async () => {
  const snapshot = await judgmentSnapshot([
    null,
    'texto-1',
    'texto-1',
    'texto-1',
    null,
  ]);
  const tex = renderAssessment(snapshot);
  assert.equal((tex.match(/Estranhei muito/g) || []).length, 1);
  assert.match(tex, /\\bf Texto para os itens 2 a 4\}/);
  assert.match(tex, /\\midaligned\{\\bf De próprio punho\}/);
  assert.match(tex, /Fonte: Revista \\& Cia\./);
  const text = tex.indexOf('Estranhei muito');
  assert.ok(text > tex.indexOf('Afirmação 1.'));
  assert.ok(text < tex.indexOf('Afirmação 2.'));
  // O texto não fica dentro de nenhuma questão.
  const before = tex.slice(0, text);
  assert.equal(
    (before.match(/\\startquestion/g) || []).length,
    (before.match(/\\stopquestion/g) || []).length,
  );
});

test('falha com mensagem clara quando o grupo chega separado', async () => {
  const snapshot = await judgmentSnapshot(['texto-1', null, 'texto-1']);
  assert.throws(() => renderAssessment(snapshot), /precisam ficar juntas/);
});

test('falha quando o texto-base não está no snapshot', async () => {
  const snapshot = await judgmentSnapshot(['texto-1', 'texto-1']);
  snapshot.sharedTexts = [];
  assert.throws(
    () => renderAssessment(snapshot),
    /Texto-base da questão ausente/,
  );
});

test('texto-base em seção de duas colunas fica no fluxo das colunas', async () => {
  const snapshot = await judgmentSnapshot(['texto-1', 'texto-1', null]);
  snapshot.sections = [
    {
      title: 'Itens',
      subject: 'Língua Portuguesa',
      columns: 2,
      questions: snapshot.questions,
    },
  ];
  const tex = renderAssessment(snapshot);
  const columns = tex.slice(
    tex.indexOf('\\startmixedcolumns'),
    tex.indexOf('\\stopmixedcolumns'),
  );
  assert.match(columns, /Texto para os itens 1 e 2/);
  assert.match(columns, /Estranhei muito/);
});

test('linhas do original e numeração de linhas', async () => {
  const snapshot = await judgmentSnapshot(['texto-1', 'texto-1', null]);
  snapshot.sharedTexts[0].content = [
    { type: 'contextRaw', code: 'Primeira linha do original,\nsegunda linha.' },
  ];
  const plain = renderAssessment(snapshot);
  assert.doesNotMatch(plain, /startlinenumbering|startlines/);
  snapshot.sharedTexts[0].keepLineBreaks = true;
  const lines = renderAssessment(snapshot);
  assert.match(
    lines,
    /\\startlines\nPrimeira linha do original,\nsegunda linha\.\n\\stoplines/,
  );
  assert.doesNotMatch(lines, /startlinenumbering/);
  snapshot.sharedTexts[0].lineNumbering = true;
  const numbered = renderAssessment(snapshot);
  assert.match(
    numbered,
    /\\startlinenumbering\[textobase\]\n\\startlines[\s\S]*\\stoplines\n\\stoplinenumbering\n\\par/,
  );
  // Linhas do original numeradas: a fonte é reduzida até a mais longa caber
  // (aqui, 27 caracteres) e a definição fica fora do grupo local.
  assert.match(numbered, /\\dimexpr\\hsize\*20\/351\\relax/);
  assert.ok(
    numbered.indexOf('\\definelinenumbering') <
      numbered.indexOf('\\begingroup'),
  );
  // O título e a fonte ficam fora da numeração.
  const start = numbered.indexOf('\\startlinenumbering');
  assert.ok(numbered.indexOf('De próprio punho') < start);
  assert.ok(
    numbered.indexOf('Fonte: Revista') >
      numbered.indexOf('\\stoplinenumbering'),
  );
  // Em duas colunas, o texto numerado sai em largura total.
  snapshot.sections = [
    {
      title: 'Itens',
      subject: 'Língua Portuguesa',
      columns: 2,
      questions: snapshot.questions,
    },
  ];
  const columns = renderAssessment(snapshot);
  const textAt = columns.indexOf('\\startlinenumbering');
  const before = columns.slice(0, textAt);
  assert.equal(
    (before.match(/\\startmixedcolumns/g) || []).length,
    (before.match(/\\stopmixedcolumns/g) || []).length,
  );
  assert.match(columns.slice(textAt), /\\startmixedcolumns/);
});

test('prova sem texto-base continua igual', async () => {
  const snapshot = await judgmentSnapshot([null, null]);
  delete snapshot.sharedTexts;
  const tex = renderAssessment(snapshot);
  assert.doesNotMatch(tex, /Texto para/);
});

test('materializa imagens do texto-base', async () => {
  const snapshot = await judgmentSnapshot(['texto-1']);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  snapshot.sharedTexts[0].content.push({
    type: 'image',
    alt: 'Charge',
    caption: '',
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
  });
  const directory = await mkdtemp(path.join(os.tmpdir(), 'texto-base-'));
  try {
    const materialized = await materializeQuestionImages(snapshot, directory);
    const image = materialized.sharedTexts[0].content[1];
    assert.equal(image.dataUrl, undefined);
    assert.match(image.fileName, /^question-image-\d+\.png$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Compilação real no ConTeXt. Rode com CONTEXT_PDF_TEST=1 (e, fora da imagem
// Docker, CONTEXT_MTXRUN_BIN/CONTEXT_SCRIPT apontando para a instalação local).
// Sem o módulo t-basicexam instalado, CONTEXT_PDF_TEST_STUB=1 usa um substituto
// mínimo só para validar o bloco do texto-base.
// Mesmo grupo, em questões A–E (e uma discursiva, quando o layout aceita).
async function choiceSnapshot(sharedTextIds, { essay = false } = {}) {
  const snapshot = await judgmentSnapshot(sharedTextIds);
  const sample = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  ).questions[0];
  snapshot.render.template = 'basicexam-v1';
  snapshot.questions = snapshot.questions.map((question, index) => ({
    ...question,
    type: essay && index === 3 ? 'essay' : 'single_choice',
    alternatives: essay && index === 3 ? [] : sample.alternatives,
    answer: {
      correctStableKeys: essay && index === 3 ? [] : ['alt-b'],
      explanation: [],
    },
  }));
  return snapshot;
}

test(
  'gera PDFs reais com texto-base nos layouts A–E, discursivos e de Certo/Errado',
  { skip: !process.env.CONTEXT_PDF_TEST && 'defina CONTEXT_PDF_TEST=1' },
  async () => {
    const { compileAndValidate, materializeVersionQr } =
      await import('./worker.mjs');
    const { copyFile, writeFile } = await import('node:fs/promises');
    const { execFileSync } = await import('node:child_process');
    /** @type {Array<{template: string, columns: number, essay?: boolean}>} */
    const layouts = [
      { template: 'certo-errado-v1', columns: 1 },
      { template: 'certo-errado-v1', columns: 2 },
      { template: 'certo-errado-10-v1', columns: 1 },
      { template: 'basicexam-v1', columns: 1, essay: true },
      { template: 'basicexam-v1', columns: 2, essay: true },
      { template: 'simulado-v1', columns: 2 },
      { template: 'caderno-duas-colunas-v1', columns: 2 },
      { template: 'compacto-10-v1', columns: 1 },
    ];
    for (const { template, columns, essay } of layouts) {
      const judgment = template.startsWith('certo-errado');
      const ids = [null, 'texto-1', 'texto-1', 'texto-1', null];
      const snapshot = judgment
        ? await judgmentSnapshot(ids)
        : await choiceSnapshot(ids, { essay });
      snapshot.render.template = template;
      // Nos modelos de duas colunas, o texto vai com linhas numeradas.
      if (columns === 2)
        Object.assign(snapshot.sharedTexts[0], {
          keepLineBreaks: true,
          lineNumbering: true,
          content: [
            {
              type: 'contextRaw',
              code: 'Estranhei muito na primeira vez que escutei a expressão\n“de próprio punho”. Parecia que eu ia bater em alguém.\n\nNão era bem o caso.',
            },
          ],
        });
      snapshot.sections = [
        {
          title: 'Itens',
          subject: 'Língua Portuguesa',
          columns,
          questions: snapshot.questions,
        },
      ];
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'texto-base-pdf-'),
      );
      try {
        if (process.env.CONTEXT_PDF_TEST_STUB)
          await copyFile(
            new URL('./test-fixtures/t-basicexam-stub.mkxl', import.meta.url),
            path.join(directory, 't-basicexam.mkxl'),
          );
        const ready = await materializeVersionQr(
          await materializeQuestionImages(snapshot, directory),
          directory,
        );
        for (const mode of ['student', 'answer-key']) {
          const name = mode === 'student' ? 'prova' : 'gabarito';
          const source = path.join(directory, `${name}.tex`);
          await writeFile(
            source,
            renderAssessment({ ...ready, render: { ...ready.render, mode } }),
            'utf8',
          );
          await compileAndValidate(source, directory, name);
        }
        let text = '';
        try {
          text = execFileSync('pdftotext', [
            path.join(directory, 'prova.pdf'),
            '-',
          ]).toString();
        } catch {
          continue; // Sem pdftotext: a compilação e a validação já bastam.
        }
        const flat = text.replace(/\s+/g, ' ');
        assert.match(
          flat,
          judgment
            ? /Texto para os itens 2 a 4/
            : /Texto para as questões 2 a 4/,
          `${template}/${columns}`,
        );
        assert.equal((flat.match(/Estranhei muito/g) || []).length, 1);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
);

test('montagem adiciona o grupo junto e move sem separar', async () => {
  const { addKeepingSharedTexts, moveKeepingSharedTexts } =
    await import('../../lib/shared-texts.mjs');
  const text = { b: 't', c: 't', d: 't' };
  const of = (id) => text[id];
  assert.deepEqual(addKeepingSharedTexts(['a'], 'c', ['b', 'c', 'd'], of), [
    'a',
    'c',
    'b',
    'd',
  ]);
  assert.deepEqual(addKeepingSharedTexts(['a', 'b', 'e'], 'd', [], of), [
    'a',
    'e',
    'b',
    'd',
  ]);
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(moveKeepingSharedTexts(ids, 'c', -1, of), [
    'a',
    'c',
    'b',
    'd',
    'e',
  ]);
  assert.deepEqual(moveKeepingSharedTexts(ids, 'b', -1, of), [
    'b',
    'c',
    'd',
    'a',
    'e',
  ]);
  assert.deepEqual(moveKeepingSharedTexts(ids, 'e', -1, of), [
    'a',
    'e',
    'b',
    'c',
    'd',
  ]);
  assert.deepEqual(moveKeepingSharedTexts(ids, 'a', 1, of), [
    'b',
    'c',
    'd',
    'a',
    'e',
  ]);
  assert.deepEqual(moveKeepingSharedTexts(ids, 'e', 1, of), ids);
});
