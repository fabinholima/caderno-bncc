// Envio em lote das folhas de redação escaneadas e exclusão definitiva de
// aplicações. O professor envia um PDF (ou fotos) com as folhas da turma; o
// worker OMR (services/omr/essay-scans.mjs) lê o QR de cada página e a anexa à
// produção do aluno. Páginas sem QR legível ficam para atribuição manual.
// Arquivos ficam no armazenamento de objetos; o banco guarda só referências.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { ownsEssayApplication, teacherScope } from './ownership.mjs';
import {
  attachScanPage,
  decodeEssayFile,
  deleteEssayFile,
  essayFileStorage,
  readEssayFile,
  receiveTeacherScan,
} from './essay-correction.mjs';
import { canManageEssay } from './essays.mjs';

export const MAX_SCAN_UPLOAD_BYTES = 25 * 1024 * 1024;

const fail = (message, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });

const extensions = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

function requireStaff(identity) {
  if (!identity || identity.role === 'student')
    throw fail('Este recurso é exclusivo de professores e gestores.', 403);
}

async function loadApplication(db, identity, applicationId, { lock } = {}) {
  const result = await db.query(
    `SELECT ea.id,ea.institution_id,ea.status,ea.created_by,ea.class_id,
            ea.prompt_snapshot->>'title' AS prompt_title,c.name AS class_name,c.grade AS class_grade,
            class_year_locked(ea.class_id) AS year_locked
       FROM essay_applications ea JOIN classes c ON c.id=ea.class_id
      WHERE ea.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}
      ${lock ? 'FOR UPDATE OF ea' : ''}`,
    [applicationId, identity.institutionId, teacherScope(identity)],
  );
  if (!result.rowCount) throw fail('Aplicação não encontrada.', 404);
  return result.rows[0];
}

function assertWritable(application) {
  if (application.status === 'cancelled')
    throw fail('Aplicação cancelada.', 409);
  if (application.year_locked)
    throw fail(
      'O ano letivo desta turma está encerrado: redações e notas ficam somente para consulta.',
      409,
    );
}

const uploadSchema = z.object({
  dataUrl: z.string().max(36_000_000),
  name: z.string().max(200).optional().default(''),
});

