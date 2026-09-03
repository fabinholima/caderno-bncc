import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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
