import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createObjectStorage } from './object-storage.mjs';

function legacyTarget(outputRoot, relative) {
  const root = path.resolve(outputRoot);
  const target = path.resolve(root, relative || '');
  const inside = path.relative(root, target);
  if (!relative || inside.startsWith('..') || path.isAbsolute(inside))
    throw new Error('Manifesto de saída inválido.');
  return target;
}

export async function storeRenderArtifact({
  key,
  file,
  contentType,
  legacyRelative,
  environment = process.env,
  storage,
}) {
  const selected = storage ?? createObjectStorage(environment);
  if (!selected) return legacyRelative;
  const contents = await readFile(file);
  const storedKey = await selected.put(key, contents, { contentType });
  return { provider: selected.provider, key: storedKey, size: contents.length };
}

export async function readRenderArtifact({
  entry,
  outputRoot,
  environment = process.env,
  storage,
}) {
  if (typeof entry === 'string')
    return readFile(legacyTarget(outputRoot, entry));
  if (!entry?.provider || !entry?.key)
    throw new Error('Manifesto de saída inválido.');
  const selected =
    storage ??
    createObjectStorage({
      ...environment,
      FILE_STORAGE_PROVIDER: entry.provider,
    });
  if (!selected) throw new Error('Provedor do manifesto não configurado.');
  return selected.get(entry.key);
}
