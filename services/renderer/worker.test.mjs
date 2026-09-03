import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validatePdf } from './worker.mjs';

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
