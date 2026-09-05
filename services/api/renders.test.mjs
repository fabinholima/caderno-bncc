import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationBatchState, formatRenderJob } from './renders.mjs';

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

test('só libera o lote quando todos os PDFs individuais terminaram', () => {
  assert.deepEqual(applicationBatchState([]), {
    status: 422,
    error: 'A aplicação não possui alunos.',
  });
  assert.equal(
    applicationBatchState([{ status: 'completed' }, { status: 'queued' }])
      .status,
    409,
  );
  assert.equal(
    applicationBatchState([{ status: 'completed' }, { status: 'failed' }])
      .status,
    422,
  );
  assert.deepEqual(
    applicationBatchState([{ status: 'completed' }, { status: 'completed' }]),
    { status: 200 },
  );
});
