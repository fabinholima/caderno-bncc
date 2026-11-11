// Módulo de redação: temas (propostas), textos motivadores, aplicação às
// turmas existentes e folhas de produção textual em PDF.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { createObjectStorage } from './object-storage.mjs';
import { ownsEssayApplication, teacherScope } from './ownership.mjs';
import { rubricSnapshot } from './essay-correction.mjs';
import { readScanImage } from './scan-image-storage.mjs';
import {
  ESSAY_SHEET_TEMPLATE_IDS,
  ESSAY_SHEET_TEMPLATES,
  imageWidths,
  renderEssayDocument,
} from '../renderer/essay-sheet.mjs';
import { compileAndValidate } from '../renderer/worker.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const pdfRoot = path.join(projectRoot, 'tmp', 'pdfs');
export const MAX_ESSAY_IMAGE_BYTES = 1_500_000;

const fail = (message, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });

const text = (max) => z.string().trim().max(max).default('');
const imageWidth = z.enum(Object.keys(imageWidths)).default('large');
const dataUrl = z
  .string()
  .max(Math.ceil((MAX_ESSAY_IMAGE_BYTES * 4) / 3) + 40)
  .refine(
    (value) => !value || imageBytes(value),
    'Use imagens PNG ou JPEG de até 1,5 MB.',
  );

const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().max(8000) }),
  z.object({ type: z.literal('heading'), text: z.string().max(300) }),
  z.object({ type: z.literal('quote'), text: z.string().max(4000) }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().default(false),
    items: z.array(z.string().max(1000)).max(50),
  }),
  z.object({
    type: z.literal('table'),
    header: z.boolean().default(true),
    rows: z
      .array(z.array(z.string().max(500)).min(1).max(8))
      .min(1)
      .max(40),
  }),
  z.object({
    type: z.literal('image'),
    dataUrl: dataUrl.refine(Boolean, 'Selecione a imagem.'),
    alt: text(300),
    caption: text(400),
    width: imageWidth,
  }),
]);

const motivatingTextSchema = z.object({
  title: text(200),
  content: z.array(contentBlockSchema).max(60).default([]),
  author: text(200),
  source: text(300),
  bibliographicReference: text(1000),
  url: text(1000).refine(
    (value) => !value || /^https?:\/\/\S+$/i.test(value),
    'O endereço do texto motivador deve começar com http:// ou https://.',
  ),
  imageDataUrl: dataUrl.default(''),
  imageAlt: text(300),
  imageCaption: text(400),
  imageWidth,
});

export const essayPromptSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Informe o título (mínimo de 3 caracteres).')
      .max(200),
    theme: z.string().trim().min(3, 'Informe o tema central.').max(400),
    thematicAxis: text(160),
    category: text(120),
    referenceInstitution: text(160),
    referenceYear: z.coerce
      .number()
      .int()
      .min(1900)
      .max(2100)
      .nullable()
      .default(null),
    essayType: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .default('dissertativo-argumentativo'),
    productionCommand: text(6000),
    studentGuidance: text(4000),
    minLines: z.coerce.number().int().min(1).max(90).default(7),
    maxLines: z.coerce.number().int().min(5).max(90).default(30),
    keywords: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .default([])
      .transform((items) => [
        ...new Set(items.map((item) => item.toLowerCase())),
      ]),
    status: z.enum(['draft', 'published']).default('draft'),
    motivatingTexts: z.array(motivatingTextSchema).max(12).default([]),
  })
  .refine((value) => value.minLines <= value.maxLines, {
    message: 'A quantidade mínima de linhas não pode ser maior que a máxima.',
    path: ['minLines'],
  })
  .refine(
    (value) =>
      value.motivatingTexts.every(
        (item) => item.content.length || item.imageDataUrl || item.title,
      ),
    'Cada texto motivador precisa de título, conteúdo ou imagem.',
  )
  .refine(
    (value) => value.status === 'draft' || value.productionCommand.length >= 10,
    'Para publicar, escreva o comando de produção textual.',
  );