/** Recebe um arquivo do lote; a leitura do QR acontece no worker OMR. */
export async function uploadEssayScan(identity, applicationId, input) {
  requireStaff(identity);
  const value = uploadSchema.parse(input);
  const application = await loadApplication(pool, identity, applicationId);
  assertWritable(application);
  const file = decodeEssayFile(value.dataUrl, {
    maxBytes: MAX_SCAN_UPLOAD_BYTES,
  });
  const id = randomUUID();
  const storage = essayFileStorage();
  const key = await storage.put(
    `essay-scans/${application.institution_id}/${applicationId}/${id}.${extensions[file.mimeType]}`,
    file.contents,
    { contentType: file.mimeType },
  );
  const ref = `${storage.provider}:${key}`;
  try {
    await pool.query(
      `INSERT INTO essay_scan_pages (id,institution_id,application_id,uploaded_by,original_name,mime_type,source_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        application.institution_id,
        applicationId,
        identity.userId,
        value.name.replace(/\p{Cc}/gu, '').slice(0, 200),
        file.mimeType,
        ref,
      ],
    );
    await pool.query(
      `INSERT INTO usage_events(institution_id,user_id,kind,quantity,metadata)
       VALUES($1,$2,'storage',$3,$4::jsonb)`,
      [
        application.institution_id,
        identity.userId,
        Math.max(1, Math.ceil(file.contents.length / 1024)),
        JSON.stringify({ essayScanId: id, unit: 'KiB' }),
      ],
    );
  } catch (error) {
    await deleteEssayFile(ref);
    throw error;
  }
  return { id, status: 'queued' };
}

function pageFromRow(row) {
  return {
    id: row.id,
    status: row.status,
    originalName: row.original_name,
    sourcePage: row.source_page,
    sourcePages: row.source_pages,
    message: row.message,
    entryId: row.entry_id,
    studentName: row.student_name,
    studentNumber: row.student_number,
    submissionFileId: row.submission_file_id,
    hasImage: Boolean(row.page_ref),
    createdAt: row.created_at,
  };
}

/** Situação do lote: páginas lidas, pendências e produções prontas para registrar. */
export async function listEssayScans(identity, applicationId) {
  requireStaff(identity);
  const application = await loadApplication(pool, identity, applicationId);
  const [pages, students] = await Promise.all([
    pool.query(
      `SELECT p.*,s.name AS student_name,eas.student_number
         FROM essay_scan_pages p
         LEFT JOIN essay_application_students eas ON eas.id=p.entry_id
         LEFT JOIN students s ON s.id=eas.student_id
        WHERE p.application_id=$1 AND p.status<>'discarded'
        ORDER BY (SELECT created_at FROM essay_scan_pages up WHERE up.id=COALESCE(p.parent_id,p.id)) DESC,
                 p.source_page NULLS FIRST LIMIT 500`,
      [applicationId],
    ),
    pool.query(
      `SELECT eas.id,eas.student_number,eas.status,s.name,
              sub.mode,sub.status AS submission_status,
              (SELECT count(*)::int FROM essay_submission_files f WHERE f.submission_id=sub.id) AS pages
         FROM essay_application_students eas
         JOIN students s ON s.id=eas.student_id
         LEFT JOIN LATERAL (
           SELECT * FROM essay_submissions WHERE application_student_id=eas.id
            ORDER BY attempt DESC LIMIT 1) sub ON true
        WHERE eas.application_id=$1
        ORDER BY eas.student_number NULLS LAST,s.name`,
      [applicationId],
    ),
  ]);
  return {
    application: {
      id: application.id,
      promptTitle: application.prompt_title,
      className: application.class_name,
      classGrade: application.class_grade,
      status: application.status,
      yearLocked: application.year_locked,
    },
    pages: pages.rows.map(pageFromRow),
    students: students.rows.map((row) => ({
      id: row.id,
      number: row.student_number,
      name: row.name,
      status: row.status,
      // Rascunho de digitalização com páginas: pronto para registrar.
      scanPages:
        row.mode === 'teacher_scan' && row.submission_status === 'draft'
          ? row.pages
          : 0,
    })),
  };
}

async function loadPage(db, identity, pageId, { lock } = {}) {
  const result = await db.query(
    `SELECT p.* FROM essay_scan_pages p
       JOIN essay_applications ea ON ea.id=p.application_id
      WHERE p.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}
      ${lock ? 'FOR UPDATE OF p' : ''}`,
    [pageId, identity.institutionId, teacherScope(identity)],
  );
  if (!result.rowCount) throw fail('Página não encontrada.', 404);
  return result.rows[0];
}

export async function essayScanPageImage(identity, pageId) {
  requireStaff(identity);
  const page = await loadPage(pool, identity, pageId);
  if (!page.page_ref) throw fail('Imagem da página indisponível.', 404);
  const mimeType = page.page_mime_type || page.mime_type;
  return {
    contents: await readEssayFile(page.page_ref),
    mimeType,
    filename: `pagina-escaneada.${extensions[mimeType] || 'jpg'}`,
  };
}

/** Atribuição manual de uma página sem QR legível (ou recusada) a um aluno. */
export async function assignEssayScanPage(identity, pageId, input) {
  requireStaff(identity);
  const { entryId } = z.object({ entryId: z.uuid() }).parse(input);
  const ref = await transaction(async (client) => {
    const page = await loadPage(client, identity, pageId, { lock: true });
    if (!['unmatched', 'failed'].includes(page.status) || !page.page_ref)
      throw fail('Esta página não está aguardando atribuição.', 409);
    const application = await loadApplication(
      client,
      identity,
      page.application_id,
    );
    assertWritable(application);
    const entry = await client.query(
      'SELECT 1 FROM essay_application_students WHERE id=$1 AND application_id=$2',
      [entryId, page.application_id],
    );
    if (!entry.rowCount)
      throw fail('O aluno escolhido não pertence a esta aplicação.', 404);
    const contents = await readEssayFile(page.page_ref);
    const mimeType = page.page_mime_type || page.mime_type;
    const file = decodeEssayFile(
      `data:${mimeType};base64,${contents.toString('base64')}`,
    );
    const { file: added } = await attachScanPage(client, {
      entryId,
      userId: identity.userId,
      file,
    });
    await client.query(
      `UPDATE essay_scan_pages SET status='attached',entry_id=$2,submission_file_id=$3,
              page_ref=NULL,message='Atribuída manualmente.',processed_at=now() WHERE id=$1`,
      [pageId, entryId, added.id],
    );
    // A imagem da página só é apagada se não for também o arquivo enviado.
    return page.page_ref === page.source_ref ? null : page.page_ref;
  });
  if (ref) await deleteEssayFile(ref);
  return { assigned: true };
}

export async function discardEssayScanPage(identity, pageId) {
  requireStaff(identity);
  const refs = await transaction(async (client) => {
    const page = await loadPage(client, identity, pageId, { lock: true });
    if (!['unmatched', 'failed'].includes(page.status))
      throw fail(
        'Só páginas não identificadas podem ser descartadas aqui.',
        409,
      );
    await client.query(
      `UPDATE essay_scan_pages SET status='discarded',page_ref=NULL,source_ref=NULL WHERE id=$1`,
      [pageId],
    );
    return [...new Set([page.page_ref, page.source_ref].filter(Boolean))];
  });
  for (const ref of refs) await deleteEssayFile(ref);
  return { discarded: true };
}

/** Registra de uma vez o recebimento das digitalizações com páginas. */
export async function receiveEssayScans(identity, applicationId) {
  requireStaff(identity);
  const application = await loadApplication(pool, identity, applicationId);
  assertWritable(application);
  const ready = await pool.query(
    `SELECT eas.id FROM essay_application_students eas
       JOIN LATERAL (
         SELECT * FROM essay_submissions WHERE application_student_id=eas.id
          ORDER BY attempt DESC LIMIT 1) sub ON true
      WHERE eas.application_id=$1 AND sub.mode='teacher_scan' AND sub.status='draft'
        AND EXISTS (SELECT 1 FROM essay_submission_files f WHERE f.submission_id=sub.id)`,
    [applicationId],
  );
  let received = 0;
  const errors = [];
  for (const row of ready.rows) {
    try {
      await receiveTeacherScan(identity, row.id);
      received += 1;
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { received, errors };
}

/**
 * Exclusão definitiva: apaga a aplicação, as produções, correções, notas e os
 * arquivos no armazenamento. Exige confirmação explícita e não vale para anos
 * letivos encerrados (histórico escolar).
 */
export async function deleteEssayApplication(identity, applicationId, input) {
  requireStaff(identity);
  z.object({ confirm: z.literal(true) }).parse(input);
  const refs = await transaction(async (client) => {
    const application = await loadApplication(client, identity, applicationId, {
      lock: true,
    });
    if (!canManageEssay(identity, application.created_by))
      throw fail(
        'Somente quem aplicou ou a coordenação pode excluir esta aplicação.',
        403,
      );
    if (application.year_locked)
      throw fail(
        'O ano letivo desta turma está encerrado: a aplicação faz parte do histórico e não pode ser excluída.',
        409,
      );
    const files = await client.query(
      `SELECT f.storage_ref AS ref FROM essay_submission_files f
         JOIN essay_submissions sub ON sub.id=f.submission_id
         JOIN essay_application_students eas ON eas.id=sub.application_student_id
        WHERE eas.application_id=$1
       UNION
       SELECT unnest(ARRAY[source_ref,page_ref]) FROM essay_scan_pages WHERE application_id=$1`,
      [applicationId],
    );
    const counts = await client.query(
      `SELECT count(*)::int AS students,
              count(*) FILTER (WHERE status='published')::int AS published
         FROM essay_application_students WHERE application_id=$1`,
      [applicationId],
    );
    await client.query('DELETE FROM essay_applications WHERE id=$1', [
      applicationId,
    ]);
    await client.query(
      `INSERT INTO audit_log (institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES ($1,$2,'essay.application.delete','essay_application',$3,$4::jsonb)`,
      [
        application.institution_id,
        identity.userId,
        applicationId,
        JSON.stringify({
          title: application.prompt_title,
          className: application.class_name,
          status: application.status,
          ...counts.rows[0],
        }),
      ],
    );
    return files.rows.map((row) => row.ref).filter(Boolean);
  });
  for (const ref of refs) await deleteEssayFile(ref);
  return { deleted: true };
}
