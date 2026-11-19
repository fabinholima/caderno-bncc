import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADAPTED_RENDERER,
  ADAPTED_TEMPLATE,
  ensureAdaptedExamVersion,
} from './adapted-exam.mjs';

const baseSnapshot = {
  schemaVersion: '1.0',
  questions: [],
  version: { id: 'base-v', code: 'A' },
};

// Cliente falso: responde às consultas usadas por ensureAdaptedExamVersion.
function fakeClient({
  existingVersion = null,
  existingJob = null,
  base = true,
} = {}) {
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.startsWith('SELECT id FROM assessment_versions'))
        return {
          rowCount: existingVersion ? 1 : 0,
          rows: existingVersion ? [{ id: existingVersion }] : [],
        };
      if (text.includes('FROM render_jobs') && text.includes('renderer=$2'))
        return {
          rowCount: existingJob ? 1 : 0,
          rows: existingJob ? [existingJob] : [],
        };
      if (text.startsWith('SELECT id,seed,snapshot'))
        return {
          rowCount: base ? 1 : 0,
          rows: base ? [{ id: 'base-v', seed: 9, snapshot: baseSnapshot }] : [],
        };
      if (text.startsWith('INSERT INTO assessment_versions'))
        return { rowCount: 1, rows: [] };
      if (text.startsWith('INSERT INTO render_jobs'))
        return { rowCount: 1, rows: [{ id: 'job-new' }] };
      if (text.startsWith('UPDATE render_jobs'))
        return { rowCount: 1, rows: [] };
      throw new Error(`Consulta inesperada: ${text}`);
    },
  };
}

test('cria a versão ADAPTADA com o snapshot da base e um job ia-adaptada sem aluno', async () => {
  const client = fakeClient();
  const result = await ensureAdaptedExamVersion(client, 'a1');
  assert.equal(result.status, 'queued');
  assert.equal(result.renderJobId, 'job-new');
  const version = client.calls.find((call) =>
    call.text.startsWith('INSERT INTO assessment_versions'),
  );
  assert.equal(version.values[2], 'ADAPTADA');
  assert.equal(version.values[3], 9);
  const job = client.calls.find((call) =>
    call.text.startsWith('INSERT INTO render_jobs'),
  );
  assert.doesNotMatch(job.text, /application_student_id/);
  assert.deepEqual(job.values, [
    result.versionId,
    ADAPTED_TEMPLATE,
    ADAPTED_RENDERER,
  ]);
});

test('reaproveita um job concluído sem gerar de novo', async () => {
  const client = fakeClient({
    existingVersion: 'adapt-v',
    existingJob: { id: 'job-old', status: 'completed' },
  });
  const result = await ensureAdaptedExamVersion(client, 'a1');
  assert.deepEqual(result, {
    status: 'completed',
    versionId: 'adapt-v',
    renderJobId: 'job-old',
  });
  assert.equal(
    client.calls.some((call) => call.text.startsWith('INSERT')),
    false,
  );
});

test('reabre um job que falhou, sem criar outra versão', async () => {
  const client = fakeClient({
    existingVersion: 'adapt-v',
    existingJob: { id: 'job-old', status: 'failed' },
  });
  const result = await ensureAdaptedExamVersion(client, 'a1');
  assert.deepEqual(result, {
    status: 'queued',
    versionId: 'adapt-v',
    renderJobId: 'job-old',
  });
  const reopen = client.calls.find((call) =>
    call.text.startsWith('UPDATE render_jobs'),
  );
  assert.match(reopen.text, /status='queued'/);
  assert.equal(
    client.calls.some((call) => call.text.startsWith('INSERT')),
    false,
  );
});

test('sem versão base, informa indisponibilidade em vez de falhar', async () => {
  const result = await ensureAdaptedExamVersion(
    fakeClient({ base: false }),
    'a1',
  );
  assert.equal(result.status, 'unavailable');
});
