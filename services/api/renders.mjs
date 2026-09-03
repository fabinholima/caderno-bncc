import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pool } from './db.mjs';

const outputRoot = path.resolve(process.env.RENDER_OUTPUT_DIR || 'outputs/renders');

export async function getRenderFile({ institutionId, jobId, kind }) {
  const result = await pool.query({
    text: `SELECT rj.status, rj.output_manifest
           FROM render_jobs rj
           JOIN assessment_versions av ON av.id = rj.assessment_version_id
           JOIN assessments a ON a.id = av.assessment_id
           WHERE rj.id = $1 AND a.institution_id = $2`,
    values: [jobId, institutionId],
  });
  if (!result.rowCount) return { status: 404, error: 'Arquivo não encontrado.' };
  if (result.rows[0].status !== 'completed') return { status: 409, error: 'O PDF ainda está sendo composto.' };
  const key = kind === 'gabarito' ? 'answerKeyPdf' : 'studentPdf';
  const relative = result.rows[0].output_manifest?.[key];
  const file = path.resolve(outputRoot, relative || '');
  if (!relative || !file.startsWith(`${outputRoot}${path.sep}`)) return { status: 500, error: 'Manifesto de saída inválido.' };
  const metadata = await stat(file);
  return { status: 200, file, size: metadata.size, stream: createReadStream(file) };
}
