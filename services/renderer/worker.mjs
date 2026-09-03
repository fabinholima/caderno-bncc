import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { renderAssessment } from './render-contract.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const outputRoot = path.resolve(
  projectRoot,
  process.env.RENDER_OUTPUT_DIR || 'outputs/renders',
);
const contextBin = process.env.CONTEXT_BIN || 'context';
const interval = Number(process.env.RENDER_POLL_MS || 3000);
const renderTimeout = Number(process.env.RENDER_TIMEOUT_MS || 300_000);

async function claimJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT rj.id, rj.template_version, av.snapshot
      FROM render_jobs rj
      JOIN assessment_versions av ON av.id = rj.assessment_version_id
      WHERE rj.status = 'queued' AND rj.renderer = 'context-lmtx'
      ORDER BY rj.created_at
      FOR UPDATE OF rj SKIP LOCKED LIMIT 1`);
    if (!result.rowCount) {
      await client.query('COMMIT');
      return null;
    }
    await client.query(
      "UPDATE render_jobs SET status = 'running', error_message = NULL WHERE id = $1",
      [result.rows[0].id],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function compile(source, cwd, resultName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      contextBin,
      ['--batchmode', `--result=${resultName}`, path.basename(source)],
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEXMFCACHE:
            process.env.TEXMFCACHE || path.join(outputRoot, '.tex-cache'),
        },
      },
    );
    let output = '';
    const capture = (chunk) => {
      output = `${output}${chunk}`.slice(-100_000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', (chunk) => {
      capture(chunk);
    });
    child.on('error', reject);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ConTeXt excedeu o limite de ${renderTimeout} ms.`));
    }, renderTimeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      return code === 0
        ? resolve()
        : reject(new Error(output || `ConTeXt terminou com código ${code}.`));
    });
  });
}

export async function validatePdf(file) {
  const metadata = await stat(file);
  if (metadata.size < 100)
    throw new Error('O ConTeXt produziu um arquivo PDF vazio ou incompleto.');
  const handle = await open(file, 'r');
  try {
    const signature = Buffer.alloc(5);
    await handle.read(signature, 0, signature.length, 0);
    if (signature.toString('ascii') !== '%PDF-')
      throw new Error('A saída do ConTeXt não é um PDF válido.');
  } finally {
    await handle.close();
  }
  return metadata.size;
}

export async function render(job) {
  const directory = path.join(outputRoot, job.id);
  await mkdir(directory, { recursive: true });
  const studentSource = path.join(directory, 'prova.tex');
  const answerKeySource = path.join(directory, 'gabarito.tex');
  await writeFile(
    studentSource,
    renderAssessment({
      ...job.snapshot,
      render: {
        ...job.snapshot.render,
        mode: 'student',
        template: job.template_version || job.snapshot.render?.template,
      },
    }),
    'utf8',
  );
  await writeFile(
    answerKeySource,
    renderAssessment({
      ...job.snapshot,
      render: {
        ...job.snapshot.render,
        mode: 'answer-key',
        template: job.template_version || job.snapshot.render?.template,
      },
    }),
    'utf8',
  );
  await compile(studentSource, directory, 'prova');
  await validatePdf(path.join(directory, 'prova.pdf'));
  await compile(answerKeySource, directory, 'gabarito');
  await validatePdf(path.join(directory, 'gabarito.pdf'));
  await pool.query(
    "UPDATE render_jobs SET status = 'completed', completed_at = now(), output_manifest = $2::jsonb WHERE id = $1",
    [
      job.id,
      JSON.stringify({
        studentPdf: path.join(job.id, 'prova.pdf'),
        answerKeyPdf: path.join(job.id, 'gabarito.pdf'),
        studentSource: path.join(job.id, 'prova.tex'),
        answerKeySource: path.join(job.id, 'gabarito.tex'),
      }),
    ],
  );
}

export async function tick() {
  const job = await claimJob();
  if (!job) return;
  try {
    await render(job);
  } catch (error) {
    await pool.query(
      "UPDATE render_jobs SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1",
      [job.id, String(error.message).slice(0, 4000)],
    );
  }
}

export async function startWorker() {
  console.log(`Renderer ativo; saída em ${outputRoot}`);
  for (;;) {
    await tick().catch((error) => console.error(error));
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === entrypoint) await startWorker();
