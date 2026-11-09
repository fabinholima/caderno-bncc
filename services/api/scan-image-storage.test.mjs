import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  deleteScanImage,
  readScanImage,
  scanImageKey,
  storeScanImage,
} from './scan-image-storage.mjs';

test('imagem do cartão vai para o storage e volta pela referência', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'scan-storage-'));
  const environment = {
    FILE_STORAGE_PROVIDER: 'filesystem',
    FILE_STORAGE_DIR: root,
  };
  try {
    const scan = {
      institutionId: 'inst',
      scanId: 'scan',
      kind: 'review',
      mimeType: 'image/png',
    };
    assert.equal(scanImageKey(scan), 'card-scans/inst/scan/review.png');
    const ref = await storeScanImage(
      { ...scan, contents: Buffer.from('png') },
      { environment },
    );
    assert.equal(ref, 'filesystem:card-scans/inst/scan/review.png');
    assert.equal(
      (await readScanImage(ref, null, { environment })).toString(),
      'png',
    );
    await deleteScanImage(ref, { environment });
    await assert.rejects(readScanImage(ref, null, { environment }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sem storage configurado, continua no banco', async () => {
  assert.equal(
    await storeScanImage(
      {
        institutionId: 'i',
        scanId: 's',
        kind: 'upload',
        mimeType: 'image/jpeg',
        contents: Buffer.from('x'),
      },
      { environment: {} },
    ),
    null,
  );
  assert.equal(
    (await readScanImage(null, Buffer.from('bytea'))).toString(),
    'bytea',
  );
  assert.equal(await readScanImage(null, Buffer.alloc(0)), null);
});
