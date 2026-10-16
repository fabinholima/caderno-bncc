import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveContextImageReferences,
  assignImageReferences,
  nextImageReference,
} from '../../lib/context-image-references.mjs';
import { materializeQuestionImages } from './worker.mjs';
import { renderAssessment } from './render-contract.mjs';
const image = {
  type: 'image',
  referenceId: 'imagem1',
  fileName: 'question-image-1.png',
  alt: 'Figura',
  caption: '',
};
test('resolves references at their original text position without duplicate image output', async () => {
  const nodes = resolveContextImageReferences([
    {
      type: 'contextRaw',
      code: String.raw`Antes. \externalfigure[imagem1][width=8cm] Depois.`,
    },
    image,
  ]);
  assert.equal(
    nodes[0].code,
    String.raw`Antes. \externalfigure[question-image-1.png][width=8cm] Depois.`,
  );
  assert.equal(nodes[1].inlineReference, true);
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement = nodes;
  const tex = renderAssessment(snapshot);
  assert.equal(
    (tex.match(/\\externalfigure\[question-image-1.png\]/g) || []).length,
    1,
  );
  assert.ok(
    tex.indexOf('Antes.') < tex.indexOf('externalfigure[question-image-1.png]'),
  );
  assert.ok(
    tex.indexOf('Depois.') >
      tex.indexOf('externalfigure[question-image-1.png]'),
  );
});
test('legacy images retain default rendering and missing or duplicate references fail clearly', () => {
  assert.equal(
    resolveContextImageReferences([image])[0].inlineReference,
    undefined,
  );
  assert.throws(
    () =>
      resolveContextImageReferences([
        { type: 'contextRaw', code: String.raw`\externalfigure[imagem2]` },
        image,
      ]),
    /não está anexada/,
  );
  assert.throws(
    () => resolveContextImageReferences([image, image]),
    /repetida/,
  );
  assert.throws(
    () =>
      resolveContextImageReferences([{ ...image, referenceId: '../secret' }]),
    /inválida/,
  );
});
test('upload identities remain stable and deleted aliases are not reused while still referenced', () => {
  const blocks = assignImageReferences([
    { type: 'contextRaw', code: '' },
    { type: 'image', dataUrl: 'x' },
    { ...image, referenceId: 'imagem3' },
  ]);
  assert.equal(blocks[1].referenceId, 'imagem1');
  assert.equal(blocks[2].referenceId, 'imagem3');
  assert.equal(
    nextImageReference([
      { type: 'contextRaw', code: String.raw`\externalfigure[imagem1]` },
    ]),
    'imagem2',
  );
});
test('worker materializes the uploaded PNG and resolves its alias before rendering', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'context-images-'));
  try {
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const q = {
      statement: [
        {
          type: 'contextRaw',
          code: String.raw`Texto \externalfigure[imagem1][width=5cm] Fim.`,
        },
        {
          type: 'image',
          referenceId: 'imagem1',
          dataUrl: `data:image/png;base64,${png.toString('base64')}`,
          alt: 'Imagem',
          caption: '',
        },
      ],
      alternatives: [],
      answer: { explanation: [] },
    };
    const result = await materializeQuestionImages(
      { sections: [{ questions: [q] }] },
      directory,
    );
    assert.match(
      result.sections[0].questions[0].statement[0].code,
      /question-image-1.png/,
    );
    assert.equal(
      result.sections[0].questions[0].statement[1].inlineReference,
      true,
    );
    assert.deepEqual(
      await readFile(path.join(directory, 'question-image-1.png')),
      png,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('aliases resolve independently across statements and alternatives, including JPEG', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'context-jpeg-'));
  try {
    const jpeg = Buffer.from([0xff, 0xd8, 0x00, 0x00, 0xff, 0xd9]);
    const nodes = [
      {
        type: 'contextRaw',
        code: String.raw`\externalfigure[imagem1][width=4cm]`,
      },
      {
        type: 'image',
        referenceId: 'imagem1',
        dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
        alt: 'Figura',
        caption: '',
      },
    ];
    const q = {
      statement: structuredClone(nodes),
      alternatives: [{ content: structuredClone(nodes) }],
      answer: { explanation: structuredClone(nodes) },
    };
    const result = await materializeQuestionImages(
      { sections: [{ questions: [q] }] },
      directory,
    );
    const materialized = result.sections[0].questions[0];
    assert.match(materialized.statement[0].code, /question-image-2.jpg/);
    assert.match(
      materialized.alternatives[0].content[0].code,
      /question-image-1.jpg/,
    );
    assert.match(
      materialized.answer.explanation[0].code,
      /question-image-3.jpg/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
