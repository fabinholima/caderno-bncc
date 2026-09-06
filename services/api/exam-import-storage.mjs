import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const storageRoot = process.env.EXAM_STORAGE_DIR
  ? resolve(process.env.EXAM_STORAGE_DIR)
  : '';

export async function storeExamDocument(importId, kind, contents) {
  if (!storageRoot)
    return { provider: 'database', key: null, databaseContents: contents };
  const directory = join(storageRoot, importId);
  await mkdir(directory, { recursive: true });
  const key = `${importId}/${kind}.pdf`;
  await writeFile(join(storageRoot, key), contents, { flag: 'wx' }).catch(
    async (error) => {
      if (error.code !== 'EEXIST') throw error;
      await writeFile(join(storageRoot, key), contents);
    },
  );
  return { provider: 'filesystem', key, databaseContents: null };
}

export async function readExamDocument(row) {
  if (row.storage_provider === 'filesystem' && row.storage_key) {
    const target = resolve(storageRoot, row.storage_key);
    if (!storageRoot || !target.startsWith(`${storageRoot}/`))
      throw new Error('Chave de armazenamento inválida.');
    return readFile(target);
  }
  if (row.file_data) return row.file_data;
  throw new Error('Documento da importação não está disponível.');
}
