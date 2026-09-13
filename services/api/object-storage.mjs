import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export function normalizeStorageKey(key) {
  const normalized = String(key ?? '').replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Chave de armazenamento inválida.');
  return normalized;
}

function filesystemTarget(root, key) {
  if (!root) throw new Error('Diretório do armazenamento não configurado.');
  const normalized = normalizeStorageKey(key);
  const target = path.resolve(root, normalized);
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Chave de armazenamento inválida.');
  return target;
}

export function createFilesystemStorage({ root }) {
  const resolvedRoot = root ? path.resolve(root) : '';
  return {
    provider: 'filesystem',
    async put(key, contents) {
      const target = filesystemTarget(resolvedRoot, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents);
      return normalizeStorageKey(key);
    },
    get(key) {
      return readFile(filesystemTarget(resolvedRoot, key));
    },
    async delete(key) {
      await unlink(filesystemTarget(resolvedRoot, key)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    },
  };
}

async function bodyToBuffer(body) {
  if (!body) throw new Error('O objeto armazenado não possui conteúdo.');
  if (typeof body.transformToByteArray === 'function')
    return Buffer.from(await body.transformToByteArray());
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function createS3Storage({
  bucket,
  prefix = '',
  region = 'us-east-1',
  endpoint,
  forcePathStyle = false,
  serverSideEncryption,
  client,
}) {
  if (!bucket) throw new Error('OBJECT_STORAGE_BUCKET não configurado.');
  const s3 =
    client ||
    new S3Client({ region, endpoint: endpoint || undefined, forcePathStyle });
  const cleanPrefix = String(prefix).replace(/^\/+|\/+$/g, '');
  const objectKey = (key) =>
    [cleanPrefix, normalizeStorageKey(key)].filter(Boolean).join('/');

  return {
    provider: 's3',
    async put(key, contents, metadata = {}) {
      const Key = objectKey(key);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key,
          Body: contents,
          ContentType: metadata.contentType,
          ServerSideEncryption: serverSideEncryption || undefined,
        }),
      );
      return normalizeStorageKey(key);
    },
    async get(key) {
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }),
      );
      return bodyToBuffer(response.Body);
    },
    async delete(key) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }),
      );
    },
  };
}

export function createObjectStorage(environment = process.env, options = {}) {
  const provider =
    environment.FILE_STORAGE_PROVIDER ||
    (environment.EXAM_STORAGE_DIR ? 'filesystem' : 'database');
  if (provider === 'database') return null;
  if (provider === 'filesystem')
    return createFilesystemStorage({ root: environment.EXAM_STORAGE_DIR });
  if (provider === 's3')
    return createS3Storage({
      bucket: environment.OBJECT_STORAGE_BUCKET,
      prefix: environment.OBJECT_STORAGE_PREFIX,
      region: environment.OBJECT_STORAGE_REGION,
      endpoint: environment.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle:
        String(environment.OBJECT_STORAGE_FORCE_PATH_STYLE).toLowerCase() ===
        'true',
      serverSideEncryption: environment.OBJECT_STORAGE_SSE,
      client: options.s3Client,
    });
  throw new Error(`Provedor de armazenamento não permitido: ${provider}.`);
}
