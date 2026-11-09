// Uso do bucket por pasta (somente leitura): quantidade de objetos e bytes.
// Chamado pelo deploy/atualizar-producao.sh, também no --dry-run:
//   docker compose run --rm --no-deps api node storage-usage.mjs
// Mostra só o domínio final do endpoint, para identificar o provedor sem
// expor a conta.
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { pathToFileURL } from 'node:url';

export function providerLabel(endpoint = '') {
  if (!endpoint) return 'AWS S3';
  try {
    return new URL(endpoint).hostname.split('.').slice(-3).join('.');
  } catch {
    return 'endpoint inválido';
  }
}

/** Pasta de cada chave: o nível abaixo do prefixo da aplicação, ou os dois primeiros níveis. */
export function groupOf(key, prefix = '') {
  const clean = String(prefix).replace(/^\/+|\/+$/g, '');
  const parts = key.split('/');
  if (clean && key.startsWith(`${clean}/`))
    return `${clean}/${parts[clean.split('/').length] ?? ''}`;
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/') || '(raiz)';
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

export async function storageUsage({ client, bucket, prefix = '' }) {
  const groups = new Map();
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const item of page.Contents || []) {
      const group = groupOf(item.Key, prefix);
      const current = groups.get(group) || { objects: 0, bytes: 0 };
      current.objects += 1;
      current.bytes += item.Size || 0;
      groups.set(group, current);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return [...groups.entries()]
    .map(([group, value]) => ({ group, ...value }))
    .sort((a, b) => b.bytes - a.bytes);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const env = process.env;
  if (env.FILE_STORAGE_PROVIDER !== 's3' || !env.OBJECT_STORAGE_BUCKET) {
    console.log(
      `Armazenamento: ${env.FILE_STORAGE_PROVIDER || 'banco de dados'} (sem bucket S3).`,
    );
    process.exit(0);
  }
  const accessKeyId = env.OBJECT_STORAGE_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    env.OBJECT_STORAGE_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;
  const client = new S3Client({
    region: env.OBJECT_STORAGE_REGION || 'us-east-1',
    endpoint: env.OBJECT_STORAGE_ENDPOINT || undefined,
    forcePathStyle:
      String(env.OBJECT_STORAGE_FORCE_PATH_STYLE).toLowerCase() === 'true',
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
  const buckets = [
    ...new Set([env.OBJECT_STORAGE_BUCKET, env.BACKUP_BUCKET].filter(Boolean)),
  ];
  console.log(`Armazenamento: ${providerLabel(env.OBJECT_STORAGE_ENDPOINT)}`);
  for (const [index, bucket] of buckets.entries()) {
    try {
      const rows = await storageUsage({
        client,
        bucket,
        prefix: env.OBJECT_STORAGE_PREFIX,
      });
      const total = rows.reduce(
        (sum, row) => ({
          objects: sum.objects + row.objects,
          bytes: sum.bytes + row.bytes,
        }),
        { objects: 0, bytes: 0 },
      );
      console.log(
        `Bucket ${index ? 'de backups' : 'de arquivos'}: ${formatBytes(total.bytes)} em ${total.objects} objetos`,
      );
      for (const row of rows)
        console.log(
          `  ${row.group}: ${formatBytes(row.bytes)} (${row.objects})`,
        );
    } catch (error) {
      console.log(
        `Bucket ${index ? 'de backups' : 'de arquivos'}: não foi possível listar (${error.name || error.message}).`,
      );
    }
  }
}
