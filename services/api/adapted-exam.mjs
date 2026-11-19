import crypto from 'node:crypto';
import { adaptarProva } from '../../lib/prova-adaptada.mjs';

// Código reservado da versão adaptada. Ela não entra no sorteio das versões
// comuns nem recebe cartão-resposta: é impressa à parte para alunos com laudo.
export const ADAPTED_VERSION_CODE = 'ADAPTADA';

/**
 * Garante a versão adaptada da avaliação e o render job sem aluno vinculado.
 * Reutiliza o que já existe; não cria cartão nem QR individual.
 * @returns {Promise<{status: 'queued'|'unavailable', versionId?: string, renderJobId?: string, reason?: string, questions?: number}>}
 */
export async function ensureAdaptedExamVersion(client, assessmentId) {
  const existing = await client.query(
    'SELECT id FROM assessment_versions WHERE assessment_id=$1 AND code=$2',
    [assessmentId, ADAPTED_VERSION_CODE],
  );
  if (existing.rowCount) {
    const job = await client.query(
      `SELECT id,status FROM render_jobs
       WHERE assessment_version_id=$1 AND application_student_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [existing.rows[0].id],
    );
    if (job.rowCount)
      return {
        status: 'queued',
        versionId: existing.rows[0].id,
        renderJobId: job.rows[0].id,
      };
  }

  const base = await client.query(
    `SELECT id,seed,snapshot FROM assessment_versions
     WHERE assessment_id=$1 AND code<>$2
     ORDER BY code LIMIT 1`,
    [assessmentId, ADAPTED_VERSION_CODE],
  );
  if (!base.rowCount)
    return {
      status: 'unavailable',
      reason: 'A avaliação não possui versão base.',
    };

  const versionId = existing.rowCount
    ? existing.rows[0].id
    : crypto.randomUUID();
  const { snapshot: adaptada, relatorio } = adaptarProva(
    base.rows[0].snapshot,
    {
      seed: base.rows[0].seed,
    },
  );
  if (!adaptada.questions.length)
    return {
      status: 'unavailable',
      reason: 'Nenhuma questão atende ao perfil simples da prova adaptada.',
    };

  // O snapshot carrega id e código próprios: o QR da versão base não pode
  // apontar para a versão adaptada, nem o contrário.
  const snapshot = {
    ...adaptada,
    version: { ...adaptada.version, id: versionId, code: ADAPTED_VERSION_CODE },
  };
  const answerKey = snapshot.questions.map((question) => ({
    number: question.number,
    type: question.type,
    correctStableKeys: question.answer.correctStableKeys,
    manualReview: question.type === 'essay',
  }));

  if (!existing.rowCount)
    await client.query(
      `INSERT INTO assessment_versions (id, assessment_id, code, seed, snapshot, answer_key)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [
        versionId,
        assessmentId,
        ADAPTED_VERSION_CODE,
        base.rows[0].seed,
        JSON.stringify(snapshot),
        JSON.stringify(answerKey),
      ],
    );
  const job = await client.query(
    `INSERT INTO render_jobs (assessment_version_id, template_version)
     VALUES ($1, $2) RETURNING id`,
    [versionId, snapshot.render.template],
  );
  return {
    status: 'queued',
    versionId,
    renderJobId: job.rows[0].id,
    questions: relatorio.questoesMantidas,
  };
}