const sheetOptionsSchema = z.object({
  template: z.enum(ESSAY_SHEET_TEMPLATE_IDS).default('enem-30-v1'),
  includeProposal: z.boolean().default(true),
  includeCriteria: z.boolean().default(true),
  duplex: z.boolean().default(false),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data válida.');

export const sheetRequestSchema = sheetOptionsSchema.extend({
  promptId: z.uuid().optional(),
  prompt: z.unknown().optional(),
  teacherName: text(160),
  className: text(120),
  date: z.union([isoDate, z.literal('')]).default(''),
  studentName: text(160),
});

const dateTime = z
  .union([z.iso.datetime({ offset: true }), isoDate, z.literal('')])
  .default('');

export const applicationSchema = sheetOptionsSchema
  .extend({
    promptId: z.uuid(),
    classId: z.uuid().optional(),
    classIds: z.array(z.uuid()).max(30).optional(),
    appliedOn: isoDate,
    opensAt: dateTime,
    dueAt: dateTime,
    availableToStudents: z.boolean().default(false),
    teacherName: text(160),
    rubricId: z.uuid().nullable().optional(),
    submissionModes: z
      .array(z.enum(['typed', 'upload']))
      .max(2)
      .default(['typed', 'upload'])
      .transform((items) => [...new Set(items)]),
    aiAssist: z.boolean().default(false),
    aiFeedbackVisible: z.boolean().default(false),
  })
  .refine(
    (value) => value.classId || value.classIds?.length,
    'Selecione ao menos uma turma.',
  );

const applicationUpdateSchema = z
  .object({
    status: z.enum(['scheduled', 'open', 'closed', 'cancelled']).optional(),
    availableToStudents: z.boolean().optional(),
    dueAt: dateTime.optional(),
    opensAt: dateTime.optional(),
    submissionModes: z
      .array(z.enum(['typed', 'upload']))
      .max(2)
      .transform((items) => [...new Set(items)])
      .optional(),
    aiAssist: z.boolean().optional(),
    aiFeedbackVisible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length, 'Nada para atualizar.');

/** Data (AAAA-MM-DD = fim do dia em Brasília) ou data e hora; null quando vazio. */
function deadline(value, endOfDay = true) {
  if (!value) return null;
  return new Date(
    value.length === 10
      ? `${value}T${endOfDay ? '23:59:00' : '00:00:00'}-03:00`
      : value,
  );
}

/** Bytes decodificados de uma data URL PNG/JPEG válida; 0 quando inválida. */
export function imageBytes(value) {
  const match = String(value).match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) return 0;
  const contents = Buffer.from(match[2], 'base64');
  if (!contents.length || contents.length > MAX_ESSAY_IMAGE_BYTES) return 0;
  const png =
    match[1] === 'png' &&
    contents.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg =
    match[1] === 'jpeg' &&
    contents[0] === 0xff &&
    contents[1] === 0xd8 &&
    contents.at(-2) === 0xff &&
    contents.at(-1) === 0xd9;
  return png || jpeg ? contents.length : 0;
}

/** Professores administram os próprios temas; gestores, todos da instituição. */
export function canManageEssay(identity, ownerId) {
  if (!identity || identity.role === 'student') return false;
  return (
    ownerId === identity.userId ||
    identity.role === 'admin' ||
    identity.role === 'coordinator' ||
    Boolean(identity.portalAdmin)
  );
}

function canSeeEssay(identity, row) {
  return row.status === 'published' || canManageEssay(identity, row.created_by);
}

function requireStaff(identity) {
  if (!identity || identity.role === 'student')
    throw fail('Este recurso é exclusivo de professores e gestores.', 403);
}

const promptColumns = `p.id,p.institution_id,p.created_by,p.title,p.theme,p.thematic_axis,p.category,
  p.reference_institution,p.reference_year,p.essay_type,p.production_command,p.student_guidance,
  p.min_lines,p.max_lines,p.keywords,p.status,p.duplicated_from,p.revision,p.created_at,p.updated_at,
  u.display_name AS author_name`;

function promptFromRow(row, identity, texts) {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    thematicAxis: row.thematic_axis,
    category: row.category,
    referenceInstitution: row.reference_institution,
    referenceYear: row.reference_year,
    essayType: row.essay_type,
    productionCommand: row.production_command,
    studentGuidance: row.student_guidance,
    minLines: row.min_lines,
    maxLines: row.max_lines,
    keywords: row.keywords,
    status: row.status,
    duplicatedFrom: row.duplicated_from,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: row.author_name,
    owned: row.created_by === identity.userId,
    canEdit: canManageEssay(identity, row.created_by),
    ...(texts ? { motivatingTexts: texts } : {}),
  };
}

function textFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    author: row.author,
    source: row.source,
    bibliographicReference: row.bibliographic_reference,
    url: row.url,
    imageSha256: row.image_sha256,
    imageAlt: row.image_alt,
    imageCaption: row.image_caption,
    imageWidth: row.image_width,
  };
}

export async function listEssayPrompts(identity, filters = {}) {
  requireStaff(identity);
  const values = [identity.institutionId];
  const where = ['p.institution_id=$1'];
  if (filters.scope === 'mine') {
    values.push(identity.userId);
    where.push(`p.created_by=$${values.length}`);
  } else if (!canManageEssay(identity, null)) {
    values.push(identity.userId);
    where.push(`(p.status='published' OR p.created_by=$${values.length})`);
  }
  const status = ['draft', 'published', 'archived'].includes(filters.status)
    ? filters.status
    : '';
  if (status) {
    values.push(status);
    where.push(`p.status=$${values.length}`);
  } else if (filters.archived !== 'true') where.push("p.status<>'archived'");
  if (filters.q?.trim()) {
    values.push(`%${filters.q.trim().slice(0, 120)}%`);
    where.push(
      `(p.title ILIKE $${values.length} OR p.theme ILIKE $${values.length})`,
    );
  }
  if (filters.keyword?.trim()) {
    values.push(`%${filters.keyword.trim().slice(0, 60)}%`);
    where.push(
      `(EXISTS (SELECT 1 FROM unnest(p.keywords) k WHERE k ILIKE $${values.length}) OR p.thematic_axis ILIKE $${values.length} OR p.production_command ILIKE $${values.length})`,
    );
  }
  for (const [key, column] of [
    ['category', 'p.category'],
    ['institution', 'p.reference_institution'],
  ]) {
    if (filters[key]?.trim()) {
      values.push(filters[key].trim());
      where.push(`${column}=$${values.length}`);
    }
  }
  if (/^\d{4}$/.test(String(filters.year || ''))) {
    values.push(Number(filters.year));
    where.push(`p.reference_year=$${values.length}`);
  }
  const result = await pool.query(
    `SELECT ${promptColumns},
            (SELECT count(*)::int FROM essay_motivating_texts t WHERE t.prompt_id=p.id) AS texts_count,
            (SELECT count(*)::int FROM essay_applications a WHERE a.prompt_id=p.id AND a.status<>'cancelled') AS applications_count
       FROM essay_prompts p JOIN users u ON u.id=p.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY p.updated_at DESC, p.id
      LIMIT 200`,
    values,
  );
  return result.rows.map((row) => ({
    ...promptFromRow(row, identity),
    textsCount: row.texts_count,
    applicationsCount: row.applications_count,
  }));
}

