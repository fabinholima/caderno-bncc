import { pool, transaction } from './db.mjs';
import { extractExamImportQuestions } from './exam-imports.mjs';

export async function enqueueExamImportExtraction({
  institutionId,
  userId,
  examImportId,
}) {
  return transaction(async (client) => {
    const source = await client.query(
      `SELECT id FROM exam_imports WHERE id=$1 AND institution_id=$2`,
      [examImportId, institutionId],
    );
    if (!source.rowCount)
      throw Object.assign(new Error('Importação não encontrada.'), {
        statusCode: 404,
      });
    const pending = await client.query(
      `SELECT count(*)::int AS total,sp.concurrent_imports
       FROM institution_subscriptions subscription
       JOIN subscription_plans sp ON sp.id=subscription.plan_id
       LEFT JOIN exam_import_jobs job
         ON job.institution_id=subscription.institution_id
        AND job.status IN ('queued','running')
       WHERE subscription.institution_id=$1
       GROUP BY sp.concurrent_imports`,
      [institutionId],
    );
    const limit = pending.rows[0]?.concurrent_imports || 1;
    if ((pending.rows[0]?.total || 0) >= limit * 10)
      throw Object.assign(
        new Error(
          'A fila de importação do plano está cheia. Tente novamente depois.',
        ),
        { statusCode: 429 },
      );
    const created = await client.query(
      `INSERT INTO exam_import_jobs
         (institution_id,exam_import_id,requested_by)
       VALUES($1,$2,$3)
       ON CONFLICT (exam_import_id,job_type)
         WHERE status IN ('queued','running')
       DO UPDATE SET updated_at=now()
       RETURNING id,status,stage,progress,created_at`,
      [institutionId, examImportId, userId],
    );
    await client.query(
      `UPDATE exam_imports SET status='queued',error_message=NULL,updated_at=now()
       WHERE id=$1`,
      [examImportId],
    );
    return created.rows[0];
  });
}

export async function cancelExamImportJob({ institutionId, examImportId }) {
  const result = await pool.query(
    `UPDATE exam_import_jobs SET cancellation_requested=true,updated_at=now()
     WHERE institution_id=$1 AND exam_import_id=$2
       AND status IN ('queued','running')
     RETURNING id,status`,
    [institutionId, examImportId],
  );
  return result.rows[0] || null;
}

export async function retryExamImportJob({
  institutionId,
  userId,
  examImportId,
}) {
  await pool.query(
    `UPDATE exam_import_jobs SET status='cancelled',finished_at=now(),updated_at=now()
     WHERE institution_id=$1 AND exam_import_id=$2
       AND status IN ('queued','running')`,
    [institutionId, examImportId],
  );
  return enqueueExamImportExtraction({ institutionId, userId, examImportId });
}

export async function claimExamImportJob() {
  return transaction(async (client) => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT job.id
         FROM exam_import_jobs job
         JOIN institution_subscriptions subscription
           ON subscription.institution_id=job.institution_id
         JOIN subscription_plans plan ON plan.id=subscription.plan_id
         WHERE job.status='queued'
           AND job.cancellation_requested=false
           AND (SELECT count(*) FROM exam_import_jobs running
                WHERE running.institution_id=job.institution_id
                  AND running.status='running') < plan.concurrent_imports
         ORDER BY job.created_at
         FOR UPDATE OF job SKIP LOCKED LIMIT 1
       )
       UPDATE exam_import_jobs job
       SET status='running',stage='starting',progress=2,
           attempts=attempts+1,started_at=now(),updated_at=now()
       FROM candidate WHERE job.id=candidate.id
       RETURNING job.*`,
    );
    return result.rows[0] || null;
  });
}

async function updateJob(jobId, values) {
  await pool.query(
    `UPDATE exam_import_jobs
     SET stage=COALESCE($2,stage),progress=COALESCE($3,progress),
         metrics=metrics || $4::jsonb,updated_at=now()
     WHERE id=$1`,
    [
      jobId,
      values.stage || null,
      values.progress ?? null,
      JSON.stringify(values.metrics || {}),
    ],
  );
}

export async function processExamImportJob(job) {
  const started = Date.now();
  try {
    const candidates = await extractExamImportQuestions({
      institutionId: job.institution_id,
      examImportId: job.exam_import_id,
      onProgress: (stage, progress) => updateJob(job.id, { stage, progress }),
      shouldCancel: async () => {
        const state = await pool.query(
          'SELECT cancellation_requested FROM exam_import_jobs WHERE id=$1',
          [job.id],
        );
        return Boolean(state.rows[0]?.cancellation_requested);
      },
    });
    await pool.query(
      `UPDATE exam_import_jobs
       SET status='completed',stage='completed',progress=100,
           result=$2::jsonb,metrics=metrics || $3::jsonb,
           finished_at=now(),updated_at=now() WHERE id=$1`,
      [
        job.id,
        JSON.stringify({ detectedQuestions: candidates.length }),
        JSON.stringify({ durationMs: Date.now() - started }),
      ],
    );
  } catch (error) {
    const cancelled = error?.code === 'IMPORT_CANCELLED';
    await pool.query(
      `UPDATE exam_import_jobs SET status=$2,stage=$2,
         error_message=$3,finished_at=now(),updated_at=now() WHERE id=$1`,
      [job.id, cancelled ? 'cancelled' : 'failed', error.message],
    );
    if (!cancelled) throw error;
  }
}
