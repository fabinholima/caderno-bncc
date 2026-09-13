import path from 'node:path';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';
import { readRenderArtifact } from './render-artifact-storage.mjs';

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
          provaTex: `/api/render-jobs/${row.id}/prova.tex`,
          gabaritoTex: `/api/render-jobs/${row.id}/gabarito.tex`,
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

export async function getRenderFile({
  institutionId,
  jobId,
  kind,
  format = 'pdf',
}) {
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
  const key =
    format === 'tex'
      ? kind === 'gabarito'
        ? 'answerKeySource'
        : 'studentSource'
      : kind === 'gabarito'
        ? 'answerKeyPdf'
        : 'studentPdf';
  const entry = result.rows[0].output_manifest?.[key];
  try {
    const contents = await readRenderArtifact({ entry, outputRoot });
    return {
      status: 200,
      size: contents.length,
      stream: Readable.from([contents]),
    };
  } catch (error) {
    if (/Manifesto|Provedor/.test(error.message))
      return { status: 500, error: error.message };
    return {
      status: 410,
      error: 'O arquivo foi processado, mas não está mais disponível.',
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

  const batchDirectory = await mkdtemp(path.join(tmpdir(), 'caderno-batch-'));
  try {
    const sources = [];
    for (const [index, job] of jobs.rows.entries()) {
      const contents = await readRenderArtifact({
        entry: job.output_manifest?.studentPdf,
        outputRoot,
      });
      const source = path.join(batchDirectory, `${index + 1}.pdf`);
      await writeFile(source, contents);
      sources.push(source);
    }
    const destination = path.join(
      batchDirectory,
      `${applicationId}-${crypto.randomUUID()}.pdf`,
    );
    await execFileAsync('pdfunite', [...sources, destination], {
      timeout: 120_000,
      maxBuffer: 1_000_000,
    });
    const contents = await readFile(destination);
    return {
      status: 200,
      size: contents.length,
      stream: Readable.from([contents]),
    };
  } catch (error) {
    if (/Manifesto|Provedor/.test(error.message))
      return { status: 500, error: error.message };
    return {
      status: 500,
      error: `Não foi possível montar o PDF em lote: ${String(error.message).slice(0, 300)}`,
    };
  } finally {
    await rm(batchDirectory, { recursive: true, force: true });
  }
}