export async function essayPromptFilters(identity) {
  requireStaff(identity);
  const result = await pool.query(
    `SELECT array_remove(array_agg(DISTINCT NULLIF(category,'')),NULL) AS categories,
            array_remove(array_agg(DISTINCT NULLIF(reference_institution,'')),NULL) AS institutions,
            array_remove(array_agg(DISTINCT reference_year),NULL) AS years
       FROM essay_prompts
      WHERE institution_id=$1 AND (status='published' OR created_by=$2 OR $3)`,
    [identity.institutionId, identity.userId, canManageEssay(identity, null)],
  );
  const row = result.rows[0] || {};
  return {
    categories: (row.categories || []).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    ),
    institutions: (row.institutions || []).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    ),
    years: (row.years || []).sort((a, b) => b - a),
    templates: ESSAY_SHEET_TEMPLATES,
  };
}

async function loadPrompt(db, identity, promptId, { lock = false } = {}) {
  const result = await db.query(
    `SELECT ${promptColumns} FROM essay_prompts p JOIN users u ON u.id=p.created_by
      WHERE p.id=$1 AND p.institution_id=$2${lock ? ' FOR UPDATE OF p' : ''}`,
    [promptId, identity.institutionId],
  );
  const row = result.rows[0];
  if (!row || !canSeeEssay(identity, row))
    throw fail('Tema não encontrado.', 404);
  return row;
}

async function loadTexts(db, promptId) {
  const result = await db.query(
    `SELECT id,title,content,author,source,bibliographic_reference,url,image_sha256,image_alt,image_caption,
            image_width
       FROM essay_motivating_texts WHERE prompt_id=$1 ORDER BY position`,
    [promptId],
  );
  return result.rows.map(textFromRow);
}

// ---------- Imagens dos temas ----------
// Cada imagem fica uma vez só em essay_images, pelo sha256 do conteúdo (no
// storage de objetos quando configurado). Textos motivadores, cópias de tema e
// snapshots das aplicações guardam apenas o hash: {type:'image', image:<sha256>}
// nos blocos e imageSha256 no texto. O editor continua recebendo data URLs.

const imagePattern = /^data:image\/(png|jpeg);base64,(.+)$/;

export async function storeEssayImage(db, institutionId, value, options = {}) {
  const match = String(value).match(imagePattern);
  if (!match || !imageBytes(value))
    throw fail('Use imagens PNG ou JPEG de até 1,5 MB.');
  const contents = Buffer.from(match[2], 'base64');
  const sha256 = createHash('sha256').update(contents).digest('hex');
  const existing = await db.query(
    'SELECT 1 FROM essay_images WHERE institution_id=$1 AND sha256=$2',
    [institutionId, sha256],
  );
  if (existing.rowCount) return sha256;
  const mimeType = `image/${match[1]}`;
  const storage =
    'storage' in options ? options.storage : createObjectStorage();
  const key = storage
    ? await storage.put(
        `essay-images/${institutionId}/${sha256}.${match[1] === 'png' ? 'png' : 'jpg'}`,
        contents,
        { contentType: mimeType },
      )
    : null;
  await db.query(
    `INSERT INTO essay_images (institution_id,sha256,mime_type,byte_size,data,storage_ref)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [
      institutionId,
      sha256,
      mimeType,
      contents.length,
      key ? null : contents,
      key ? `${storage.provider}:${key}` : null,
    ],
  );
  return sha256;
}

/** Hashes das imagens referenciadas pelos textos motivadores. */
export function essayImageRefs(texts = []) {
  const refs = new Set();
  for (const item of texts) {
    if (item.imageSha256) refs.add(item.imageSha256);
    for (const block of item.content || [])
      if (block.type === 'image' && block.image) refs.add(block.image);
  }
  return [...refs];
}

/** sha256 -> {mimeType, contents} das imagens pedidas. */
async function loadEssayImages(db, institutionId, refs) {
  const images = new Map();
  if (!refs.length) return images;
  const result = await db.query(
    `SELECT sha256,mime_type,data,storage_ref FROM essay_images
      WHERE institution_id=$1 AND sha256=ANY($2::text[])`,
    [institutionId, refs],
  );
  for (const row of result.rows)
    images.set(row.sha256, {
      mimeType: row.mime_type,
      contents: await readScanImage(row.storage_ref, row.data),
    });
  return images;
}

async function storeTextImages(db, institutionId, texts) {
  const stored = [];
  for (const { imageDataUrl, ...item } of texts) {
    const content = [];
    for (const block of item.content) {
      if (block.type !== 'image') content.push(block);
      else {
        const { dataUrl, ...rest } = block;
        content.push({
          ...rest,
          image: await storeEssayImage(db, institutionId, dataUrl),
        });
      }
    }
    stored.push({
      ...item,
      content,
      imageSha256: imageDataUrl
        ? await storeEssayImage(db, institutionId, imageDataUrl)
        : null,
    });
  }
  return stored;
}

// Devolve as imagens como data URLs, no formato que o editor envia.
async function textsWithDataUrls(db, institutionId, texts) {
  const images = await loadEssayImages(
    db,
    institutionId,
    essayImageRefs(texts),
  );
  const dataUrl = (sha256) => {
    const image = images.get(sha256);
    return image
      ? `data:${image.mimeType};base64,${image.contents.toString('base64')}`
      : '';
  };
  return texts.map(({ imageSha256, ...item }) => ({
    ...item,
    content: (item.content || []).map(({ image, ...block }) =>
      block.type === 'image' ? { ...block, dataUrl: dataUrl(image) } : block,
    ),
    imageDataUrl: imageSha256 ? dataUrl(imageSha256) : '',
  }));
}

export async function getEssayPrompt(identity, promptId) {
  requireStaff(identity);
  const row = await loadPrompt(pool, identity, promptId);
  const texts = await loadTexts(pool, promptId);
  return promptFromRow(
    row,
    identity,
    await textsWithDataUrls(pool, identity.institutionId, texts),
  );
}

async function insertTexts(db, institutionId, promptId, texts) {
  const stored = await storeTextImages(db, institutionId, texts);
  for (const [index, item] of stored.entries()) {
    await db.query(
      `INSERT INTO essay_motivating_texts
         (prompt_id,position,title,content,author,source,bibliographic_reference,url,image_sha256,image_alt,image_caption,image_width)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        promptId,
        index + 1,
        item.title,
        JSON.stringify(item.content),
        item.author,
        item.source,
        item.bibliographicReference,
        item.url,
        item.imageSha256,
        item.imageAlt,
        item.imageCaption,
        item.imageWidth,
      ],
    );
  }
}

