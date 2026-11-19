import { pool } from './db.mjs';
import { ensureAdaptedExamVersion } from './adapted-exam.mjs';
import { agendarProvaAdaptada } from './adapted-exam-job.mjs';

/**
 * Botão "Gerar prova adaptada" da prova: exige a prova da instituição e ao menos um
 * aluno ativo marcado com laudo. Não cria aplicação nem cartão.
 */
export async function solicitarProvaAdaptada({ institutionId, assessmentId }) {
  const prova = await pool.query(
    'SELECT id FROM assessments WHERE id=$1 AND institution_id=$2',
    [assessmentId, institutionId],
  );
  if (!prova.rowCount)
    throw Object.assign(new Error('Prova não encontrada.'), {
      statusCode: 404,
    });

  const laudo = await pool.query(
    'SELECT 1 FROM students WHERE institution_id=$1 AND active AND adapted_exam LIMIT 1',
    [institutionId],
  );
  if (!laudo.rowCount)
    throw Object.assign(
      new Error('Marque um aluno com laudo para gerar a prova adaptada.'),
      { statusCode: 422 },
    );

  const garantida = await ensureAdaptedExamVersion(pool, assessmentId);
  if (garantida.status === 'unavailable')
    throw Object.assign(new Error(garantida.reason), { statusCode: 422 });
  if (garantida.status === 'queued')
    agendarProvaAdaptada(garantida.renderJobId);
  return {
    status: garantida.status,
    versionId: garantida.versionId,
    renderJobId: garantida.renderJobId,
  };
}
