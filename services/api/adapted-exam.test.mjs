import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADAPTED_VERSION_CODE,
  ensureAdaptedExamVersion,
} from './adapted-exam.mjs';

const question = (number) => ({
  id: `q${number}`,
  number,
  type: 'single_choice',
  difficulty: 'easy',
  statement: [{ type: 'paragraph', text: `Questão ${number}` }],
  alternatives: ['alt-a', 'alt-b', 'alt-c', 'alt-d', 'alt-e'].map(
    (stableKey, i) => ({
      stableKey,
      label: 'ABCDE'[i],
      content: [{ type: 'paragraph', text: stableKey }],
    }),
  ),
  answer: { correctStableKeys: ['alt-c'] },
  points: 1,
  skills: [],
});

const baseSnapshot = {
  schemaVersion: '1.0',
  assessment: {
    id: 'a1',
    title: 'Prova',
    subject: 'Matemática',
    grade: '7º',
    instructions: ['Leia.'],
  },
  institution: { id: 'i1', name: 'Escola' },
  version: {
    id: 'base-v',
    code: 'A',
    seed: 9,
    generatedAt: '2026-01-01T00:00:00Z',
  },
  candidateFields: ['name'],
  questions: [question(1), question(2)],
  totals: { points: 2, questions: 2 },
  render: {
    locale: 'pt-BR',
    paper: 'A4',
    mode: 'student',
    template: 'basicexam-v1',
    font: 'plex',
    fontSize: 11,
  },
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
      if (
        text.includes('code=$2') &&
        text.startsWith('SELECT id FROM assessment_versions')
      )
        return {
          rowCount: existingVersion ? 1 : 0,
          rows: existingVersion ? [{ id: existingVersion }] : [],
        };
      if (
        text.includes('FROM render_jobs') &&
        text.includes('application_student_id IS NULL')
      )
        return {
          rowCount: existingJob ? 1 : 0,
          rows: existingJob ? [{ id: existingJob, status: 'queued' }] : [],
        };
      if (
        text.includes('code<>$2') &&
        text.startsWith('SELECT id,seed,snapshot')
      )
        return {
          rowCount: base ? 1 : 0,
          rows: base ? [{ id: 'base-v', seed: 9, snapshot: baseSnapshot }] : [],
        };
      if (text.startsWith('INSERT INTO assessment_versions'))
        return { rowCount: 1, rows: [] };
      if (text.startsWith('INSERT INTO render_jobs'))
        return { rowCount: 1, rows: [{ id: 'job-new' }] };
      throw new Error(`Consulta inesperada: ${text}`);
    },
  };
}

test('cria a versão ADAPTADA com snapshot próprio, sem reutilizar o id nem o QR da base', async () => {
  const client = fakeClient();
  const result = await ensureAdaptedExamVersion(client, 'a1');
  assert.equal(result.status, 'queued');
  assert.equal(result.renderJobId, 'job-new');
  const insert = client.calls.find((call) =>
    call.text.startsWith('INSERT INTO assessment_versions'),
  );
  const [id, , code, seed, snapshotJson, answerKeyJson] = insert.values;
  assert.equal(code, ADAPTED_VERSION_CODE);
  assert.equal(seed, 9);
  const snapshot = JSON.parse(snapshotJson);
  assert.equal(snapshot.version.id, id);
  assert.notEqual(id, 'base-v');
  assert.equal(snapshot.version.code, ADAPTED_VERSION_CODE);
  assert.deepEqual(
    snapshot.questions.map((q) => q.alternatives.length),
    [3, 3],
  );
  assert.equal(JSON.parse(answerKeyJson).length, 2);
});

test('o render job da versão adaptada não tem aluno vinculado', async () => {
  const client = fakeClient();
  await ensureAdaptedExamVersion(client, 'a1');
  const job = client.calls.find((call) =>
    call.text.startsWith('INSERT INTO render_jobs'),
  );
  assert.doesNotMatch(job.text, /application_student_id/);
  assert.equal(job.values[1], 'basicexam-v1');
});

test('reaproveita a versão e o job já existentes', async () => {
  const client = fakeClient({
    existingVersion: 'adapt-v',
    existingJob: 'job-old',
  });
  const result = await ensureAdaptedExamVersion(client, 'a1');
  assert.deepEqual(result, {
    status: 'queued',
    versionId: 'adapt-v',
    renderJobId: 'job-old',
  });
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