const promptValues = (value) => [
  value.title,
  value.theme,
  value.thematicAxis,
  value.category,
  value.referenceInstitution,
  value.referenceYear,
  value.essayType,
  value.productionCommand,
  value.studentGuidance,
  value.minLines,
  value.maxLines,
  value.keywords,
  value.status,
];

export async function createEssayPrompt(identity, input) {
  requireStaff(identity);
  const value = essayPromptSchema.parse(input);
  const id = await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO essay_prompts
         (title,theme,thematic_axis,category,reference_institution,reference_year,essay_type,
          production_command,student_guidance,min_lines,max_lines,keywords,status,institution_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [...promptValues(value), identity.institutionId, identity.userId],
    );
    await insertTexts(
      client,
      identity.institutionId,
      result.rows[0].id,
      value.motivatingTexts,
    );
    return result.rows[0].id;
  });
  return getEssayPrompt(identity, id);
}

export async function updateEssayPrompt(identity, promptId, input) {
  requireStaff(identity);
  const value = essayPromptSchema.parse(input);
  const revision = z.coerce.number().int().positive().parse(input?.revision);
  await transaction(async (client) => {
    const row = await loadPrompt(client, identity, promptId, { lock: true });
    if (!canManageEssay(identity, row.created_by))
      throw fail(
        'Somente o autor ou a coordenação pode editar este tema.',
        403,
      );
    if (row.status === 'archived')
      throw fail('Restaure o tema arquivado antes de editá-lo.', 409);
    if (row.revision !== revision)
      throw fail(
        'O tema foi alterado em outra janela. Recarregue antes de salvar.',
        409,
      );
    await client.query(
      `UPDATE essay_prompts SET title=$1,theme=$2,thematic_axis=$3,category=$4,reference_institution=$5,
              reference_year=$6,essay_type=$7,production_command=$8,student_guidance=$9,min_lines=$10,
              max_lines=$11,keywords=$12,status=$13,revision=revision+1,updated_at=now()
        WHERE id=$14`,
      [...promptValues(value), promptId],
    );
    await client.query(
      'DELETE FROM essay_motivating_texts WHERE prompt_id=$1',
      [promptId],
    );
    await insertTexts(
      client,
      identity.institutionId,
      promptId,
      value.motivatingTexts,
    );
  });
  return getEssayPrompt(identity, promptId);
}

export async function duplicateEssayPrompt(identity, promptId) {
  requireStaff(identity);
  const id = await transaction(async (client) => {
    const row = await loadPrompt(client, identity, promptId);
    const copy = await client.query(
      `INSERT INTO essay_prompts
         (institution_id,created_by,title,theme,thematic_axis,category,reference_institution,reference_year,
          essay_type,production_command,student_guidance,min_lines,max_lines,keywords,status,duplicated_from)
       SELECT institution_id,$2,left('Cópia de ' || title,200),theme,thematic_axis,category,reference_institution,
              reference_year,essay_type,production_command,student_guidance,min_lines,max_lines,keywords,'draft',id
         FROM essay_prompts WHERE id=$1 RETURNING id`,
      [row.id, identity.userId],
    );
    await client.query(
      `INSERT INTO essay_motivating_texts
         (prompt_id,position,title,content,author,source,bibliographic_reference,url,image_sha256,image_alt,image_caption,image_width)
       SELECT $2,position,title,content,author,source,bibliographic_reference,url,image_sha256,image_alt,image_caption,image_width
         FROM essay_motivating_texts WHERE prompt_id=$1`,
      [row.id, copy.rows[0].id],
    );
    return copy.rows[0].id;
  });
  return getEssayPrompt(identity, id);
}

