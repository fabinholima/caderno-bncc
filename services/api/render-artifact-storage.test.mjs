import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readRenderArtifact,
  storeRenderArtifact,
} from './render-artifact-storage.mjs';

test('keeps legacy local manifests readable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'render-legacy-'));
  try {
    await writeFile(path.join(root, 'prova.pdf'), 'pdf');
    assert.equal(
      (
        await readRenderArtifact({ entry: 'prova.pdf', outputRoot: root })
      ).toString(),
      'pdf',
    );
    await assert.rejects(
      readRenderArtifact({ entry: '../secret', outputRoot: root }),
      /inválido/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stores and reads a structured private manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'render-object-'));
  const stored = new Map();
  const storage = {
    provider: 's3',
    async put(key, contents) {
      stored.set(key, contents);
      return key;
    },
    async get(key) {
      return stored.get(key);
    },
  };
  try {
    const file = path.join(root, 'prova.pdf');
    await writeFile(file, 'private-pdf');
    const entry = await storeRenderArtifact({
      key: 'renders/job/prova.pdf',
      file,
      contentType: 'application/pdf',
      legacyRelative: 'job/prova.pdf',
      storage,
    });
    assert.deepEqual(entry, {
      provider: 's3',
      key: 'renders/job/prova.pdf',
      size: 11,
    });
    assert.equal(
      (
        await readRenderArtifact({ entry, outputRoot: root, storage })
      ).toString(),
      'private-pdf',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dependências idênticas usam a mesma chave, mantendo os nomes do TeX', async () => {
  const { storeRenderDependencies } =
    await import('./render-artifact-storage.mjs');
  const directory = await mkdtemp(path.join(tmpdir(), 'render-assets-'));
  const stored = new Map();
  const storage = {
    provider: 'filesystem',
    put: async (key, contents) => {
      stored.set(key, contents);
      return key;
    },
  };
  try {
    await writeFile(path.join(directory, 'one.png'), Buffer.from('same image'));
    await writeFile(path.join(directory, 'two.png'), Buffer.from('same image'));
    await writeFile(
      path.join(directory, 'prova.pdf'),
      Buffer.from('%PDF-not-an-asset'),
    );
    const result = await storeRenderDependencies({
      directory,
      jobId: 'job',
      storage,
    });
    assert.equal(result['one.png'].key, result['two.png'].key);
    assert.equal(stored.size, 1);
    assert.equal(result['prova.pdf'], undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
