import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  groupOf,
  providerLabel,
  storageUsage,
} from './storage-usage.mjs';

test('uso do bucket: agrupa por pasta e soma todas as páginas', async () => {
  const pages = [
    {
      Contents: [
        { Key: 'caderno/card-scans/i1/s1/review.png', Size: 1000 },
        { Key: 'caderno/essay-images/i1/abc.png', Size: 500 },
      ],
      IsTruncated: true,
      NextContinuationToken: 'p2',
    },
    {
      Contents: [
        { Key: 'caderno/card-scans/i1/s2/review.png', Size: 3000 },
        { Key: 'backups/postgres/ufaprova-1.dump.age', Size: 10 },
      ],
      IsTruncated: false,
    },
  ];
  const tokens = [];
  const client = {
    send: async (command) => {
      tokens.push(command.input.ContinuationToken);
      return pages.shift();
    },
  };
  const rows = await storageUsage({ client, bucket: 'b', prefix: 'caderno' });
  assert.deepEqual(tokens, [undefined, 'p2']);
  assert.deepEqual(rows, [
    { group: 'caderno/card-scans', objects: 2, bytes: 4000 },
    { group: 'caderno/essay-images', objects: 1, bytes: 500 },
    { group: 'backups/postgres', objects: 1, bytes: 10 },
  ]);
});

test('uso do bucket: rótulo do provedor sem a conta e tamanhos legíveis', () => {
  assert.equal(
    providerLabel('https://abc123.r2.cloudflarestorage.com'),
    'r2.cloudflarestorage.com',
  );
  assert.equal(providerLabel(''), 'AWS S3');
  assert.equal(groupOf('solto.txt'), '(raiz)');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(12), '12 B');
});
