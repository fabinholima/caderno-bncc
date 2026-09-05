import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const outputRoot = path.resolve(
  projectRoot,
  process.env.RENDER_OUTPUT_DIR || 'outputs/renders',
);
const execFileAsync = promisify(execFile);

export function formatRenderJob(row) {
  const completed = row.status === 'completed';
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    error: row.status === 'failed' ? row.error_message : null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    downloads: completed
      ? {
          prova: `/api/render-jobs/${row.id}/prova`,
          gabarito: `/api/render-jobs/${row.id}/gabarito`,
        }
      : null,
  };
}

export async function getRenderJobStatus({ institutionId, jobId }) {
  const result = await pool.query({
    text: `SELECT rj.id, rj.status, rj.error_message, rj.created_at,
                  rj.completed_at, av.code
           FROM render_jobs rj
           JOIN assessment_versions av ON av.id = rj.assessment_version_id
           JOIN assessments a ON a.id = av.assessment_id
           WHERE rj.id = $1 AND a.institution_id = $2`,
    values: [jobId, institutionId],
  });
  if (!result.rowCount) return null;
  return formatRenderJob(result.rows[0]);
}

export async function getRenderFile({ institutionId, jobId, kind }) {
  const result = await pool.query({
    text: `SELECT rj.status, rj.output_manifest
           FROM render_jobs rj
           JOIN assessment_versions av ON av.id = rj.assessment_version_id
           JOIN assessments a ON a.id = av.assessment_id
           WHERE rj.id = $1 AND a.institution_id = $2`,
    values: [jobId, institutionId],
  });
  if (!result.rowCount)
    return { status: 404, error: 'Arquivo não encontrado.' };
  if (result.rows[0].status === 'failed')
    return { status: 422, error: 'A composição do PDF falhou.' };
  if (result.rows[0].status !== 'completed')
    return { status: 409, error: 'O PDF ainda está sendo composto.' };
  const key = kind === 'gabarito' ? 'answerKeyPdf' : 'studentPdf';
  const relative = result.rows[0].output_manifest?.[key];
  const file = path.resolve(outputRoot, relative || '');
  if (!relative || !file.startsWith(`${outputRoot}${path.sep}`))
    return { status: 500, error: 'Manifesto de saída inválido.' };
  try {
    const metadata = await stat(file);
    return {
      status: 200,
      file,
      size: metadata.size,
      stream: createReadStream(file),
    };
  } catch {
    return {
      status: 410,
      error: 'O PDF foi processado, mas não está mais disponível.',
    };
  }
}

export function applicationBatchState(rows) {
  if (!rows.length)
    return { status: 422, error: 'A aplicação não possui alunos.' };
  const failed = rows.filter((row) => row.status === 'failed').length;
  if (failed)
    return {
      status: 422,
      error: `${failed} PDF(s) individual(is) falharam na composição.`,
    };
  const pending = rows.filter((row) => row.status !== 'completed').length;
  if (pending)
    return {
      status: 409,
      error: `${pending} PDF(s) individual(is) ainda estão sendo compostos.`,
    };
  return { status: 200 };
}

export async function getApplicationBatchFile({
  institutionId,
  applicationId,
}) {
  const application = await pool.query({
    text: `SELECT aa.id,aa.status
           FROM assessment_applications aa
           WHERE aa.id = $1 AND aa.institution_id = $2`,
    values: [applicationId, institutionId],
  });
  if (!application.rowCount)
    return { status: 404, error: 'Aplicação não encontrada.' };
  if (application.rows[0].status === 'cancelled')
    return { status: 409, error: 'A aplicação foi cancelada.' };

  const jobs = await pool.query({
    text: `SELECT rj.status, rj.output_manifest
           FROM application_students aps
           JOIN students s ON s.id = aps.student_id
           LEFT JOIN class_enrollments ce
             ON ce.student_id = s.id
            AND ce.class_id = (
              SELECT class_id FROM assessment_applications WHERE id = aps.application_id
            )
           LEFT JOIN render_jobs rj ON rj.application_student_id = aps.id
           WHERE aps.application_id = $1
           ORDER BY ce.number NULLS LAST, s.name, aps.id`,
    values: [applicationId],
  });
  const state = applicationBatchState(jobs.rows);
  if (state.error) return state;

  const sources = [];
  for (const job of jobs.rows) {
    const relative = job.output_manifest?.studentPdf;
    const file = path.resolve(outputRoot, relative || '');
    if (!relative || !file.startsWith(`${outputRoot}${path.sep}`))
      return { status: 500, error: 'Manifesto de saída inválido.' };
    try {
      await stat(file);
      sources.push(file);
    } catch {
      return {
        status: 410,
        error: 'Um PDF individual não está mais disponível.',
      };
    }
  }

  const batchDirectory = path.join(outputRoot, 'batches');
  const destination = path.join(batchDirectory, `${applicationId}.pdf`);
  const temporary = path.join(
    batchDirectory,
    `${applicationId}-${crypto.randomUUID()}.tmp.pdf`,
  );
  await mkdir(batchDirectory, { recursive: true });
  try {
    await execFileAsync('pdfunite', [...sources, temporary], {
      timeout: 120_000,
      maxBuffer: 1_000_000,
    });
    await rename(temporary, destination);
    const metadata = await stat(destination);
    return {
      status: 200,
      file: destination,
      size: metadata.size,
      stream: createReadStream(destination),
    };
  } catch (error) {
    return {
      status: 500,
      error: `Não foi possível montar o PDF em lote: ${String(error.message).slice(0, 300)}`,
    };
  }
}
