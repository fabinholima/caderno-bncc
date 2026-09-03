import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { renderAssessment } from './render-contract.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const outputRoot = path.resolve(process.env.RENDER_OUTPUT_DIR || 'outputs/renders');
const contextBin = process.env.CONTEXT_BIN || 'context';
const interval = Number(process.env.RENDER_POLL_MS || 3000);

async function claimJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT rj.id, av.snapshot
      FROM render_jobs rj
      JOIN assessment_versions av ON av.id = rj.assessment_version_id
      WHERE rj.status = 'queued' AND rj.renderer = 'context-lmtx'
      ORDER BY rj.created_at
      FOR UPDATE OF rj SKIP LOCKED LIMIT 1`);
    if (!result.rowCount) { await client.query('COMMIT'); return null; }
    await client.query("UPDATE render_jobs SET status = 'running', error_message = NULL WHERE id = $1", [result.rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function compile(source, cwd, resultName) {
  return new Promise((resolve, reject) => {
    const child = spawn(contextBin, ['--batchmode', `--result=${resultName}`, path.basename(source)], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TEXMFCACHE: process.env.TEXMFCACHE || path.join(cwd, '.tex-cache') } });
    let errorOutput = '';
    child.stderr.on('data', (chunk) => { errorOutput += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(errorOutput || `ConTeXt terminou com código ${code}.`)));
  });
}

async function render(job) {
  const directory = path.join(outputRoot, job.id);
  await mkdir(directory, { recursive: true });
  const studentSource = path.join(directory, 'prova.tex');
  const answerKeySource = path.join(directory, 'gabarito.tex');
  await writeFile(studentSource, renderAssessment({ ...job.snapshot, render: { ...job.snapshot.render, mode: 'student' } }), 'utf8');
  await writeFile(answerKeySource, renderAssessment({ ...job.snapshot, render: { ...job.snapshot.render, mode: 'answer-key' } }), 'utf8');
  await compile(studentSource, directory, 'prova.pdf');
  await compile(answerKeySource, directory, 'gabarito.pdf');
  await pool.query("UPDATE render_jobs SET status = 'completed', completed_at = now(), output_manifest = $2::jsonb WHERE id = $1", [job.id, JSON.stringify({ studentPdf: path.join(job.id, 'prova.pdf'), answerKeyPdf: path.join(job.id, 'gabarito.pdf'), studentSource: path.join(job.id, 'prova.tex'), answerKeySource: path.join(job.id, 'gabarito.tex') })]);
}

async function tick() {
  const job = await claimJob();
  if (!job) return;
  try { await render(job); }
  catch (error) {
    await pool.query("UPDATE render_jobs SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [job.id, String(error.message).slice(0, 4000)]);
  }
}

console.log(`Renderer ativo; saída em ${outputRoot}`);
for (;;) {
  await tick().catch((error) => console.error(error));
  await new Promise((resolve) => setTimeout(resolve, interval));
}
