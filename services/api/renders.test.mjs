import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import {
  applicationBatchState,
  formatRenderJob,
  streamApplicationBatchFile,
} from './renders.mjs';

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
  assert.equal(
    job.downloads.provaTex,
    `/api/render-jobs/${baseRow.id}/prova.tex`,
  );
  assert.equal(
    job.downloads.gabaritoTex,
    `/api/render-jobs/${baseRow.id}/gabarito.tex`,
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

test('transmite o PDF do lote e limpa os arquivos temporários após o envio', async (t) => {
  let cleaned = false;
  const server = createServer((request, response) => {
    void streamApplicationBatchFile(
      response,
      {
        size: 3,
        stream: Readable.from([Buffer.from('pdf')]),
        cleanup: async () => {
          cleaned = true;
        },
      },
      'cartoes.pdf',
      () => ({}),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}`);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="cartoes.pdf"',
  );
  assert.equal(await response.text(), 'pdf');
  assert.equal(cleaned, true);
});
