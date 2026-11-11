// Processamento da fila de redações (essay_jobs): transcrição (OCR) e
// sugestão de correção pela IA. Roda no worker (essay-worker.mjs).
// - Posse com prazo (locked_until): job de worker que caiu volta à fila.
// - Novas tentativas com espera crescente; cota do provedor respeita retry-after.
// - Transcrição com baixa confiança não segue para a IA: o professor revisa antes.
import { pool, transaction } from './db.mjs';
import {
  deleteEssayFile,
  enqueueEssayJob,
  readEssayFile,
} from './essay-correction.mjs';
import {
  ESSAY_PROMPT_VERSION,
  suggestEssayGrading,
  transcribeEssay,
} from './essay-ai.mjs';

const LEASE_MINUTES = 10;

export async function claimEssayJob(db = pool) {
  const result = await db.query(
    `WITH next AS (
       SELECT id FROM essay_jobs
        WHERE (status='queued' AND next_attempt_at<=now())
           OR (status='running' AND locked_until<now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1)
     UPDATE essay_jobs job SET status='running',attempts=job.attempts+1,
            locked_until=now()+interval '${LEASE_MINUTES} minutes',started_at=now()
       FROM next WHERE job.id=next.id
     RETURNING job.*`,
  );
  return result.rows[0] || null;
}

async function loadContext(db, job) {
  const result = await db.query(
    `SELECT sub.*,eas.id AS entry_id,eas.status AS entry_status,ea.rubric_snapshot,ea.prompt_snapshot,ea.ai_assist
       FROM essay_submissions sub
       JOIN essay_application_students eas ON eas.id=sub.application_student_id
       JOIN essay_applications ea ON ea.id=eas.application_id
      WHERE sub.id=$1`,
    [job.submission_id],
  );
  return result.rows[0] || null;
}

async function complete(client, job, usage) {
  await client.query(
    `UPDATE essay_jobs SET status='completed',finished_at=now(),locked_until=NULL,error_message='',usage=$2::jsonb
      WHERE id=$1`,
    [job.id, JSON.stringify(usage || {})],
  );
  await client.query(
    `INSERT INTO usage_events(institution_id,user_id,kind,quantity,metadata)
     VALUES($1,$2,'ai',1,$3::jsonb)`,
    [
      job.institution_id,
      job.requested_by,
      JSON.stringify({ essayJobId: job.id, kind: job.kind, ...usage }),
    ],
  );
}

/** Situação da produção só avança se ninguém mexeu nela enquanto o job rodava. */
async function advanceEntry(client, entryId, from, to) {
  await client.query(
    `UPDATE essay_application_students SET status=$3,updated_at=now() WHERE id=$1 AND status=ANY($2::text[])`,
    [entryId, from, to],
  );
}

async function processOcr(job, context, options) {
  const files = await pool.query(
    'SELECT mime_type,storage_ref FROM essay_submission_files WHERE submission_id=$1 ORDER BY position',
    [job.submission_id],
  );
  if (!files.rowCount)
    throw Object.assign(
      new Error('A produção não tem páginas para transcrever.'),
      {
        permanent: true,
      },
    );
  const pages = [];
  for (const row of files.rows)
    pages.push({
      mimeType: row.mime_type,
      contents: await readEssayFile(row.storage_ref),
    });
  const minConfidence = Number(process.env.ESSAY_OCR_MIN_CONFIDENCE || 0.85);
  const result = await transcribeEssay({
    files: pages,
    minConfidence,
    ...options,
  });
  const { transcription } = result;
  await transaction(async (client) => {
    const version = await client.query(
      'SELECT COALESCE(max(version),0)+1 AS v FROM essay_transcriptions WHERE submission_id=$1',
      [job.submission_id],
    );
    await client.query(
      `INSERT INTO essay_transcriptions (submission_id,version,source,provider,model,text,lines,confidence,needs_review,warnings)
       VALUES ($1,$2,'ai',$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)`,
      [
        job.submission_id,
        version.rows[0].v,
        result.provider,
        result.model,
        transcription.text,
        JSON.stringify(transcription.lines),
        transcription.confidence,
        transcription.needsReview,
        JSON.stringify(transcription.warnings),
      ],
    );
    await complete(client, job, result.usage);
    // Confiança alta e IA ligada: segue para a sugestão; senão, professor revisa.
    if (!transcription.needsReview && context.ai_assist) {
      await enqueueEssayJob(client, {
        institutionId: job.institution_id,
        submissionId: job.submission_id,
        kind: 'ai_grading',
        input: {
          text: transcription.text,
          rubric: context.rubric_snapshot?.id,
          prompt: ESSAY_PROMPT_VERSION,
        },
        userId: job.requested_by,
      });
      await advanceEntry(
        client,
        context.entry_id,
        ['awaiting_ocr', 'submitted'],
        'awaiting_ai',
      );
    } else
      await advanceEntry(
        client,
        context.entry_id,
        ['awaiting_ocr', 'submitted'],
        'awaiting_grading',
      );
  });
}

