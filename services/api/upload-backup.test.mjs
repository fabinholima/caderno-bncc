import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { uploadBackup } from './upload-backup.mjs';

async function withFile(name, contents, callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'caderno-backup-'));
  try {
    const file = path.join(directory, name);
    await writeFile(file, contents);
    return await callback(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('envia o backup criptografado ao bucket de backups', async () => {
  const sent = [];
  const s3Client = { send: async (command) => sent.push(command.input) };
  const result = await withFile(
    'ufaprova-2026-11-09_0330.dump.age',
    'age-encryption.org/v1\n-> X25519 abc\n',
    (file) =>
      uploadBackup(
        file,
        { OBJECT_STORAGE_BUCKET: 'arquivos', BACKUP_BUCKET: 'backups' },
        { s3Client },
      ),
  );
  assert.equal(result.key, 'ufaprova-2026-11-09_0330.dump.age');
  assert.equal(sent[0].Bucket, 'backups');
  assert.equal(
    sent[0].Key,
    'backups/postgres/ufaprova-2026-11-09_0330.dump.age',
  );
});

test('recusa dump sem criptografia', async () => {
  const s3Client = { send: async () => assert.fail('não deveria enviar') };
  await withFile('ufaprova-2026-11-09_0330.dump', 'PGDMP', (file) =>
    assert.rejects(
      uploadBackup(file, { OBJECT_STORAGE_BUCKET: 'b' }, { s3Client }),
      /criptografado/,
    ),
  );
  await withFile('ufaprova-2026-11-09_0330.dump.age', 'PGDMP', (file) =>
    assert.rejects(
      uploadBackup(file, { OBJECT_STORAGE_BUCKET: 'b' }, { s3Client }),
      /age/,
    ),
  );
});
