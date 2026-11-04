import path from 'node:path';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  copyFile,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';
import { readRenderArtifact } from './render-artifact-storage.mjs';
import {
  hasSeparateFinalAnswerCard,
  parsePdfPageCount,
  selectFinalAnswerCardPage,
} from './answer-card-batches.mjs';

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
  kind = 'exam',
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

  // Transferidos e remanejados não recebem cartão-resposta; a prova completa
  // continua no lote, como cadastrada na aplicação.
  const jobs = await pool.query({
    text: `SELECT rj.status, rj.output_manifest, rj.template_version
           FROM application_students aps
           JOIN students s ON s.id = aps.student_id
           LEFT JOIN class_enrollments ce
             ON ce.student_id = s.id
            AND ce.class_id = (
              SELECT class_id FROM assessment_applications WHERE id = aps.application_id
            )
           LEFT JOIN render_jobs rj ON rj.application_student_id = aps.id
           WHERE aps.application_id = $1
             AND ($2 <> 'answer-card' OR COALESCE(s.status, '') NOT IN ('transferido', 'remanejado'))
           ORDER BY ce.number NULLS LAST, s.name, aps.id`,
    values: [applicationId, kind],
  });
  if (kind === 'answer-card' && !jobs.rowCount)
    return {
      status: 422,
      error: 'Nenhum aluno desta aplicação precisa de cartão-resposta.',
    };
  const state = applicationBatchState(jobs.rows);
  if (state.error) return state;
  if (
    kind === 'answer-card' &&
    jobs.rows.some((job) => !hasSeparateFinalAnswerCard(job.template_version))
  )
    return {
      status: 422,
      error:
        'O layout compacto mistura o cartão-resposta com a prova e não permite separá-los neste lote. Use um layout com folha de respostas separada.',
    };

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
      if (kind === 'answer-card') {
        const pagePrefix = `${index + 1}-page-`;
        const info = await execFileAsync('pdfinfo', [source], {
          timeout: 30_000,
          maxBuffer: 1_000_000,
        });
        const pageCount = parsePdfPageCount(info.stdout);
        if (!pageCount)
          throw new Error('Não foi possível identificar as páginas da prova.');
        await execFileAsync(
          'pdfseparate',
          [
            '-f',
            String(pageCount),
            '-l',
            String(pageCount),
            source,
            path.join(batchDirectory, `${pagePrefix}%d.pdf`),
          ],
          { timeout: 60_000, maxBuffer: 1_000_000 },
        );
        const pageFile = selectFinalAnswerCardPage(
          await readdir(batchDirectory),
          pagePrefix,
        );
        if (!pageFile)
          throw new Error(
            'Não foi possível localizar a página do cartão-resposta.',
          );
        sources.push(path.join(batchDirectory, pageFile));
      } else {
        sources.push(source);
      }
    }
    const destination = path.join(
      batchDirectory,
      `${applicationId}-${crypto.randomUUID()}.pdf`,
    );
    if (sources.length === 1) await copyFile(sources[0], destination);
    else
      await execFileAsync('pdfunite', [...sources, destination], {
        timeout: 120_000,
        maxBuffer: 1_000_000,
      });
    const file = await stat(destination);
    let cleanupPromise;
    return {
      status: 200,
      size: file.size,
      stream: createReadStream(destination),
      cleanup: () =>
        (cleanupPromise ??= rm(batchDirectory, {
          recursive: true,
          force: true,
        })),
    };
  } catch (error) {
    await rm(batchDirectory, { recursive: true, force: true });
    if (/Manifesto|Provedor/.test(error.message))
      return { status: 500, error: error.message };
    return {
      status: 500,
      error: `Não foi possível montar o PDF em lote: ${String(error.message).slice(0, 300)}`,
    };
  }
}

export async function streamApplicationBatchFile(
  response,
  file,
  filename,
  corsHeaders,
) {
  response.writeHead(200, {
    'content-type': 'application/pdf',
    'content-length': file.size,
    'content-disposition': `attachment; filename="${filename}"`,
    ...corsHeaders(response),
  });
  try {
    await pipeline(file.stream, response);
  } catch (error) {
    console.error('Falha ao transmitir PDF em lote:', error);
    response.destroy();
  } finally {
    await file.cleanup?.();
  }
}
