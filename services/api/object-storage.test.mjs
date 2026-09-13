import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createFilesystemStorage,
  createObjectStorage,
  createS3Storage,
  normalizeStorageKey,
} from './object-storage.mjs';

test('filesystem stores, reads and deletes private objects', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'caderno-storage-'));
  try {
    const storage = createFilesystemStorage({ root });
    const key = await storage.put(
      'exam-imports/id/exam.pdf',
      Buffer.from('pdf'),
    );
    assert.equal(key, 'exam-imports/id/exam.pdf');
    assert.equal((await storage.get(key)).toString(), 'pdf');
    await storage.delete(key);
    await assert.rejects(storage.get(key), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects traversal and ambiguous object keys', () => {
  for (const key of ['', '/absolute', '../secret', 'folder//file', 'a/./b'])
    assert.throws(() => normalizeStorageKey(key), /inválida/);
});

test('S3 adapter keeps objects private and applies prefix', async () => {
  const commands = [];
  const client = {
    async send(command) {
      commands.push(command);
      if (command.constructor.name === 'GetObjectCommand')
        return { Body: Uint8Array.from([112, 100, 102]) };
      return {};
    },
  };
  const storage = createS3Storage({
    bucket: 'private-bucket',
    prefix: 'tenant-files',
    serverSideEncryption: 'AES256',
    client,
  });
  await storage.put('exam-imports/id/exam.pdf', Buffer.from('pdf'), {
    contentType: 'application/pdf',
  });
  assert.equal(
    (await storage.get('exam-imports/id/exam.pdf')).toString(),
    'pdf',
  );
  await storage.delete('exam-imports/id/exam.pdf');
  assert.deepEqual(
    commands.map((command) => command.constructor.name),
    ['PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand'],
  );
  assert.equal(commands[0].input.Bucket, 'private-bucket');
  assert.equal(commands[0].input.Key, 'tenant-files/exam-imports/id/exam.pdf');
  assert.equal(commands[0].input.ContentType, 'application/pdf');
  assert.equal(commands[0].input.ServerSideEncryption, 'AES256');
  assert.equal(commands[0].input.ACL, undefined);
});

test('selects database, filesystem or S3 from the environment', () => {
  assert.equal(createObjectStorage({}), null);
  assert.equal(
    createObjectStorage({ EXAM_STORAGE_DIR: '/tmp/caderno' }).provider,
    'filesystem',
  );
  assert.equal(
    createObjectStorage(
      {
        FILE_STORAGE_PROVIDER: 's3',
        OBJECT_STORAGE_BUCKET: 'bucket',
      },
      { s3Client: { send() {} } },
    ).provider,
    's3',
  );
});
