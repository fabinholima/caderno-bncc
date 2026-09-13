import { createObjectStorage } from './object-storage.mjs';

export async function storeExamDocument(importId, kind, contents) {
  const storage = createObjectStorage();
  if (!storage)
    return { provider: 'database', key: null, databaseContents: contents };
  const key = await storage.put(
    `exam-imports/${importId}/${kind}.pdf`,
    contents,
    {
      contentType: 'application/pdf',
    },
  );
  return { provider: storage.provider, key, databaseContents: null };
}

export async function readExamDocument(row) {
  if (['filesystem', 's3'].includes(row.storage_provider) && row.storage_key) {
    const storage = createObjectStorage({
      ...process.env,
      FILE_STORAGE_PROVIDER: row.storage_provider,
    });
    return storage.get(row.storage_key);
  }
  if (row.file_data) return row.file_data;
  throw new Error('Documento da importação não está disponível.');
}
