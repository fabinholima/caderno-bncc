import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRenderJob } from './renders.mjs';

const baseRow = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'A',
  created_at: new Date('2026-09-03T00:00:00Z'),
  completed_at: null,
  error_message: null,
};

test('não libera downloads enquanto o PDF está na fila', () => {
  const job = formatRenderJob({ ...baseRow, status: 'queued' });
  assert.equal(job.downloads, null);
  assert.equal(job.status, 'queued');
});

test('libera os dois downloads quando a composição termina', () => {
  const job = formatRenderJob({
    ...baseRow,
    status: 'completed',
    completed_at: new Date('2026-09-03T00:01:00Z'),
  });
  assert.equal(job.downloads.prova, `/api/render-jobs/${baseRow.id}/prova`);
  assert.equal(
    job.downloads.gabarito,
    `/api/render-jobs/${baseRow.id}/gabarito`,
  );
});

test('expõe uma mensagem segura quando a composição falha', () => {
  const job = formatRenderJob({
    ...baseRow,
    status: 'failed',
    error_message: 'ConTeXt excedeu o limite.',
  });
  assert.equal(job.error, 'ConTeXt excedeu o limite.');
  assert.equal(job.downloads, null);
});
