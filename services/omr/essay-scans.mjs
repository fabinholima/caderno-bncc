// Folhas de redação enviadas em lote: o worker OMR lê o QR de cada página
// (o mesmo leitor dos cartões-resposta) e a anexa ao rascunho de digitalização
// da produção do aluno. Páginas sem QR legível ficam para atribuição manual.
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pool, transaction } from '../api/db.mjs';
import {
  attachScanPage,
  deleteEssayFile,
  essayFileStorage,
  readEssayFile,
} from '../api/essay-correction.mjs';

const LEASE_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const MAX_PAGES = 200;
const ESSAY_QR = /^CBR1:[0-9A-F]{20}$/;

export async function claimEssayScan(db = pool) {
  const result = await db.query(
    `WITH next AS (
       SELECT id FROM essay_scan_pages
        WHERE parent_id IS NULL AND source_ref IS NOT NULL
          AND (status='queued' OR (status='processing' AND locked_until<now()))
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     UPDATE essay_scan_pages p SET status='processing',attempts=p.attempts+1,
            locked_until=now()+interval '${LEASE_MINUTES} minutes'
       FROM next WHERE p.id=next.id RETURNING p.*`,
  );
  return result.rows[0] || null;
}

async function splitPdf(runCommand, file, directory) {
  const info = await runCommand('pdfinfo', [file]);
  const pages = Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1]);
  if (!Number.isInteger(pages) || pages < 1)
    throw new Error('Não foi possível identificar as páginas do PDF.');
  if (pages > MAX_PAGES)
    throw new Error(`Envie no máximo ${MAX_PAGES} páginas por arquivo.`);
  await runCommand('pdftoppm', [
    '-jpeg',
    '-jpegopt',
    'quality=85',
    '-r',
    '200',
    file,
    path.join(directory, 'page'),
  ]);
  const files = (await readdir(directory))
    .filter((name) => /^page-\d+\.jpg$/.test(name))
    .sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]));
  if (files.length !== pages)
    throw new Error('Nem todas as páginas do PDF puderam ser convertidas.');
  return files.map((name) => path.join(directory, name));
}

/** Identifica a produção pelo QR; null quando a página não é desta aplicação. */
async function findEntry(row, payload) {
  if (!payload)
    return {
      message:
        'QR não localizado (pode ser a proposta, a grade de critérios ou uma foto sem o cabeçalho).',
    };
  if (/^CBS?1:/.test(payload))
    return {
      message:
        'Esta página é um cartão-resposta de prova, não uma folha de redação.',
    };
  if (!ESSAY_QR.test(payload))
    return { message: 'O QR da página não é de uma folha de redação.' };
  const result = await pool.query(
    `SELECT eas.id,eas.application_id,ea.prompt_snapshot->>'title' AS title,c.name AS class_name
       FROM essay_application_students eas
       JOIN essay_applications ea ON ea.id=eas.application_id
       JOIN classes c ON c.id=ea.class_id
      WHERE eas.qr_code=$1 AND ea.institution_id=$2`,
    [payload, row.institution_id],
  );
  const entry = result.rows[0];
  if (!entry)
    return { message: 'O QR não corresponde a nenhuma folha desta escola.' };
  if (entry.application_id !== row.application_id)
    return {
      message: `Folha de outra aplicação (${entry.title} — ${entry.class_name}).`,
    };
  return { entryId: entry.id };
}

async function keepPageImage(row, pageId, page) {
  if (page.reuseSource) return row.source_ref;
  const storage = essayFileStorage();
  const key = await storage.put(
    `essay-scans/${row.institution_id}/${row.application_id}/${pageId}-pagina.jpg`,
    page.contents,
    { contentType: page.mimeType },
  );
  return `${storage.provider}:${key}`;
}