export async function setEssayPromptStatus(identity, promptId, input) {
  requireStaff(identity);
  const { status } = z
    .object({ status: z.enum(['draft', 'published', 'archived']) })
    .parse(input);
  await transaction(async (client) => {
    const row = await loadPrompt(client, identity, promptId, { lock: true });
    if (!canManageEssay(identity, row.created_by))
      throw fail(
        'Somente o autor ou a coordenação pode alterar este tema.',
        403,
      );
    if (status === 'published' && row.production_command.trim().length < 10)
      throw fail('Para publicar, escreva o comando de produção textual.');
    await client.query(
      'UPDATE essay_prompts SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1',
      [promptId, status],
    );
  });
  return getEssayPrompt(identity, promptId);
}

// ---------- PDF ----------

const pdfCache = new Map();
const activeUsers = new Set();
let activeCount = 0;
const maxConcurrent = Number(process.env.PREVIEW_CONCURRENCY || 2);

async function withRenderSlot(userId, callback) {
  if (activeUsers.has(userId) || activeCount >= maxConcurrent)
    throw Object.assign(
      fail(
        activeUsers.has(userId)
          ? 'Já existe uma folha sendo gerada para este usuário.'
          : 'O gerador de PDF está ocupado. Tente novamente em alguns segundos.',
        429,
      ),
      { retryAfter: 5 },
    );
  activeUsers.add(userId);
  activeCount += 1;
  try {
    return await callback();
  } finally {
    activeUsers.delete(userId);
    activeCount -= 1;
  }
}

async function writeImage(directory, name, value) {
  const match = String(value).match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (!match || !imageBytes(value)) return '';
  const fileName = `${name}.${match[1] === 'png' ? 'png' : 'jpg'}`;
  await writeFile(
    path.join(directory, fileName),
    Buffer.from(match[2], 'base64'),
  );
  return fileName;
}

async function writeStoredImage(directory, name, image) {
  if (!image) return '';
  const fileName = `${name}.${image.mimeType === 'image/png' ? 'png' : 'jpg'}`;
  await writeFile(path.join(directory, fileName), image.contents);
  return fileName;
}

/**
 * Grava as imagens do tema como arquivos e devolve o tema para o ConTeXt.
 * Aceita data URLs (rascunho do editor) ou hashes, resolvidos em `images`.
 */
export async function materializeEssayImages(
  prompt,
  directory,
  images = new Map(),
) {
  const texts = [];
  for (const [index, item] of (prompt.motivatingTexts || []).entries()) {
    const content = [];
    for (const [blockIndex, block] of (item.content || []).entries()) {
      if (block.type !== 'image') content.push(block);
      else {
        const name = `texto-${index + 1}-imagem-${blockIndex + 1}`;
        const file = block.dataUrl
          ? await writeImage(directory, name, block.dataUrl)
          : await writeStoredImage(directory, name, images.get(block.image));
        if (file)
          content.push({
            ...block,
            dataUrl: undefined,
            image: undefined,
            file,
          });
      }
    }
    const name = `texto-${index + 1}`;
    texts.push({
      ...item,
      content,
      imageDataUrl: undefined,
      imageSha256: undefined,
      imageFile: item.imageDataUrl
        ? await writeImage(directory, name, item.imageDataUrl)
        : await writeStoredImage(directory, name, images.get(item.imageSha256)),
    });
  }
  return { ...prompt, motivatingTexts: texts };
}

