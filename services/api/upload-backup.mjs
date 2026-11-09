// Envia um backup já criptografado (age) para o armazenamento S3, fora do VPS.
// Chamado por deploy/vps/backup-postgres.sh dentro da imagem da API:
//   node upload-backup.mjs /backups/ufaprova-AAAA-MM-DD_HHMM.dump.age
// BACKUP_BUCKET permite um bucket só para backups; sem ele, usa o dos arquivos.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createObjectStorage } from './object-storage.mjs';

export async function uploadBackup(
  file,
  environment = process.env,
  options = {},
) {
  const name = path.basename(String(file || ''));
  // Nunca envia um dump legível: só arquivos criptografados pelo age.
  if (!/^ufaprova-[\w-]+\.dump\.age$/.test(name))
    throw new Error(
      'Envie somente o backup criptografado (ufaprova-*.dump.age).',
    );
  const contents = await readFile(file);
  if (
    !contents
      .subarray(0, 21)
      .toString('latin1')
      .startsWith('age-encryption.org/')
  )
    throw new Error('O arquivo não está criptografado com age.');
  const storage = createObjectStorage(
    {
      ...environment,
      FILE_STORAGE_PROVIDER: 's3',
      OBJECT_STORAGE_BUCKET:
        environment.BACKUP_BUCKET || environment.OBJECT_STORAGE_BUCKET,
      OBJECT_STORAGE_PREFIX: environment.BACKUP_PREFIX || 'backups/postgres',
    },
    options,
  );
  const key = await storage.put(name, contents, {
    contentType: 'application/octet-stream',
  });
  return { key, bytes: contents.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { key, bytes } = await uploadBackup(process.argv[2]);
  console.log(`Backup enviado: ${key} (${bytes} bytes)`);
}
