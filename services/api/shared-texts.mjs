// Textos-base compartilhados entre questões (ex.: um texto para os itens 1 a 5).
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { richContentSchema } from './questions.mjs';
import { prepareChemicalStructureBlocks } from './chemical-structures.mjs';

export const sharedTextSchema = z.object({
  title: z.string().trim().max(300).default(''),
  source: z.string().trim().max(500).default(''),
  content: richContentSchema,
});

const sharedTextQuerySchema = z.string().trim().max(200).default('');

function plainPreview(content = []) {
  return content
    .map((node) =>
      node?.type === 'image'
        ? `[Imagem: ${node.alt || ''}]`
        : node?.text || node?.caption || (node?.items || []).join(' ') || '',
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 280);
}

function formatSharedText(row) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    preview: plainPreview(row.content),
    questionCount: Number(row.question_count || 0),
    updatedAt: row.updated_at,
  };
}

const questionCountSql = `(
  SELECT COUNT(*)::int FROM questions q
  JOIN question_revisions qr
    ON qr.question_id = q.id AND qr.revision = q.current_revision
  WHERE qr.shared_text_id = t.id AND q.status <> 'archived'
)`;

export async function listSharedTexts({ institutionId, query = '' }) {
  const search = sharedTextQuerySchema.parse(query);
  const result = await pool.query(
    `SELECT t.id, t.title, t.source, t.content, t.updated_at,
            ${questionCountSql} AS question_count
     FROM question_shared_texts t
     WHERE t.institution_id = $1
       AND ($2 = '' OR t.title ILIKE '%' || $2 || '%' OR t.source ILIKE '%' || $2 || '%'
            OR t.content::text ILIKE '%' || $2 || '%')
     ORDER BY t.updated_at DESC
     LIMIT 50`,
    [institutionId, search],
  );
  return result.rows.map(formatSharedText);
}

export async function getSharedText({ institutionId, id }) {
  const result = await pool.query(
    `SELECT t.id, t.title, t.source, t.content, t.updated_at,
            ${questionCountSql} AS question_count
     FROM question_shared_texts t
     WHERE t.id = $1 AND t.institution_id = $2`,
    [id, institutionId],
  );
  if (!result.rowCount) return null;
  const questions = await pool.query(
    `SELECT q.id, q.public_code, q.status, qr.type, qr.statement
     FROM questions q
     JOIN question_revisions qr
       ON qr.question_id = q.id AND qr.revision = q.current_revision
     WHERE qr.shared_text_id = $1 AND q.status <> 'archived'
     ORDER BY q.public_code`,
    [id],
  );
  const row = result.rows[0];
  return {
    ...formatSharedText(row),
    content: row.content,
    questions: questions.rows.map((question) => ({
      id: question.id,
      code: question.public_code,
      status: question.status,
      type: question.type,
      statement: plainPreview(question.statement),
    })),
  };
}

export async function createSharedText({ institutionId, userId, input }) {
  const value = sharedTextSchema.parse(input);
  const content = await prepareChemicalStructureBlocks(value.content);
  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO question_shared_texts (institution_id, title, source, content, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id, title, source, content, updated_at, 0 AS question_count`,
      [
        institutionId,
        value.title,
        value.source,
        JSON.stringify(content),
        userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'shared_text.created','question_shared_text',$3,'{}'::jsonb)`,
      [institutionId, userId, result.rows[0].id],
    );
    return { ...formatSharedText(result.rows[0]), content };
  });
}

export async function updateSharedText({ institutionId, userId, id, input }) {
  const value = sharedTextSchema.parse(input);
  const content = await prepareChemicalStructureBlocks(value.content);
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE question_shared_texts t
       SET title = $3, source = $4, content = $5::jsonb, updated_at = now()
       WHERE t.id = $1 AND t.institution_id = $2
       RETURNING t.id, t.title, t.source, t.content, t.updated_at,
                 ${questionCountSql} AS question_count`,
      [id, institutionId, value.title, value.source, JSON.stringify(content)],
    );
    if (!result.rowCount)
      throw Object.assign(new Error('Texto-base não encontrado.'), {
        statusCode: 404,
      });
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'shared_text.updated','question_shared_text',$3,'{}'::jsonb)`,
      [institutionId, userId, id],
    );
    return { ...formatSharedText(result.rows[0]), content };
  });
}

/** Conteúdo completo dos textos-base, para a prévia e o snapshot da prova. */
export async function loadSharedTexts(client, ids, institutionIds = null) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const result = await client.query(
    `SELECT id, title, source, content FROM question_shared_texts
     WHERE id = ANY($1::uuid[])
       AND ($2::uuid[] IS NULL OR institution_id = ANY($2::uuid[]))`,
    [unique, institutionIds],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    source: row.source,
    content: row.content,
  }));
}
