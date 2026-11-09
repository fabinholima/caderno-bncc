// Imagens de cartões no armazenamento de objetos (S3 no VPS, pasta local em
// desenvolvimento). Sem FILE_STORAGE_PROVIDER, tudo continua no Postgres.
// Referência gravada no banco: "provedor:chave", ex. "s3:card-scans/<inst>/<id>/review.png".
import { createObjectStorage } from './object-storage.mjs';

const extensions = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

export function scanImageKey({ institutionId, scanId, kind, mimeType }) {
  return `card-scans/${institutionId}/${scanId}/${kind}.${extensions[mimeType] ?? 'bin'}`;
}

/** Grava a imagem e devolve a referência, ou null quando não há storage configurado. */
export async function storeScanImage(
  { institutionId, scanId, kind, mimeType, contents },
  { environment = process.env, storage } = {},
) {
  const selected = storage ?? createObjectStorage(environment);
  if (!selected) return null;
  const key = await selected.put(
    scanImageKey({ institutionId, scanId, kind, mimeType }),
    contents,
    { contentType: mimeType },
  );
  return `${selected.provider}:${key}`;
}

function parseRef(ref) {
  const separator = String(ref).indexOf(':');
  if (separator < 1) throw new Error('Referência de imagem inválida.');
  return { provider: ref.slice(0, separator), key: ref.slice(separator + 1) };
}

function storageFor(provider, environment, storage) {
  const selected =
    storage ??
    createObjectStorage({ ...environment, FILE_STORAGE_PROVIDER: provider });
  if (!selected) throw new Error('Armazenamento da imagem não configurado.');
  return selected;
}

/** Bytes da imagem: do storage quando há referência, senão da coluna bytea. */
export async function readScanImage(
  ref,
  legacyBytes,
  { environment = process.env, storage } = {},
) {
  if (!ref) return legacyBytes?.length ? legacyBytes : null;
  const { provider, key } = parseRef(ref);
  return storageFor(provider, environment, storage).get(key);
}

export async function deleteScanImage(
  ref,
  { environment = process.env, storage } = {},
) {
  if (!ref) return;
  const { provider, key } = parseRef(ref);
  await storageFor(provider, environment, storage).delete(key);
}
