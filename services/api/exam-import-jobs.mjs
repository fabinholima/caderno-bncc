import { pool, transaction } from './db.mjs';
import { extractExamImportQuestions } from './exam-imports.mjs';
import {
  analyzeExamImport,
  EXAM_AI_PROMPT_VERSION,
} from './exam-import-ai.mjs';

export async function enqueueExamImportExtraction({
  institutionId,
  userId,
  examImportId,
}) {
  return enqueueJob({
    institutionId,
    userId,
    examImportId,
    jobType: 'extract',
  });
}

export async function enqueueExamImportAnalysis({
  institutionId,
  userId,
  examImportId,
}) {
  return enqueueJob({
    institutionId,
    userId,
    examImportId,
    jobType: 'ai_analysis',
  });
}

async function enqueueJob({ institutionId, userId, examImportId, jobType }) {
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
         (institution_id,exam_import_id,requested_by,job_type,prompt_version)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (exam_import_id,job_type)
         WHERE status IN ('queued','running')
       DO UPDATE SET updated_at=now()
       RETURNING id,status,stage,progress,created_at`,
      [
        institutionId,
        examImportId,
        userId,
        jobType,
        jobType === 'ai_analysis' ? EXAM_AI_PROMPT_VERSION : null,
      ],
    );
    if (jobType === 'extract')
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
    `UPDATE exam_import_jobs
     SET cancellation_requested=true,
         status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
         stage=CASE WHEN status='queued' THEN 'cancelled' ELSE stage END,
         finished_at=CASE WHEN status='queued' THEN now() ELSE finished_at END,
         updated_at=now()
     WHERE institution_id=$1 AND exam_import_id=$2
       AND job_type='extract'
       AND status IN ('queued','running')
     RETURNING id,status`,
    [institutionId, examImportId],
  );
  return result.rows[0] || null;
}

export async function cancelExamImportAnalysis({
  institutionId,
  examImportId,
}) {
  const result = await pool.query(
    `UPDATE exam_import_jobs SET cancellation_requested=true,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,stage=CASE WHEN status='queued' THEN 'cancelled' ELSE stage END,finished_at=CASE WHEN status='queued' THEN now() ELSE finished_at END,updated_at=now() WHERE institution_id=$1 AND exam_import_id=$2 AND job_type='ai_analysis' AND status IN ('queued','running') RETURNING id,status`,
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
       AND job_type='extract'
       AND status IN ('queued','running')`,
    [institutionId, examImportId],
  );
  return enqueueExamImportExtraction({ institutionId, userId, examImportId });
}

export async function retryExamImportAnalysis({
  institutionId,
  userId,
  examImportId,
}) {
  await pool.query(
    `UPDATE exam_import_jobs SET status='cancelled',finished_at=now(),updated_at=now() WHERE institution_id=$1 AND exam_import_id=$2 AND job_type='ai_analysis' AND status IN ('queued','running')`,
    [institutionId, examImportId],
  );
  return enqueueExamImportAnalysis({ institutionId, userId, examImportId });
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
    const operation =
      job.job_type === 'ai_analysis'
        ? analyzeExamImport
        : extractExamImportQuestions;
    const result = await operation({
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
        JSON.stringify(
          job.job_type === 'ai_analysis'
            ? {
                analyzedQuestions: result.questions.length,
                remainingQuestions: result.remainingQuestions,
                responseId: result.responseId,
              }
            : { detectedQuestions: result.length },
        ),
        JSON.stringify({
          durationMs: Date.now() - started,
          ...(job.job_type === 'ai_analysis' ? result.usage : {}),
        }),
      ],
    );
    if (job.job_type === 'ai_analysis')
      await pool.query(
        'UPDATE exam_import_jobs SET provider=$2,model=$3 WHERE id=$1',
        [job.id, result.provider, result.model],
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
