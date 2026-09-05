import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  materializeInstitutionLogo,
  materializeQuestionImages,
  validatePdf,
} from './worker.mjs';

test('aceita um arquivo com assinatura PDF e conteúdo', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'caderno-pdf-'));
  const file = path.join(directory, 'prova.pdf');
  try {
    await writeFile(file, `%PDF-1.7\n${'0'.repeat(200)}`);
    assert.equal(await validatePdf(file), 209);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejeita saída que não seja um PDF', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'caderno-pdf-'));
  const file = path.join(directory, 'prova.pdf');
  try {
    await writeFile(file, `texto\n${'0'.repeat(200)}`);
    await assert.rejects(validatePdf(file), /não é um PDF válido/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('materializa o logotipo institucional somente na pasta do trabalho', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'caderno-logo-'));
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  try {
    const snapshot = await materializeInstitutionLogo(
      {
        institution: {
          name: 'Escola Modelo',
          logoDataUrl: `data:image/png;base64,${png.toString('base64')}`,
        },
      },
      directory,
    );
    assert.equal(snapshot.institution.logoFileName, 'institution-logo.png');
    assert.equal(snapshot.institution.logoDataUrl, undefined);
    assert.deepEqual(
      await readFile(path.join(directory, 'institution-logo.png')),
      png,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('materializa imagens dos enunciados somente na pasta do trabalho', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'caderno-question-image-'),
  );
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  try {
    const snapshot = await materializeQuestionImages(
      {
        sections: [
          {
            questions: [
              {
                statement: [
                  {
                    type: 'image',
                    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
                    alt: 'Diagrama',
                  },
                ],
                alternatives: [],
                answer: {},
              },
            ],
          },
        ],
      },
      directory,
    );
    assert.equal(
      snapshot.sections[0].questions[0].statement[0].fileName,
      'question-image-1.png',
    );
    assert.deepEqual(
      await readFile(path.join(directory, 'question-image-1.png')),
      png,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