async function processAiGrading(job, context, options) {
  let text = context.typed_text;
  let transcription = null;
  if (context.mode !== 'typed') {
    const latest = await pool.query(
      'SELECT * FROM essay_transcriptions WHERE submission_id=$1 ORDER BY version DESC LIMIT 1',
      [job.submission_id],
    );
    transcription = latest.rows[0] || null;
    if (!transcription?.text?.trim())
      throw Object.assign(new Error('Não há transcrição para a IA avaliar.'), {
        permanent: true,
      });
    if (transcription.needs_review)
      throw Object.assign(
        new Error(
          'A transcrição tem baixa confiança; o professor precisa revisá-la antes.',
        ),
        { permanent: true },
      );
    text = transcription.text;
  }
  const result = await suggestEssayGrading({
    rubric: context.rubric_snapshot,
    prompt: context.prompt_snapshot,
    essayText: text,
    fromTranscription: Boolean(transcription),
    ...options,
  });
  const { grading } = result;
  await transaction(async (client) => {
    await client.query(
      `UPDATE essay_gradings SET status='superseded',updated_at=now()
        WHERE submission_id=$1 AND kind='ai' AND status='final'`,
      [job.submission_id],
    );
    await client.query(
      `INSERT INTO essay_gradings (institution_id,submission_id,kind,status,scores,total,max_score,comments,strengths,
              improvements,rewrite_suggestions,transcription_id,provider,model,prompt_version,warnings,created_by)
       VALUES ($1,$2,'ai','final',$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`,
      [
        job.institution_id,
        job.submission_id,
        JSON.stringify(grading.scores),
        grading.total,
        context.rubric_snapshot.maxScore,
        grading.comments,
        grading.strengths,
        grading.improvements,
        grading.rewriteSuggestions,
        transcription?.id ?? null,
        result.provider,
        result.model,
        ESSAY_PROMPT_VERSION,
        JSON.stringify(grading.warnings),
        job.requested_by,
      ],
    );
    await complete(client, job, result.usage);
    await advanceEntry(
      client,
      context.entry_id,
      ['awaiting_ai', 'submitted', 'awaiting_ocr'],
      'awaiting_grading',
    );
  });
}

async function failJob(job, context, error) {
  const quota = error.code === 'AI_QUOTA_EXHAUSTED';
  const finalAttempt =
    error.permanent || (!quota && job.attempts >= job.max_attempts);
  const delaySeconds = quota
    ? error.retryAfterSeconds || 900
    : Math.min(3600, 60 * 2 ** Math.max(0, job.attempts - 1));
  await transaction(async (client) => {
    await client.query(
      `UPDATE essay_jobs SET status=$2,error_message=$3,locked_until=NULL,
              next_attempt_at=now()+make_interval(secs => $4),
              finished_at=CASE WHEN $2='failed' THEN now() END,
              attempts=CASE WHEN $5 THEN attempts-1 ELSE attempts END
        WHERE id=$1`,
      [
        job.id,
        finalAttempt ? 'failed' : 'queued',
        String(error.message || 'Falha no processamento.').slice(0, 500),
        delaySeconds,
        quota,
      ],
    );
    // Falha definitiva não trava a produção: o professor corrige manualmente.
    if (finalAttempt && context)
      await advanceEntry(
        client,
        context.entry_id,
        ['awaiting_ocr', 'awaiting_ai', 'submitted'],
        'awaiting_grading',
      );
  });
}

export async function processEssayJob(job, options = {}) {
  const context = await loadContext(pool, job);
  try {
    if (!context || context.status !== 'submitted')
      throw Object.assign(
        new Error('A produção não está mais disponível para processamento.'),
        {
          permanent: true,
        },
      );
    if (job.kind === 'ocr') await processOcr(job, context, options);
    else await processAiGrading(job, context, options);
  } catch (error) {
    await failJob(job, context, error);
    throw error;
  }
}

/**
 * Retenção (LGPD): com ESSAY_FILE_RETENTION_DAYS > 0, apaga do armazenamento
 * as fotos/PDFs originais de produções publicadas há mais de N dias. Texto
 * digitado, transcrição, notas e histórico continuam no banco. Desligado por
 * padrão; o worker roda no máximo uma vez por hora.
 */
export async function purgeExpiredEssayFiles(days, { limit = 200 } = {}) {
  if (!(days > 0)) return 0;
  const expired = await pool.query(
    `SELECT f.id,f.storage_ref,eas.id AS entry_id,eas.application_id,ea.institution_id
       FROM essay_submission_files f
       JOIN essay_submissions sub ON sub.id=f.submission_id
       JOIN essay_application_students eas ON eas.id=sub.application_student_id
       JOIN essay_applications ea ON ea.id=eas.application_id
      WHERE eas.status='published' AND eas.published_at < now() - make_interval(days => $1)
      ORDER BY eas.published_at LIMIT $2`,
    [days, limit],
  );
  for (const row of expired.rows) {
    await deleteEssayFile(row.storage_ref);
    await pool.query('DELETE FROM essay_submission_files WHERE id=$1', [
      row.id,
    ]);
    await pool.query(
      `INSERT INTO audit_log (institution_id,action,entity_type,entity_id,metadata)
       VALUES ($1,'essay.file.retention','essay_entry',$2,$3::jsonb)`,
      [
        row.institution_id,
        row.entry_id,
        JSON.stringify({ fileId: row.id, days }),
      ],
    );
  }
  return expired.rowCount;
}
