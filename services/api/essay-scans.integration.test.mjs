import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

// Envio em lote das folhas de redação escaneadas: separação das páginas do
// PDF (pdftoppm), identificação pelo QR, atribuição manual, recebimento em
// lote e exclusão definitiva da aplicação. O leitor de QR (OpenCV) é
// substituído por uma função de teste; o resto roda de verdade sobre um banco
// com todas as migrações (ESSAY_TEST_DATABASE_URL).
const url = process.env.ESSAY_TEST_DATABASE_URL;

/** PDF mínimo com uma linha diferente em cada página (sem fontes). */
function pdfWithPages(count) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids = [];
  for (let index = 0; index < count; index += 1) {
    const stream = `${40 + index * 60} 400 m ${300 + index * 40} 700 l 6 w S`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${objects.length + 2} 0 R >>`,
    );
    kids.push(`${objects.length} 0 R`);
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${count} >>`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return `data:application/pdf;base64,${Buffer.from(body, 'latin1').toString('base64')}`;
}

const png = (text) =>
  `data:image/png;base64,${Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from(text),
  ]).toString('base64')}`;

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(output) : reject(new Error(error || `${code}`)),
    );
  });

function filesIn(directory) {
  const found = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) found.push(...filesIn(full));
    else found.push(full);
  }
  return found;
}

