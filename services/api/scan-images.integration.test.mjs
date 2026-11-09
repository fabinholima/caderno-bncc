import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Imagens de cartões no armazenamento de objetos, sobre as migrações reais.
const databaseUrl = process.env.SCAN_IMAGES_TEST_DATABASE_URL;
const databaseDir = path.resolve(
  new URL('../../database', import.meta.url).pathname,
);

test(
  'upload, revisão, reprocessamento e migração das imagens usam o storage',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const schema = 'scan_images_' + randomUUID().replaceAll('-', '');
    const control = new pg.Pool({ connectionString: databaseUrl });
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.href;
    const root = await mkdtemp(path.join(tmpdir(), 'scan-images-'));
    process.env.FILE_STORAGE_PROVIDER = 'filesystem';
    process.env.FILE_STORAGE_DIR = root;
    const { pool, transaction } = await import('./db.mjs');
    try {
      await transaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('ufaprova:schema-migrations',0))",
        );
        for (const file of (await readdir(databaseDir))
          .filter((name) => /^\d{3}_.*\.sql$/.test(name))
          .sort())
          await client.query(
            await readFile(path.join(databaseDir, file), 'utf8'),
          );
      });
      const { createScan, getScanImage, retryScan } =
        await import('./scans.mjs');
      const { moveScanImages } = await import('./move-scan-images.mjs');
      const { createObjectStorage } = await import('./object-storage.mjs');
      const one = async (sql, values) =>
        (await pool.query(sql, values)).rows[0];
      const institution = await one(
        "INSERT INTO institutions(name,slug) VALUES('Escola',$1) RETURNING id",
        [schema],
      );
      const user = await one(
        "INSERT INTO users(email,display_name) VALUES($1,'Prof') RETURNING id",
        [`prof-${schema}@test.local`],
      );
      const other = await one(
        "INSERT INTO users(email,display_name) VALUES($1,'Outra') RETURNING id",
        [`outra-${schema}@test.local`],
      );
      const png = Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        Buffer.from('cartao'),
      ]);
      const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
      const scanId = randomUUID();
      const upload = (userId, imageDataUrl = dataUrl) =>
        createScan({
          institutionId: institution.id,
          userId,
          portalAdmin: true,
          input: { clientScanId: scanId, imageDataUrl },
        });

      // O arquivo vai para o storage; o banco guarda só a referência.
      await upload(user.id);
      let row = await one(
        'SELECT image_ref,length(image_data) size FROM card_scans WHERE id=$1',
        [scanId],
      );
      assert.equal(row.size, 0);
      assert.match(
        row.image_ref,
        new RegExp(
          `^filesystem:card-scans/${institution.id}/${scanId}/upload-`,
        ),
      );
      const storage = createObjectStorage();
      const key = row.image_ref.slice('filesystem:'.length);
      assert.deepEqual(await storage.get(key), png);

      // Reenvio idêntico responde de novo; outra pessoa com o mesmo ID recebe
      // 409 e o arquivo original continua lá.
      await upload(user.id);
      await assert.rejects(upload(other.id), { statusCode: 409 });
      assert.deepEqual(await storage.get(key), png);

      // Imagem de revisão no storage: aparece para o professor e permite reprocessar.
      const reviewRef = `filesystem:${await storage.put(`card-scans/${institution.id}/${scanId}/review.png`, png)}`;
      await pool.query(
        "UPDATE card_scans SET status='review',image_ref=NULL,review_image_ref=$2 WHERE id=$1",
        [scanId, reviewRef],
      );
      const image = await getScanImage({
        institutionId: institution.id,
        scanId,
      });
      assert.equal(image.status, 200);
      assert.equal(image.size, png.length);
      await retryScan({
        institutionId: institution.id,
        scanId,
        portalAdmin: true,
      });
      row = await one('SELECT status,image_ref FROM card_scans WHERE id=$1', [
        scanId,
      ]);
      assert.deepEqual(row, { status: 'queued', image_ref: reviewRef });

      // Registros antigos (bytea) migram para o storage.
      const legacy = await one(
        `INSERT INTO card_scans(institution_id,uploaded_by,mime_type,image_data,status,review_image_data)
         VALUES($1,$2,'image/png','\\x','review',$3) RETURNING id`,
        [institution.id, user.id, png],
      );
      assert.equal(await moveScanImages({ storage }), 1);
      row = await one(
        'SELECT review_image_data,review_image_ref FROM card_scans WHERE id=$1',
        [legacy.id],
      );
      assert.equal(row.review_image_data, null);
      assert.equal(
        row.review_image_ref,
        `filesystem:card-scans/${institution.id}/${legacy.id}/review.png`,
      );
      assert.equal(await moveScanImages({ storage }), 0);
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
      await rm(root, { recursive: true, force: true });
    }
  },
);
