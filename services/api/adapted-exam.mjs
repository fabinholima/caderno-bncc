import crypto from 'node:crypto';

// Código reservado da versão adaptada. Ela não entra no sorteio das versões
// comuns nem recebe cartão-resposta: é gerada pela IA e impressa à parte para
// alunos com laudo.
export const ADAPTED_VERSION_CODE = 'ADAPTADA';
export const ADAPTED_RENDERER = 'ia-adaptada';
export const ADAPTED_TEMPLATE = 'ia-adaptada-v1';

/**
 * Garante a versão ADAPTADA e o render job `ia-adaptada` da avaliação, dentro da
 * transação da aplicação. A geração pela IA roda depois do commit
 * (ver adapted-exam-job.mjs). Não cria cartão nem QR individual.
 * @returns {Promise<{status: 'queued'|'completed'|'unavailable', versionId?: string, renderJobId?: string, reason?: string}>}
 */
export async function ensureAdaptedExamVersion(client, assessmentId) {
  const existing = await client.query(
    'SELECT id FROM assessment_versions WHERE assessment_id=$1 AND code=$2',
    [assessmentId, ADAPTED_VERSION_CODE],
  );
  if (existing.rowCount) {
    const job = await client.query(
      `SELECT id,status FROM render_jobs
       WHERE assessment_version_id=$1 AND renderer=$2 AND application_student_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [existing.rows[0].id, ADAPTED_RENDERER],
    );
    if (job.rowCount) {
      const { id, status } = job.rows[0];
      if (status === 'failed') {
        await client.query(
          `UPDATE render_jobs SET status='queued', error_message=NULL, completed_at=NULL WHERE id=$1`,
          [id],
        );
        return {
          status: 'queued',
          versionId: existing.rows[0].id,
          renderJobId: id,
        };
      }
      return {
        status: status === 'completed' ? 'completed' : 'queued',
        versionId: existing.rows[0].id,
        renderJobId: id,
      };
    }
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

  // A versão nasce com o snapshot da base; a geração pela IA o substitui.
  const versionId = existing.rowCount
    ? existing.rows[0].id
    : crypto.randomUUID();
  if (!existing.rowCount)
    await client.query(
      `INSERT INTO assessment_versions (id, assessment_id, code, seed, snapshot, answer_key)
       VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb)`,
      [
        versionId,
        assessmentId,
        ADAPTED_VERSION_CODE,
        base.rows[0].seed,
        JSON.stringify(base.rows[0].snapshot),
      ],
    );
  const job = await client.query(
    `INSERT INTO render_jobs (assessment_version_id, template_version, renderer)
     VALUES ($1, $2, $3) RETURNING id`,
    [versionId, ADAPTED_TEMPLATE, ADAPTED_RENDERER],
  );
  return { status: 'queued', versionId, renderJobId: job.rows[0].id };
}
