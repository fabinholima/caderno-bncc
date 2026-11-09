// Move as imagens de revisão já gravadas no Postgres (card_scans.review_image_data)
// para o armazenamento de objetos, em lotes. Pode ser interrompido e repetido.
//   docker compose run --rm --no-deps api node move-scan-images.mjs
import { pathToFileURL } from 'node:url';
import { pool } from './db.mjs';
import { createObjectStorage } from './object-storage.mjs';
import { storeScanImage } from './scan-image-storage.mjs';

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

export async function moveScanImages({
  db = pool,
  storage = createObjectStorage(),
  batchSize = 50,
} = {}) {
  if (!storage)
    throw new Error(
      'Configure FILE_STORAGE_PROVIDER (s3 ou filesystem) antes de mover as imagens.',
    );
  let moved = 0;
  for (;;) {
    const batch = await db.query(
      `SELECT id,institution_id,review_image_data FROM card_scans
       WHERE review_image_ref IS NULL AND review_image_data IS NOT NULL
       ORDER BY created_at LIMIT $1`,
      [batchSize],
    );
    if (!batch.rowCount) return moved;
    for (const row of batch.rows) {
      const contents = row.review_image_data;
      const ref = await storeScanImage(
        {
          institutionId: row.institution_id,
          scanId: row.id,
          kind: 'review',
          mimeType: contents.subarray(0, 8).equals(pngSignature)
            ? 'image/png'
            : 'image/jpeg',
          contents,
        },
        { storage },
      );
      await db.query(
        `UPDATE card_scans SET review_image_ref=$2,review_image_data=NULL
         WHERE id=$1 AND review_image_ref IS NULL`,
        [row.id, ref],
      );
      moved += 1;
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const moved = await moveScanImages();
    console.log(`Imagens de cartões movidas para o storage: ${moved}.`);
  } finally {
    await pool.end();
  }
}