test(
  'redações escaneadas em lote: QR, atribuição, recebimento e exclusão',
  { skip: !url, timeout: 300_000 },
  async () => {
    process.env.DATABASE_URL = url;
    const storageDir = mkdtempSync(path.join(tmpdir(), 'essay-scans-'));
    process.env.FILE_STORAGE_PROVIDER = 'filesystem';
    process.env.FILE_STORAGE_DIR = storageDir;
    delete process.env.ESSAY_AI_PROVIDER;
    const { pool } = await import('./db.mjs');
    const essays = await import('./essays.mjs');
    const correction = await import('./essay-correction.mjs');
    const scans = await import('./essay-scans.mjs');
    const worker = await import('../omr/essay-scans.mjs');
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    const institutionId = randomUUID();
    const [teacherId, colleagueId] = [randomUUID(), randomUUID()];
    let qrByPage = {};
    const readQr = async (file) => qrByPage[path.basename(file)] ?? '';
    const work = async () => {
      const row = await worker.claimEssayScan();
      assert.ok(row, 'há um arquivo na fila');
      return worker.processEssayScan(row, { readQr, runCommand });
    };
    try {
      await admin.query(
        `INSERT INTO institutions(id,name,slug) VALUES ($1,'Escola Lote',$2)`,
        [institutionId, `l-${institutionId}`],
      );
      for (const [id, name] of [
        [teacherId, 'Profa. Lia'],
        [colleagueId, 'Prof. Caio'],
      ])
        await admin.query(
          `INSERT INTO users(id,email,display_name,account_type) VALUES ($1,$2,$3,'educator')`,
          [id, `${id}@teste.local`, name],
        );
      await admin.query(
        `INSERT INTO memberships(institution_id,user_id,role) VALUES ($1,$2,'teacher'),($1,$3,'teacher')`,
        [institutionId, teacherId, colleagueId],
      );
      const classId = (
        await admin.query(
          `INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES ($1,'C','2ª série',2026,$2) RETURNING id`,
          [institutionId, teacherId],
        )
      ).rows[0].id;
      for (const [index, name] of ['Ana', 'Bia', 'Caio'].entries()) {
        const id = (
          await admin.query(
            `INSERT INTO students(institution_id,registration,name) VALUES ($1,$2,$3) RETURNING id`,
            [institutionId, `L${index}`, name],
          )
        ).rows[0].id;
        await admin.query(
          'INSERT INTO class_enrollments(class_id,student_id,number) VALUES ($1,$2,$3)',
          [classId, id, index + 1],
        );
      }
      const teacher = {
        userId: teacherId,
        institutionId,
        role: 'teacher',
        displayName: 'Profa. Lia',
      };
      const colleague = { userId: colleagueId, institutionId, role: 'teacher' };
      const prompt = await essays.createEssayPrompt(teacher, {
        title: 'Leitura no Brasil',
        theme: 'Desafios da formação de leitores no Brasil',
        productionCommand: 'Redija um texto dissertativo-argumentativo.',
        minLines: 7,
        maxLines: 30,
        status: 'published',
      });
      const application = await essays.createEssayApplication(teacher, {
        promptId: prompt.id,
        classId,
        appliedOn: '2026-05-04',
        submissionModes: ['typed', 'upload'],
      });
      const [ana, bia, caio] = application.students;
      // Cada aluno tem um QR próprio, aleatório, gravado no banco.
      const codes = (
        await admin.query(
          'SELECT id,qr_code FROM essay_application_students WHERE application_id=$1',
          [application.id],
        )
      ).rows;
      const qr = Object.fromEntries(codes.map((row) => [row.id, row.qr_code]));
      assert.equal(new Set(Object.values(qr)).size, 3);
      for (const code of Object.values(qr))
        assert.match(code, essays.ESSAY_QR_PATTERN);
      assert.equal('qrCode' in application.students[0], false);

      // Validações do envio.
      await assert.rejects(
        scans.uploadEssayScan(colleague, application.id, {
          dataUrl: pdfWithPages(1),
        }),
        { statusCode: 404 },
      );
      await assert.rejects(
        scans.uploadEssayScan(teacher, application.id, {
          dataUrl: 'data:image/gif;base64,R0lGOD',
        }),
        { statusCode: 422 },
      );

      // PDF com 3 páginas: Ana, página sem QR e Bia.
      qrByPage = { 'page-1.jpg': qr[ana.id], 'page-3.jpg': qr[bia.id] };
      const upload = await scans.uploadEssayScan(teacher, application.id, {
        dataUrl: pdfWithPages(3),
        name: 'turma-c.pdf',
      });
      assert.equal(upload.status, 'queued');
      assert.deepEqual(await work(), { pages: 3, attached: 2 });
      assert.equal(await worker.claimEssayScan(), null);
      let state = await scans.listEssayScans(teacher, application.id);
      assert.equal(state.pages.length, 3);
      const attached = state.pages.filter((page) => page.status === 'attached');
      assert.deepEqual(attached.map((page) => page.studentName).sort(), [
        'Ana',
        'Bia',
      ]);
      const loose = state.pages.find((page) => page.status === 'unmatched');
      assert.equal(loose.sourcePage, 2);
      assert.equal(loose.hasImage, true);
      assert.match(loose.message, /QR não localizado/);
      const image = await scans.essayScanPageImage(teacher, loose.id);
      assert.equal(image.mimeType, 'image/jpeg');
      assert.equal(image.contents[0], 0xff);
      const ready = (id) =>
        state.students.find((student) => student.id === id).scanPages;
      assert.equal(ready(ana.id), 1);
      assert.equal(ready(bia.id), 1);

      // Atribuição manual da página sem QR ao Caio.
      await assert.rejects(
        scans.assignEssayScanPage(teacher, loose.id, { entryId: randomUUID() }),
        { statusCode: 404 },
      );
      await scans.assignEssayScanPage(teacher, loose.id, { entryId: caio.id });
      await assert.rejects(
        scans.assignEssayScanPage(teacher, loose.id, { entryId: caio.id }),
        { statusCode: 409 },
      );
      state = await scans.listEssayScans(teacher, application.id);
      assert.equal(ready(caio.id), 1);

      // Foto de um cartão-resposta de prova: não identificada, descartada.
      qrByPage = { 'upload.png': `CBS1:${randomUUID()}:${'a'.repeat(20)}` };
      await scans.uploadEssayScan(teacher, application.id, {
        dataUrl: png('cartao de prova'),
      });
      assert.deepEqual(await work(), { pages: 1, attached: 0 });
      state = await scans.listEssayScans(teacher, application.id);
      const card = state.pages.find((page) => page.status === 'unmatched');
      assert.match(card.message, /cartão-resposta de prova/);
      await scans.discardEssayScanPage(teacher, card.id);
      state = await scans.listEssayScans(teacher, application.id);
      assert.equal(
        state.pages.some((page) => page.id === card.id),
        false,
      );

      // Recebimento em lote: três produções seguem para a correção.
      assert.deepEqual(await scans.receiveEssayScans(teacher, application.id), {
        received: 3,
        errors: [],
      });
      const entry = await correction.getEssayEntry(teacher, ana.id);
      assert.equal(entry.status, 'awaiting_grading');
      assert.equal(entry.submission.mode, 'teacher_scan');
      assert.equal(entry.submission.files.length, 1);

      // Nova página da Ana depois do recebimento: fica para decisão do professor.
      qrByPage = { 'upload.png': qr[ana.id] };
      await scans.uploadEssayScan(teacher, application.id, {
        dataUrl: png('segunda via'),
      });
      await work();
      state = await scans.listEssayScans(teacher, application.id);
      const late = state.pages.find((page) => page.status === 'unmatched');
      assert.equal(late.studentName, 'Ana');
      assert.match(late.message, /já foi recebida/);
      assert.equal(
        (await scans.receiveEssayScans(teacher, application.id)).received,
        0,
      );

      // Exclusão definitiva: confirmação, permissão e arquivos removidos.
      assert.ok(filesIn(storageDir).length > 0);
      await assert.rejects(
        scans.deleteEssayApplication(teacher, application.id, {}),
        { name: 'ZodError' },
      );
      await assert.rejects(
        scans.deleteEssayApplication(colleague, application.id, {
          confirm: true,
        }),
        { statusCode: 404 },
      );
      assert.deepEqual(
        await scans.deleteEssayApplication(teacher, application.id, {
          confirm: true,
        }),
        { deleted: true },
      );
      await assert.rejects(
        essays.getEssayApplication(teacher, application.id),
        { statusCode: 404 },
      );
      assert.deepEqual(filesIn(storageDir), []);
      const audit = await admin.query(
        `SELECT metadata FROM audit_log WHERE action='essay.application.delete' AND entity_id=$1`,
        [application.id],
      );
      assert.equal(audit.rows[0].metadata.students, 3);
    } finally {
      try {
        await admin.query('BEGIN');
        await admin.query("SET LOCAL ufaprova.allow_history_purge='on'");
        await admin.query(
          'DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM classes WHERE institution_id=$1)',
          [institutionId],
        );
        for (const table of [
          'academic_events',
          'student_enrollments',
          'essay_applications',
          'essay_prompts',
          'classes',
          'academic_years',
        ])
          await admin.query(`DELETE FROM ${table} WHERE institution_id=$1`, [
            institutionId,
          ]);
        await admin.query('DELETE FROM institutions WHERE id=$1', [
          institutionId,
        ]);
        await admin.query('COMMIT');
      } catch (error) {
        await admin.query('ROLLBACK');
        console.error('Falha ao limpar dados do teste de lote:', error);
      }
      await admin.query('DELETE FROM users WHERE id=ANY($1)', [
        [teacherId, colleagueId],
      ]);
      await admin.end();
      await pool.end();
      rmSync(storageDir, { recursive: true, force: true });
    }
  },
);
