import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from '../api/node_modules/pg/lib/index.js';
import { gradeSubmission } from '../api/submissions.mjs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const python =
  process.env.OMR_PYTHON ||
  '/home/fabio/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'read-card.py',
);
const runCommand = (command, args) =>
  new Promise((ok, no) => {
    const p = spawn(command, args);
    let o = '',
      e = '';
    p.stdout.on('data', (x) => (o += x));
    p.stderr.on('data', (x) => (e += x));
    p.on('error', no);
    p.on('close', (c) =>
      c === 0
        ? ok(o)
        : no(new Error(e || `${command} terminou com código ${c}`)),
    );
  });
const run = async (f) => JSON.parse(await runCommand(python, [script, f]));

async function renderPdfCards(pdf, directory) {
  const info = await runCommand('pdfinfo', [pdf]);
  const pages = Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1]);
  if (!Number.isInteger(pages) || pages < 1)
    throw new Error('Não foi possível identificar as páginas do PDF.');
  const output = path.join(directory, 'card');
  await runCommand('pdftoppm', ['-png', '-r', '200', pdf, output]);
  const files = (await readdir(directory))
    .filter((file) => /^card-\d+\.png$/.test(file))
    .sort((left, right) => {
      const page = (file) => Number(/\d+/.exec(file)?.[0]);
      return page(left) - page(right);
    });
  if (files.length !== pages)
    throw new Error('Nem todas as páginas do PDF puderam ser convertidas.');
  return files.map((file) => path.join(directory, file));
}

async function processCard(scanId, card, sourcePage, sourcePages) {
  try {
    const reviewImage = await readFile(card);
    const result = await run(card);
    const a = await pool.query(
      `SELECT aps.id, aps.assessment_version_id, av.snapshot,
              s.name, s.registration, ce.number, c.name AS class_name
       FROM application_students aps
       JOIN assessment_versions av ON av.id = aps.assessment_version_id
       JOIN students s ON s.id = aps.student_id
       JOIN assessment_applications aa ON aa.id = aps.application_id
       JOIN classes c ON c.id = aa.class_id
       LEFT JOIN class_enrollments ce
         ON ce.class_id = c.id AND ce.student_id = s.id
       WHERE aps.qr_payload=$1`,
      [result.qrPayload],
    );
    if (!a.rowCount) throw new Error('QR desconhecido');
    const assignment = a.rows[0];
    let submissionId = null;
    let grade = null;
    if (!result.requiresReview) {
      grade = gradeSubmission(assignment.snapshot, {
        candidate: {
          name: assignment.name,
          class: assignment.class_name,
          number: assignment.number ? String(assignment.number) : '',
        },
        responses: result.answers.map((answer) => ({
          questionNumber: answer.questionNumber,
          selectedLabels: answer.selectedLabels,
        })),
      });
      const submission = await pool.query(
        `INSERT INTO assessment_submissions
           (assessment_version_id,candidate,responses,result,score,max_score,requires_manual_review)
         VALUES($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7)
         RETURNING id`,
        [
          assignment.assessment_version_id,
          JSON.stringify(grade.candidate),
          JSON.stringify(grade.responses),
          JSON.stringify(grade.result),
          grade.score,
          grade.maxScore,
          grade.requiresManualReview,
        ],
      );
      submissionId = submission.rows[0].id;
    }
    await pool.query(
      `UPDATE card_scans
       SET status=$2,application_student_id=$3,result=$4::jsonb,
           submission_id=$5,source_page=$6,source_pages=$7,
           completed_at=now(),image_data='\\x',review_image_data=$8,
           error_message=NULL
       WHERE id=$1`,
      [
        scanId,
        result.requiresReview ? 'review' : 'completed',
        assignment.id,
        JSON.stringify({ ...result, grade }),
        submissionId,
        sourcePage,
        sourcePages,
        reviewImage,
      ],
    );
  } catch (error) {
    const reviewImage = await readFile(card).catch(() => null);
    const message = String(error.message).slice(0, 1000);
    const status = /QR Code não localizado|QR desconhecido/.test(message)
      ? 'review'
      : 'failed';
    await pool.query(
      `UPDATE card_scans SET status=$2,error_message=$3,source_page=$4,
              source_pages=$5,completed_at=now(),image_data='\\x',
              review_image_data=$6 WHERE id=$1`,
      [scanId, status, message, sourcePage, sourcePages, reviewImage],
    );
  }
}
async function tick() {
  const c = await pool.connect();
  let j;
  try {
    await c.query('BEGIN');
    const r = await c.query(
      "SELECT id,institution_id,uploaded_by,mime_type,image_data FROM card_scans WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (!r.rowCount) {
      await c.query('COMMIT');
      return;
    }
    j = r.rows[0];
    await c.query("UPDATE card_scans SET status='processing' WHERE id=$1", [
      j.id,
    ]);
    await c.query('COMMIT');
  } finally {
    c.release();
  }
  const d = await mkdtemp(path.join(tmpdir(), 'omr-'));
  try {
    const uploaded = path.join(
      d,
      j.mime_type === 'application/pdf'
        ? 'scan.pdf'
        : j.mime_type === 'image/png'
          ? 'scan.png'
          : 'scan.jpg',
    );
    await writeFile(uploaded, j.image_data);
    const cards =
      j.mime_type === 'application/pdf'
        ? await renderPdfCards(uploaded, d)
        : [uploaded];
    for (let index = 0; index < cards.length; index += 1) {
      let scanId = j.id;
      if (index > 0) {
        const child = await pool.query(
          `INSERT INTO card_scans
             (institution_id,uploaded_by,mime_type,image_data,status,
              parent_scan_id,source_page,source_pages)
           VALUES($1,$2,$3,'\\x','processing',$4,$5,$6) RETURNING id`,
          [
            j.institution_id,
            j.uploaded_by,
            j.mime_type,
            j.id,
            index + 1,
            cards.length,
          ],
        );
        scanId = child.rows[0].id;
      }
      await processCard(scanId, cards[index], index + 1, cards.length);
    }
  } catch (e) {
    await pool.query(
      "UPDATE card_scans SET status='failed',error_message=$2,completed_at=now() WHERE id=$1",
      [j.id, String(e.message).slice(0, 1000)],
    );
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}
console.log('Worker OMR ativo');
for (;;) {
  await tick().catch(console.error);
  await new Promise((r) => setTimeout(r, 1500));
}