async function processPage(row, pageId, page, readQr) {
  const payload = await readQr(page.path).catch(() => '');
  const found = await findEntry(row, payload);
  let message = found.message || '';
  if (found.entryId) {
    try {
      const file = {
        mimeType: page.mimeType,
        contents: page.contents,
        sha256: createHash('sha256').update(page.contents).digest('hex'),
      };
      const attached = await transaction(async (client) => {
        const { file: added } = await attachScanPage(client, {
          entryId: found.entryId,
          userId: row.uploaded_by,
          file,
        });
        await client.query(
          `UPDATE essay_scan_pages SET status='attached',entry_id=$2,submission_file_id=$3,
                  page_ref=NULL,page_mime_type=$4,message='',locked_until=NULL,processed_at=now()
            WHERE id=$1`,
          [pageId, found.entryId, added.id, page.mimeType],
        );
        return added;
      });
      return { attached: Boolean(attached) };
    } catch (error) {
      if (!error.statusCode) throw error;
      message = error.message;
    }
  }
  // Não identificada (ou produção já recebida): guarda a imagem para o professor.
  const pageRef = await keepPageImage(row, pageId, page);
  await pool.query(
    `UPDATE essay_scan_pages SET status='unmatched',entry_id=$2,page_ref=$3,page_mime_type=$4,
            message=$5,locked_until=NULL,processed_at=now() WHERE id=$1`,
    [
      pageId,
      found.entryId || null,
      pageRef,
      page.mimeType,
      `${message} Escolha o aluno ou descarte a página.`.trim(),
    ],
  );
  return { attached: false, keptSource: page.reuseSource };
}

/**
 * Processa um arquivo do lote. `readQr(path)` devolve o texto do QR (ou
 * lança erro); `runCommand` executa pdfinfo/pdftoppm.
 */
export async function processEssayScan(row, { readQr, runCommand }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'redacao-lote-'));
  let keptSource = false;
  try {
    const contents = await readEssayFile(row.source_ref);
    const isPdf = row.mime_type === 'application/pdf';
    const uploaded = path.join(
      directory,
      `upload.${isPdf ? 'pdf' : row.mime_type === 'image/png' ? 'png' : 'jpg'}`,
    );
    await writeFile(uploaded, contents);
    const pages = isPdf
      ? await Promise.all(
          (await splitPdf(runCommand, uploaded, directory)).map(
            async (file) => ({
              path: file,
              contents: await readFile(file),
              mimeType: 'image/jpeg',
              reuseSource: false,
            }),
          ),
        )
      : [
          {
            path: uploaded,
            contents,
            mimeType: row.mime_type,
            reuseSource: true,
          },
        ];
    let attached = 0;
    for (let index = 0; index < pages.length; index += 1) {
      let pageId = row.id;
      if (index > 0) {
        const child = await pool.query(
          `INSERT INTO essay_scan_pages (institution_id,application_id,parent_id,uploaded_by,original_name,
                  mime_type,source_page,source_pages,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing') RETURNING id`,
          [
            row.institution_id,
            row.application_id,
            row.id,
            row.uploaded_by,
            row.original_name,
            row.mime_type,
            index + 1,
            pages.length,
          ],
        );
        pageId = child.rows[0].id;
      } else
        await pool.query(
          'UPDATE essay_scan_pages SET source_page=1,source_pages=$2 WHERE id=$1',
          [row.id, pages.length],
        );
      const result = await processPage(row, pageId, pages[index], readQr);
      if (result.attached) attached += 1;
      if (result.keptSource) keptSource = true;
    }
    // O arquivo enviado já foi lido; fica só se for a própria imagem da página.
    if (!keptSource) {
      await pool.query(
        'UPDATE essay_scan_pages SET source_ref=NULL WHERE id=$1',
        [row.id],
      );
      await deleteEssayFile(row.source_ref);
    }
    return { pages: pages.length, attached };
  } catch (error) {
    const final = row.attempts >= MAX_ATTEMPTS || error.permanent;
    await pool.query(
      `UPDATE essay_scan_pages SET status=$2,message=$3,locked_until=NULL,
              processed_at=CASE WHEN $2='failed' THEN now() END WHERE id=$1`,
      [
        row.id,
        final ? 'failed' : 'queued',
        String(error.message || 'Falha ao ler o arquivo.').slice(0, 500),
      ],
    );
    // Páginas criadas numa tentativa que falhou são refeitas na próxima (a
    // anexação ignora páginas repetidas).
    if (!final) {
      const removed = await pool.query(
        'DELETE FROM essay_scan_pages WHERE parent_id=$1 RETURNING page_ref',
        [row.id],
      );
      for (const { page_ref: ref } of removed.rows)
        if (ref && ref !== row.source_ref) await deleteEssayFile(ref);
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function tickEssayScans(options) {
  const row = await claimEssayScan();
  if (!row) return false;
  await processEssayScan(row, options).catch((error) =>
    console.error(`Redação em lote (${row.id}):`, error.message),
  );
  return true;
}