export async function renderEssayPdf({
  userId,
  institutionId,
  prompt,
  options,
  copies,
  logoDataUrl = '',
}) {
  const key = createHash('sha256')
    .update(JSON.stringify({ prompt, options, copies, logoDataUrl }))
    .digest('hex');
  const cached = pdfCache.get(key);
  if (cached) return cached;
  return withRenderSlot(userId, async () => {
    await mkdir(pdfRoot, { recursive: true });
    const directory = await mkdtemp(path.join(pdfRoot, 'redacao-'));
    try {
      const document = renderEssayDocument({
        ...options,
        prompt: await materializeEssayImages(
          prompt,
          directory,
          await loadEssayImages(
            pool,
            institutionId,
            essayImageRefs(prompt.motivatingTexts),
          ),
        ),
        logoFile: logoDataUrl
          ? await writeImage(directory, 'logotipo', logoDataUrl)
          : '',
        copies,
      });
      await writeFile(path.join(directory, 'redacao.tex'), document, 'utf8');
      await compileAndValidate(
        path.join(directory, 'redacao.tex'),
        directory,
        'redacao',
      );
      const contents = await readFile(path.join(directory, 'redacao.pdf'));
      pdfCache.set(key, contents);
      while (pdfCache.size > 16) pdfCache.delete(pdfCache.keys().next().value);
      return contents;
    } catch (error) {
      console.error('Falha ao gerar folha de redação', error?.message);
      throw fail('Não foi possível gerar o PDF da folha de redação.', 500);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

// Cabeçalho: escola da turma; sem turma, a escola padrão do professor.
async function headerSchool(userId, classId = null) {
  const result = await pool.query(
    `SELECT name,logo_data_url,0 AS priority FROM educator_schools
      WHERE id=(SELECT school_id FROM classes WHERE id=$2::uuid)
     UNION ALL
     (SELECT name,logo_data_url,1 FROM educator_schools WHERE user_id=$1
       ORDER BY is_header_default DESC,created_at LIMIT 1)
     ORDER BY priority LIMIT 1`,
    [userId, classId],
  );
  return {
    name: result.rows[0]?.name || '',
    logoDataUrl: result.rows[0]?.logo_data_url || '',
  };
}

/** Prévia e geração avulsa: tema salvo (promptId) ou rascunho do editor (prompt). */
export async function essaySheetPdf(identity, input) {
  requireStaff(identity);
  const request = sheetRequestSchema.parse(input);
  let prompt;
  // Tema salvo: as imagens seguem como hashes e são lidas uma vez no render.
  if (request.promptId) {
    const row = await loadPrompt(pool, identity, request.promptId);
    prompt = promptFromRow(
      row,
      identity,
      await loadTexts(pool, request.promptId),
    );
  } else if (request.prompt)
    prompt = essayPromptSchema.parse({ ...request.prompt, status: 'draft' });
  else throw fail('Selecione um tema.');
  const school = await headerSchool(identity.userId);
  return renderEssayPdf({
    userId: identity.userId,
    institutionId: identity.institutionId,
    prompt: sheetPrompt(prompt),
    options: {
      template: request.template,
      includeProposal: request.includeProposal,
      includeCriteria: request.includeCriteria,
      duplex: request.duplex,
      teacherName: request.teacherName,
      className: request.className,
      date: request.date,
      institutionName: school.name || identity.institutionName || '',
    },
    copies: [{ studentName: request.studentName }],
    logoDataUrl: school.logoDataUrl,
  });
}

function sheetPrompt(prompt) {
  return {
    title: prompt.title,
    theme: prompt.theme,
    thematicAxis: prompt.thematicAxis,
    category: prompt.category,
    referenceInstitution: prompt.referenceInstitution,
    referenceYear: prompt.referenceYear,
    essayType: prompt.essayType,
    productionCommand: prompt.productionCommand,
    studentGuidance: prompt.studentGuidance,
    minLines: prompt.minLines,
    maxLines: prompt.maxLines,
    motivatingTexts: (prompt.motivatingTexts || []).map(
      ({ id: _id, ...item }) => item,
    ),
  };
}

// ---------- Aplicação às turmas ----------

export async function createEssayApplication(identity, input) {
  requireStaff(identity);
  const value = applicationSchema.parse(input);
  const classIds = [
    ...new Set([value.classId, ...(value.classIds || [])].filter(Boolean)),
  ];
  const dueAt = deadline(value.dueAt);
  const opensAt = deadline(value.opensAt, false);
  if (dueAt && dueAt < new Date(`${value.appliedOn}T00:00:00-03:00`))
    throw fail('O prazo de entrega não pode ser anterior à data de aplicação.');
  if (dueAt && opensAt && dueAt <= opensAt)
    throw fail('O prazo de entrega precisa ser depois da liberação.');
  if (!value.submissionModes.length)
    throw fail('Escolha ao menos uma forma de entrega.');
  const ids = await transaction(async (client) => {
    const prompt = await loadPrompt(client, identity, value.promptId);
    if (prompt.status === 'archived')
      throw fail('Temas arquivados não podem ser aplicados.', 409);
    const classes = await client.query(
      'SELECT id,class_year_locked(id) AS locked FROM classes WHERE id=ANY($1::uuid[]) AND institution_id=$2',
      [classIds, identity.institutionId],
    );
    if (classes.rowCount !== classIds.length)
      throw fail('Turma não encontrada.', 404);
    if (classes.rows.some((row) => row.locked))
      throw fail('Uma das turmas pertence a um ano letivo encerrado.', 409);
    const rubric = await rubricSnapshot(client, identity, value.rubricId);
    const snapshot = sheetPrompt(
      promptFromRow(prompt, identity, await loadTexts(client, prompt.id)),
    );
    const created = [];
    for (const classId of classIds) {
      const application = await client.query(
        `INSERT INTO essay_applications
           (institution_id,prompt_id,class_id,created_by,applied_on,due_at,status,available_to_students,
            sheet_options,prompt_snapshot,prompt_revision,rubric_id,rubric_snapshot,opens_at,submission_modes,
            ai_assist,ai_feedback_visible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [
          identity.institutionId,
          prompt.id,
          classId,
          identity.userId,
          value.appliedOn,
          dueAt,
          value.availableToStudents ? 'open' : 'scheduled',
          value.availableToStudents,
          JSON.stringify({
            template: value.template,
            includeProposal: value.includeProposal,
            includeCriteria: value.includeCriteria,
            duplex: value.duplex,
            teacherName: value.teacherName || identity.displayName || '',
          }),
          JSON.stringify(snapshot),
          prompt.revision,
          rubric.id,
          JSON.stringify(rubric.snapshot),
          opensAt,
          value.submissionModes,
          value.aiAssist,
          value.aiFeedbackVisible,
        ],
      );
      await client.query(
        `INSERT INTO essay_application_students (application_id,student_id,student_number)
         SELECT $1,s.id,ce.number FROM class_enrollments ce
           JOIN students s ON s.id=ce.student_id AND s.institution_id=$3 AND s.active
          WHERE ce.class_id=$2`,
        [application.rows[0].id, classId, identity.institutionId],
      );
      created.push(application.rows[0].id);
    }
    return created;
  });
  const first = await getEssayApplication(identity, ids[0]);
  return { ...first, createdIds: ids };
}

const applicationColumns = `a.id,a.prompt_id,a.class_id,a.applied_on::text AS applied_on,a.due_at,a.status,
  a.available_to_students,a.sheet_options,a.prompt_revision,a.created_at,a.created_by,
  a.prompt_snapshot->>'title' AS prompt_title,a.prompt_snapshot->>'theme' AS prompt_theme,
  c.name AS class_name,c.grade AS class_grade,c.school_year,u.display_name AS created_by_name,
  (SELECT count(*)::int FROM essay_application_students s WHERE s.application_id=a.id) AS students_count,
  (SELECT count(*)::int FROM essay_application_students s WHERE s.application_id=a.id AND s.status NOT IN ('pending','draft','absent')) AS submitted_count,
  (SELECT count(*)::int FROM essay_application_students s WHERE s.application_id=a.id AND s.status='published') AS published_count,
  (SELECT count(*)::int FROM essay_application_students s WHERE s.application_id=a.id AND s.status='awaiting_approval') AS approval_count,
  a.opens_at,a.submission_modes,a.ai_assist,a.ai_feedback_visible,a.rubric_snapshot->>'name' AS rubric_name`;

function applicationFromRow(row, identity) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    promptTitle: row.prompt_title,
    promptTheme: row.prompt_theme,
    promptRevision: row.prompt_revision,
    classId: row.class_id,
    className: row.class_name,
    classGrade: row.class_grade,
    schoolYear: row.school_year,
    appliedOn: row.applied_on,
    dueAt: row.due_at,
    status: row.status,
    availableToStudents: row.available_to_students,
    sheetOptions: row.sheet_options,
    studentsCount: row.students_count,
    submittedCount: row.submitted_count,
    publishedCount: row.published_count,
    awaitingApprovalCount: row.approval_count,
    opensAt: row.opens_at,
    submissionModes: row.submission_modes,
    aiAssist: row.ai_assist,
    aiFeedbackVisible: row.ai_feedback_visible,
    rubricName: row.rubric_name,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    canEdit: canManageEssay(identity, row.created_by),
  };
}

export async function listEssayApplications(identity, filters = {}) {
  requireStaff(identity);
  const values = [identity.institutionId, teacherScope(identity)];
  const where = ['a.institution_id=$1', ownsEssayApplication('a', '$2')];
  for (const [key, column] of [
    ['classId', 'a.class_id'],
    ['promptId', 'a.prompt_id'],
  ]) {
    if (z.uuid().safeParse(filters[key]).success) {
      values.push(filters[key]);
      where.push(`${column}=$${values.length}`);
    }
  }
  const result = await pool.query(
    `SELECT ${applicationColumns} FROM essay_applications a
       JOIN classes c ON c.id=a.class_id JOIN users u ON u.id=a.created_by
      WHERE ${where.join(' AND ')} ORDER BY a.applied_on DESC,a.created_at DESC LIMIT 300`,
    values,
  );
  return result.rows.map((row) => applicationFromRow(row, identity));
}

async function loadApplication(db, identity, applicationId) {
  const result = await db.query(
    `SELECT ${applicationColumns},a.prompt_snapshot FROM essay_applications a
       JOIN classes c ON c.id=a.class_id JOIN users u ON u.id=a.created_by
      WHERE a.id=$1 AND a.institution_id=$2`,
    [applicationId, identity.institutionId],
  );
  if (!result.rowCount) throw fail('Aplicação não encontrada.', 404);
  return result.rows[0];
}

async function applicationStudents(db, applicationId) {
  const result = await db.query(
    `SELECT eas.id,eas.student_id,eas.student_number,eas.status,s.name,s.registration
       FROM essay_application_students eas JOIN students s ON s.id=eas.student_id
      WHERE eas.application_id=$1 ORDER BY eas.student_number NULLS LAST,s.name`,
    [applicationId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    number: row.student_number,
    name: row.name,
    registration: row.registration,
    status: row.status,
  }));
}

export async function getEssayApplication(identity, applicationId) {
  requireStaff(identity);
  const row = await loadApplication(pool, identity, applicationId);
  return {
    ...applicationFromRow(row, identity),
    students: await applicationStudents(pool, applicationId),
  };
}

export async function updateEssayApplication(identity, applicationId, input) {
  requireStaff(identity);
  const value = applicationUpdateSchema.parse(input);
  await transaction(async (client) => {
    const row = await loadApplication(client, identity, applicationId);
    if (!canManageEssay(identity, row.created_by))
      throw fail(
        'Somente quem aplicou ou a coordenação pode alterar esta aplicação.',
        403,
      );
    if (row.status === 'cancelled')
      throw fail('Aplicações canceladas não podem ser alteradas.', 409);
    const status =
      value.status ??
      (value.availableToStudents && row.status === 'scheduled'
        ? 'open'
        : row.status);
    const dueAt =
      value.dueAt === undefined ? row.due_at : deadline(value.dueAt);
    const opensAt =
      value.opensAt === undefined
        ? row.opens_at
        : deadline(value.opensAt, false);
    if (dueAt && opensAt && new Date(dueAt) <= new Date(opensAt))
      throw fail('O prazo de entrega precisa ser depois da liberação.');
    if (value.submissionModes && !value.submissionModes.length)
      throw fail('Escolha ao menos uma forma de entrega.');
    await client.query(
      `UPDATE essay_applications SET status=$2,available_to_students=$3,due_at=$4,opens_at=$5,
              submission_modes=COALESCE($6,submission_modes),ai_assist=COALESCE($7,ai_assist),
              ai_feedback_visible=COALESCE($8,ai_feedback_visible),updated_at=now() WHERE id=$1`,
      [
        applicationId,
        status,
        status === 'cancelled'
          ? false
          : (value.availableToStudents ?? row.available_to_students),
        dueAt,
        opensAt,
        value.submissionModes ?? null,
        value.aiAssist ?? null,
        value.aiFeedbackVisible ?? null,
      ],
    );
  });
  return getEssayApplication(identity, applicationId);
}

function formatClassName(row) {
  return [row.class_grade, row.class_name].filter(Boolean).join(' — ');
}

/** Folhas individuais: a proposta uma vez e uma folha nominal por aluno. */
export async function essayApplicationSheetsPdf(
  identity,
  applicationId,
  { studentId } = {},
) {
  requireStaff(identity);
  const row = await loadApplication(pool, identity, applicationId);
  if (row.status === 'cancelled') throw fail('Aplicação cancelada.', 409);
  const students = (await applicationStudents(pool, applicationId)).filter(
    (student) => !studentId || student.studentId === studentId,
  );
  if (!students.length)
    throw fail('Nenhum aluno encontrado nesta aplicação.', 404);
  const school = await headerSchool(row.created_by, row.class_id);
  const options = row.sheet_options || {};
  return renderEssayPdf({
    userId: identity.userId,
    institutionId: identity.institutionId,
    prompt: row.prompt_snapshot,
    options: {
      template: options.template,
      includeProposal: options.includeProposal !== false,
      includeCriteria: options.includeCriteria !== false,
      duplex: Boolean(options.duplex),
      teacherName: options.teacherName || row.created_by_name,
      className: formatClassName(row),
      date: row.applied_on,
      institutionName: school.name || identity.institutionName || '',
    },
    copies: students.map((student) => ({
      studentName: student.number
        ? `${student.name} (nº ${student.number})`
        : student.name,
    })),
    logoDataUrl: school.logoDataUrl,
  });
}

// ---------- Portal do aluno (somente leitura) ----------

const studentApplicationsQuery = `
  SELECT DISTINCT ON (a.id) a.id,a.applied_on::text AS applied_on,a.due_at,a.status,a.prompt_snapshot->>'title' AS title,
         a.prompt_snapshot->>'theme' AS theme,c.name AS class_name,c.grade AS class_grade,eas.status AS submission_status,
         s.name AS student_name,eas.student_number,a.sheet_options,a.prompt_snapshot,a.created_by,a.class_id,a.institution_id,
         u.display_name AS teacher_name
    FROM student_account_links l
    JOIN students s ON s.id=l.student_id AND s.active
    JOIN class_join_requests jr ON jr.user_id=l.user_id AND jr.student_id=l.student_id AND jr.status='approved'
    JOIN class_enrollments ce ON ce.student_id=l.student_id AND ce.class_id=jr.class_id
    JOIN essay_applications a ON a.class_id=ce.class_id AND a.institution_id=l.institution_id
         AND a.available_to_students AND a.status IN ('open','closed')
    JOIN essay_application_students eas ON eas.application_id=a.id AND eas.student_id=l.student_id
    JOIN classes c ON c.id=a.class_id
    JOIN users u ON u.id=a.created_by
   WHERE l.user_id=$1`;

export async function myEssayApplications(identity) {
  if (identity?.role !== 'student')
    throw fail('Recurso exclusivo do portal do aluno.', 403);
  const result = await pool.query(`${studentApplicationsQuery} ORDER BY a.id`, [
    identity.userId,
  ]);
  return result.rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      theme: row.theme,
      className: formatClassName(row),
      appliedOn: row.applied_on,
      dueAt: row.due_at,
      status: row.status,
      submissionStatus: row.submission_status,
    }))
    .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
}

export async function myEssayProposalPdf(identity, applicationId) {
  if (identity?.role !== 'student')
    throw fail('Recurso exclusivo do portal do aluno.', 403);
  const result = await pool.query(`${studentApplicationsQuery} AND a.id=$2`, [
    identity.userId,
    applicationId,
  ]);
  const row = result.rows[0];
  if (!row) throw fail('Proposta não encontrada.', 404);
  const school = await headerSchool(row.created_by, row.class_id);
  const options = row.sheet_options || {};
  return renderEssayPdf({
    userId: identity.userId,
    institutionId: row.institution_id,
    prompt: row.prompt_snapshot,
    options: {
      template: options.template,
      includeProposal: true,
      includeCriteria: options.includeCriteria !== false,
      teacherName: options.teacherName || row.teacher_name,
      className: formatClassName(row),
      date: row.applied_on,
      institutionName: school.name,
    },
    copies: [
      {
        studentName: row.student_number
          ? `${row.student_name} (nº ${row.student_number})`
          : row.student_name,
      },
    ],
    logoDataUrl: school.logoDataUrl,
  });
}
