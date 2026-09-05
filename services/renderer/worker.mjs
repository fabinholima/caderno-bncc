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
      SELECT rj.id, rj.template_version, av.snapshot,
             aps.qr_payload, s.name AS student_name, s.registration,
             ce.number AS student_number, c.name AS class_name
      FROM render_jobs rj
      JOIN assessment_versions av ON av.id = rj.assessment_version_id
      LEFT JOIN application_students aps ON aps.id = rj.application_student_id
      LEFT JOIN students s ON s.id = aps.student_id
      LEFT JOIN assessment_applications aa ON aa.id = aps.application_id
      LEFT JOIN classes c ON c.id = aa.class_id
      LEFT JOIN class_enrollments ce ON ce.class_id = c.id AND ce.student_id = s.id
      WHERE rj.status = 'queued' AND rj.renderer = 'context-lmtx'
        AND (aps.id IS NULL OR aa.status <> 'cancelled')
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

export async function compileAndValidate(source, cwd, resultName) {
  const pdf = path.join(cwd, `${resultName}.pdf`);
  await compile(source, cwd, resultName);
  try {
    return await validatePdf(pdf);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    // A primeira execução de uma instalação nova pode apenas gerar formatos e
    // caches de fontes. Nesse caso, uma segunda passagem produz o documento.
    await compile(source, cwd, resultName);
    return validatePdf(pdf);
  }
}

export async function materializeInstitutionLogo(snapshot, directory) {
  const dataUrl = snapshot.institution?.logoDataUrl;
  if (!dataUrl) return snapshot;
  const match = dataUrl.match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) throw new Error('Logotipo institucional inválido.');
  const contents = Buffer.from(match[2], 'base64');
  if (!contents.length || contents.length > 400_000)
    throw new Error('Logotipo institucional vazio ou maior que 400 KB.');
  const isPng =
    match[1] === 'png' &&
    contents.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const isJpeg =
    match[1] === 'jpeg' &&
    contents[0] === 0xff &&
    contents[1] === 0xd8 &&
    contents.at(-2) === 0xff &&
    contents.at(-1) === 0xd9;
  if (!isPng && !isJpeg)
    throw new Error('O conteúdo do logotipo não corresponde a PNG ou JPEG.');
  const fileName = `institution-logo.${isPng ? 'png' : 'jpg'}`;
  await writeFile(path.join(directory, fileName), contents);
  return {
    ...snapshot,
    institution: {
      ...snapshot.institution,
      logoDataUrl: undefined,
      logoFileName: fileName,
    },
  };
}

export async function materializeQuestionImages(snapshot, directory) {
  let imageNumber = 0;
  const materializeNodes = async (nodes = []) =>
    Promise.all(
      nodes.map(async (node) => {
        if (node.type !== 'image') return node;
        const match = String(node.dataUrl ?? '').match(
          /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/,
        );
        if (!match) throw new Error('Imagem de questão inválida.');
        const contents = Buffer.from(match[2], 'base64');
        if (!contents.length || contents.length > 400_000)
          throw new Error('Imagem de questão vazia ou maior que 400 KB.');
        const isPng =
          match[1] === 'png' &&
          contents
            .subarray(0, 8)
            .equals(Buffer.from('89504e470d0a1a0a', 'hex'));
        const isJpeg =
          match[1] === 'jpeg' &&
          contents[0] === 0xff &&
          contents[1] === 0xd8 &&
          contents.at(-2) === 0xff &&
          contents.at(-1) === 0xd9;
        if (!isPng && !isJpeg)
          throw new Error(
            'O conteúdo da imagem não corresponde a PNG ou JPEG.',
          );
        imageNumber += 1;
        const fileName = `question-image-${imageNumber}.${isPng ? 'png' : 'jpg'}`;
        await writeFile(path.join(directory, fileName), contents);
        return { ...node, dataUrl: undefined, fileName };
      }),
    );
  const sections = [];
  for (const section of snapshot.sections ?? []) {
    const questions = [];
    for (const question of section.questions ?? []) {
      const alternatives = [];
      for (const alternative of question.alternatives ?? [])
        alternatives.push({
          ...alternative,
          content: await materializeNodes(alternative.content),
        });
      questions.push({
        ...question,
        statement: await materializeNodes(question.statement),
        alternatives,
        answer: {
          ...question.answer,
          explanation: await materializeNodes(question.answer?.explanation),
        },
      });
    }
    sections.push({ ...section, questions });
  }
  return {
    ...snapshot,
    sections,
    questions: sections.flatMap((section) => section.questions),
  };
}

export async function materializeVersionQr(snapshot, directory) {
  const payload = String(snapshot.version?.qrPayload || '');
  if (!payload) return snapshot;
  if (!/^CBS?1:[0-9a-f-]{36}:[0-9a-f]{20}$/.test(payload))
    throw new Error('Identificador QR inválido.');
  const fileName = 'assessment-qr.png';
  await new Promise((resolve, reject) => {
    const child = spawn('zint', [
      '--barcode=58',
      `--data=${payload}`,
      '--scale=3',
      '--border=2',
      `--output=${path.join(directory, fileName)}`,
    ]);
    let error = '';
    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(error || `Zint terminou com código ${code}.`)),
    );
  });
  return {
    ...snapshot,
    version: { ...snapshot.version, qrFileName: fileName },
  };
}

export async function render(job) {
  const directory = path.join(outputRoot, job.id);
  await mkdir(directory, { recursive: true });
  await mkdir(path.join(outputRoot, '.tex-cache'), { recursive: true });
  const personalizedSnapshot = job.student_name
    ? {
        ...job.snapshot,
        assessment: {
          ...job.snapshot.assessment,
          header: {
            ...job.snapshot.assessment?.header,
            className: job.class_name,
          },
        },
        candidate: {
          name: job.student_name,
          registration: job.registration,
          number: job.student_number,
        },
        version: { ...job.snapshot.version, qrPayload: job.qr_payload },
      }
    : job.snapshot;
  const withLogo = await materializeInstitutionLogo(
    personalizedSnapshot,
    directory,
  );
  const withImages = await materializeQuestionImages(withLogo, directory);
  const snapshot = await materializeVersionQr(withImages, directory);
  const studentSource = path.join(directory, 'prova.tex');
  const answerKeySource = path.join(directory, 'gabarito.tex');
  await writeFile(
    studentSource,
    renderAssessment({
      ...snapshot,
      render: {
        ...snapshot.render,
        mode: 'student',
        template: job.template_version || snapshot.render?.template,
      },
    }),
    'utf8',
  );
  await writeFile(
    answerKeySource,
    renderAssessment({
      ...snapshot,
      render: {
        ...snapshot.render,
        mode: 'answer-key',
        template: job.template_version || snapshot.render?.template,
      },
    }),
    'utf8',
  );
  await compileAndValidate(studentSource, directory, 'prova');
  await compileAndValidate(answerKeySource, directory, 'gabarito');
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
  await pool.query(
    `INSERT INTO usage_events(institution_id,kind,quantity,metadata)
     SELECT a.institution_id,'render',1,$2::jsonb
     FROM render_jobs rj JOIN assessment_versions av ON av.id=rj.assessment_version_id
     JOIN assessments a ON a.id=av.assessment_id WHERE rj.id=$1`,
    [job.id, JSON.stringify({ renderJobId: job.id })],
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
