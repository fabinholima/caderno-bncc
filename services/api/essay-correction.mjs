// Correção de redações: produção do aluno (texto digitado, fotos/PDF ou
// digitalização enviada pelo professor), transcrição, correção manual com
// apoio opcional da IA, aprovação e publicação. A IA só sugere; a nota oficial
// é sempre a do professor, validada e calculada aqui.
//
// Situações da produção (essay_application_students.status):
//   pending → draft → submitted → awaiting_ocr / awaiting_ai → awaiting_grading
//   → grading → awaiting_approval → published; returned = devolvida para reescrita.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import {
  createFilesystemStorage,
  createObjectStorage,
} from './object-storage.mjs';
import { ownsEssayApplication, teacherScope } from './ownership.mjs';
import { computeGrading, countLines, countWords } from './essay-grading.mjs';
import { ESSAY_PROMPT_VERSION, essayAiProvider } from './essay-ai.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export const MAX_ESSAY_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_ESSAY_FILES = 10;
export const MAX_TYPED_CHARS = 20000;
const PAGE_SIZE = 30;

const fail = (message, statusCode = 422, extra = {}) =>
  Object.assign(new Error(message), { statusCode, ...extra });

export const ENTRY_STATUSES = [
  'pending',
  'draft',
  'submitted',
  'awaiting_ocr',
  'awaiting_ai',
  'awaiting_grading',
  'grading',
  'awaiting_approval',
  'published',
  'returned',
  'absent',
];
const RECEIVED = [
  'submitted',
  'awaiting_ocr',
  'awaiting_ai',
  'awaiting_grading',
  'grading',
];

function requireStaff(identity) {
  if (!identity || identity.role === 'student')
    throw fail('Este recurso é exclusivo de professores e gestores.', 403);
}

function requireStudent(identity) {
  if (identity?.role !== 'student')
    throw fail('Recurso exclusivo do portal do aluno.', 403);
}

async function audit(db, identity, institutionId, action, entryId, metadata) {
  await db.query(
    `INSERT INTO audit_log (institution_id,user_id,action,entity_type,entity_id,metadata)
     VALUES ($1,$2,$3,'essay_entry',$4,$5::jsonb)`,
    [
      institutionId,
      identity.userId,
      action,
      entryId,
      JSON.stringify(metadata || {}),
    ],
  );
}

// ---------- Armazenamento dos arquivos ----------

/** Pasta local quando não há storage configurado (desenvolvimento). */
function localRoot(env) {
  return (
    env.FILE_STORAGE_DIR ||
    env.EXAM_STORAGE_DIR ||
    env.ESSAY_FILE_DIR ||
    path.join(projectRoot, 'var', 'essay-files')
  );
}

/** Arquivos da redação nunca vão para o banco: storage ou pasta local. */
export function essayFileStorage(env = process.env) {
  return (
    createObjectStorage(env) ??
    createFilesystemStorage({ root: localRoot(env) })
  );
}

function storageForRef(ref, env = process.env) {
  const separator = String(ref).indexOf(':');
  const provider = ref.slice(0, separator);
  if (provider === 'filesystem')
    return createFilesystemStorage({ root: localRoot(env) });
  const storage = createObjectStorage({
    ...env,
    FILE_STORAGE_PROVIDER: provider,
  });
  if (!storage) throw new Error('Armazenamento do arquivo não configurado.');
  return storage;
}

export async function readEssayFile(ref, env = process.env) {
  return storageForRef(ref, env).get(ref.slice(ref.indexOf(':') + 1));
}

export async function deleteEssayFile(ref, env = process.env) {
  await storageForRef(ref, env)
    .delete(ref.slice(ref.indexOf(':') + 1))
    .catch((error) =>
      console.error('Falha ao remover arquivo de redação:', error.message),
    );
}

const fileTypes = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};

/** Decodifica e confere tipo, assinatura e tamanho do arquivo enviado. */
export function decodeEssayFile(
  dataUrl,
  { maxBytes = MAX_ESSAY_FILE_BYTES } = {},
) {
  const match = String(dataUrl || '').match(
    /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) throw fail('Envie imagens PNG, JPEG ou um arquivo PDF.');
  const contents = Buffer.from(match[2], 'base64');
  if (!contents.length) throw fail('O arquivo está vazio.');
  if (contents.length > maxBytes)
    throw fail(
      `Cada arquivo pode ter no máximo ${Math.round(maxBytes / 1048576)} MB.`,
      413,
    );
  const mimeType = match[1];
  const valid =
    mimeType === 'image/png'
      ? contents.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : mimeType === 'image/jpeg'
        ? contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff
        : contents.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!valid)
    throw fail('O conteúdo do arquivo não corresponde ao tipo informado.');
  return {
    mimeType,
    contents,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

// ---------- Modelos de correção ----------

function rubricFromRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    version: row.version,
    description: row.description,
    source: row.source,
    maxScore: row.max_score,
    criteria: row.criteria,
    annulmentReasons: row.annulment_reasons,
    system: !row.institution_id,
  };
}

export async function listEssayRubrics(identity) {
  requireStaff(identity);
  const result = await pool.query(
    `SELECT * FROM essay_rubrics
      WHERE status='active' AND (institution_id IS NULL OR institution_id=$1)
      ORDER BY institution_id NULLS FIRST,name,version DESC`,
    [identity.institutionId],
  );
  return result.rows.map(rubricFromRow);
}

/** Modelo congelado na aplicação (alterações futuras do modelo não mudam notas). */
export async function rubricSnapshot(db, identity, rubricId) {
  const result = await db.query(
    `SELECT * FROM essay_rubrics
      WHERE status='active' AND (institution_id IS NULL OR institution_id=$2)
        AND ($1::uuid IS NULL AND code='enem' AND institution_id IS NULL OR id=$1)
      ORDER BY version DESC LIMIT 1`,
    [rubricId || null, identity.institutionId],
  );
  if (!result.rowCount) throw fail('Modelo de correção não encontrado.', 404);
  const rubric = rubricFromRow(result.rows[0]);
  return {
    id: rubric.id,
    snapshot: {
      id: rubric.id,
      code: rubric.code,
      name: rubric.name,
      version: rubric.version,
      maxScore: rubric.maxScore,
      criteria: rubric.criteria,
      annulmentReasons: rubric.annulmentReasons,
    },
  };
}

// ---------- Fila de processamento ----------

const sha = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Enfileira OCR ou sugestão da IA. A chave de idempotência (etapa + produção
 * + entrada) impede processar duas vezes a mesma coisa; falhas podem ser
 * reenfileiradas. Devolve null quando já existe job ativo ou concluído.
 */
export async function enqueueEssayJob(
  db,
  { institutionId, submissionId, kind, input, userId },
) {
  const key = `${kind}:${submissionId}:${sha(input)}`;
  const result = await db.query(
    `INSERT INTO essay_jobs (institution_id,submission_id,kind,idempotency_key,requested_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET status='queued',attempts=0,next_attempt_at=now(),error_message='',
           locked_until=NULL,finished_at=NULL,requested_by=EXCLUDED.requested_by
     WHERE essay_jobs.status IN ('failed','cancelled')
     RETURNING id`,
    [institutionId, submissionId, kind, key, userId || null],
  );
  return result.rows[0]?.id ?? null;
}

async function setStatus(db, entryId, status) {
  await db.query(
    'UPDATE essay_application_students SET status=$2,updated_at=now() WHERE id=$1',
    [entryId, status],
  );
}

/** Texto usado na correção: transcrição mais recente (professor ou IA) ou texto digitado. */
async function gradingText(db, submission) {
  if (submission.mode === 'typed')
    return { text: submission.typed_text, transcription: null };
  const result = await db.query(
    `SELECT * FROM essay_transcriptions WHERE submission_id=$1 ORDER BY version DESC LIMIT 1`,
    [submission.id],
  );
  const transcription = result.rows[0] || null;
  return { text: transcription?.text || '', transcription };
}

/** Depois do envio: OCR das imagens ou sugestão da IA, quando ligados. */
async function routeAfterSubmit(db, entry, submission, identity) {
  const ai = essayAiProvider() && entry.ai_assist;
  if (submission.mode === 'typed') {
    if (ai) {
      await enqueueEssayJob(db, {
        institutionId: entry.institution_id,
        submissionId: submission.id,
        kind: 'ai_grading',
        input: {
          text: submission.typed_text,
          rubric: entry.rubric_snapshot?.id,
          prompt: ESSAY_PROMPT_VERSION,
        },
        userId: identity.userId,
      });
      return setStatus(db, entry.id, 'awaiting_ai');
    }
    return setStatus(db, entry.id, 'awaiting_grading');
  }
  if (ai) {
    const files = await db.query(
      'SELECT sha256 FROM essay_submission_files WHERE submission_id=$1 ORDER BY position',
      [submission.id],
    );
    await enqueueEssayJob(db, {
      institutionId: entry.institution_id,
      submissionId: submission.id,
      kind: 'ocr',
      input: files.rows.map((row) => row.sha256),
      userId: identity.userId,
    });
    return setStatus(db, entry.id, 'awaiting_ocr');
  }
  return setStatus(db, entry.id, 'awaiting_grading');
}

// ---------- Leitura das produções (equipe) ----------

const entryColumns = `eas.id,eas.application_id,eas.student_id,eas.student_number,eas.status,eas.updated_at,
  eas.published_at,eas.published_by,eas.published_grading_id,
  ea.institution_id,ea.class_id,ea.created_by AS application_owner,ea.status AS application_status,
  ea.due_at,ea.opens_at,ea.applied_on::text AS applied_on,ea.submission_modes,ea.ai_assist,ea.ai_feedback_visible,
  ea.rubric_snapshot,ea.prompt_snapshot,s.name AS student_name,s.registration,
  c.name AS class_name,c.grade AS class_grade,c.school_year,class_year_locked(ea.class_id) AS year_locked`;

async function loadEntry(db, identity, entryId, { lock = false } = {}) {
  const result = await db.query(
    `SELECT ${entryColumns}
       FROM essay_application_students eas
       JOIN essay_applications ea ON ea.id=eas.application_id
       JOIN students s ON s.id=eas.student_id
       JOIN classes c ON c.id=ea.class_id
      WHERE eas.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}
      ${lock ? 'FOR UPDATE OF eas' : ''}`,
    [entryId, identity.institutionId, teacherScope(identity)],
  );
  if (!result.rowCount) throw fail('Produção não encontrada.', 404);
  return result.rows[0];
}

async function currentSubmission(db, entryId, { lock = false } = {}) {
  const result = await db.query(
    `SELECT * FROM essay_submissions WHERE application_student_id=$1
      ORDER BY attempt DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [entryId],
  );
  return result.rows[0] || null;
}

function fileFromRow(row) {
  return {
    id: row.id,
    position: row.position,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

function submissionFromRow(row, files = []) {
  if (!row) return null;
  return {
    id: row.id,
    attempt: row.attempt,
    mode: row.mode,
    typedText: row.typed_text,
    wordCount: row.word_count,
    lineCount: row.line_count,
    status: row.status,
    revision: row.revision,
    returnReason: row.return_reason,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    files: files.map(fileFromRow),
  };
}

function gradingFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    scores: row.scores,
    annulmentReason: row.annulment_reason,
    total: row.total,
    maxScore: row.max_score,
    comments: row.comments,
    strengths: row.strengths,
    improvements: row.improvements,
    rewriteSuggestions: row.rewrite_suggestions,
    basedOnGradingId: row.based_on_grading_id,
    transcriptionId: row.transcription_id,
    provider: row.provider,
    model: row.model,
    warnings: row.warnings,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name || null,
    finalizedAt: row.finalized_at,
    finalizedByName: row.finalized_by_name || null,
  };
}

function transcriptionFromRow(row) {
  return {
    id: row.id,
    version: row.version,
    source: row.source,
    provider: row.provider,
    model: row.model,
    text: row.text,
    lines: row.lines,
    confidence: row.confidence === null ? null : Number(row.confidence),
    needsReview: row.needs_review,
    warnings: row.warnings,
    createdAt: row.created_at,
    createdByName: row.created_by_name || null,
  };
}

/** Texto da proposta para leitura na tela (sem imagens). */
function promptView(snapshot = {}) {
  return {
    title: snapshot.title,
    theme: snapshot.theme,
    essayType: snapshot.essayType,
    productionCommand: snapshot.productionCommand,
    studentGuidance: snapshot.studentGuidance,
    minLines: snapshot.minLines,
    maxLines: snapshot.maxLines,
    motivatingTexts: (snapshot.motivatingTexts || []).map((item) => ({
      title: item.title,
      author: item.author,
      source: item.source,
      blocks: (item.content || []).filter((block) => block.type !== 'image'),
      hasImages:
        Boolean(item.imageSha256) ||
        (item.content || []).some((block) => block.type === 'image'),
    })),
  };
}

export async function getEssayEntry(identity, entryId) {
  requireStaff(identity);
  const entry = await loadEntry(pool, identity, entryId);
  const submissions = await pool.query(
    `SELECT * FROM essay_submissions WHERE application_student_id=$1 ORDER BY attempt DESC`,
    [entryId],
  );
  const current = submissions.rows[0] || null;
  const [files, transcriptions, gradings, jobs, history] = current
    ? await Promise.all([
        pool.query(
          'SELECT * FROM essay_submission_files WHERE submission_id=$1 ORDER BY position',
          [current.id],
        ),
        pool.query(
          `SELECT t.*,u.display_name AS created_by_name FROM essay_transcriptions t
             LEFT JOIN users u ON u.id=t.created_by
            WHERE t.submission_id=$1 ORDER BY t.version DESC`,
          [current.id],
        ),
        pool.query(
          `SELECT g.*,cu.display_name AS created_by_name,fu.display_name AS finalized_by_name
             FROM essay_gradings g
             LEFT JOIN users cu ON cu.id=g.created_by
             LEFT JOIN users fu ON fu.id=g.finalized_by
            WHERE g.submission_id=$1 ORDER BY g.created_at DESC`,
          [current.id],
        ),
        pool.query(
          `SELECT DISTINCT ON (kind) id,kind,status,attempts,max_attempts,error_message,next_attempt_at,created_at,finished_at
             FROM essay_jobs WHERE submission_id=$1 ORDER BY kind,created_at DESC`,
          [current.id],
        ),
        pool.query(
          `SELECT l.action,l.metadata,l.created_at,u.display_name AS user_name FROM audit_log l
             LEFT JOIN users u ON u.id=l.user_id
            WHERE l.entity_type='essay_entry' AND l.entity_id=$1 ORDER BY l.created_at DESC LIMIT 100`,
          [entryId],
        ),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }];
  const allGradings = gradings.rows.map(gradingFromRow);
  return {
    id: entry.id,
    applicationId: entry.application_id,
    status: entry.status,
    student: {
      id: entry.student_id,
      name: entry.student_name,
      number: entry.student_number,
      registration: entry.registration,
    },
    className: [entry.class_grade, entry.class_name]
      .filter(Boolean)
      .join(' — '),
    schoolYear: entry.school_year,
    yearLocked: entry.year_locked,
    dueAt: entry.due_at,
    submissionModes: entry.submission_modes,
    aiAssist: entry.ai_assist,
    aiAvailable: Boolean(essayAiProvider()),
    aiFeedbackVisible: entry.ai_feedback_visible,
    prompt: promptView(entry.prompt_snapshot),
    rubric: entry.rubric_snapshot,
    submission: submissionFromRow(current, files.rows),
    attempts: submissions.rows.map((row) => ({
      id: row.id,
      attempt: row.attempt,
      mode: row.mode,
      status: row.status,
      returnReason: row.return_reason,
      submittedAt: row.submitted_at,
    })),
    transcriptions: transcriptions.rows.map(transcriptionFromRow),
    aiGrading:
      allGradings.find(
        (grading) => grading.kind === 'ai' && grading.status === 'final',
      ) || null,
    teacherGrading:
      allGradings.find(
        (grading) =>
          grading.kind === 'teacher' &&
          ['draft', 'final'].includes(grading.status),
      ) || null,
    gradingHistory: allGradings,
    jobs: jobs.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      error: row.error_message,
      nextAttemptAt: row.next_attempt_at,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    })),
    publication: {
      publishedAt: entry.published_at,
      gradingId: entry.published_grading_id,
    },
    history: history.rows.map((row) => ({
      action: row.action,
      metadata: row.metadata,
      createdAt: row.created_at,
      userName: row.user_name,
    })),
  };
}

const listFilters = z.object({
  applicationId: z.uuid().optional(),
  classId: z.uuid().optional(),
  promptId: z.uuid().optional(),
  teacherId: z.uuid().optional(),
  schoolId: z.uuid().optional(),
  schoolYear: z.coerce.number().int().min(2000).max(2100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(ENTRY_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

function filterSql(identity, raw) {
  const filters = listFilters.parse(
    Object.fromEntries(
      Object.entries(raw || {}).filter(
        ([, value]) => value !== undefined && value !== '',
      ),
    ),
  );
  const values = [identity.institutionId, teacherScope(identity)];
  const where = ['ea.institution_id=$1', ownsEssayApplication('ea', '$2')];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.applicationId) add('ea.id=?', filters.applicationId);
  if (filters.classId) add('ea.class_id=?', filters.classId);
  if (filters.promptId) add('ea.prompt_id=?', filters.promptId);
  if (filters.teacherId) add('ea.created_by=?', filters.teacherId);
  if (filters.schoolId) add('c.school_id=?', filters.schoolId);
  if (filters.schoolYear) add('c.school_year=?', filters.schoolYear);
  if (filters.from) add('ea.applied_on>=?', filters.from);
  if (filters.to) add('ea.applied_on<=?', filters.to);
  return { filters, values, where };
}

/** Fila de correção paginada (uma consulta, sem N+1). */
export async function listEssayEntries(identity, raw = {}) {
  requireStaff(identity);
  const { filters, values, where } = filterSql(identity, raw);
  where.push(`ea.status<>'cancelled'`);
  if (filters.status) {
    values.push(filters.status);
    where.push(`eas.status=$${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`s.name ILIKE $${values.length}`);
  }
  values.push(PAGE_SIZE, (filters.page - 1) * PAGE_SIZE);
  const result = await pool.query(
    `SELECT eas.id,eas.status,eas.student_number,eas.published_at,s.name AS student_name,
            ea.id AS application_id,ea.prompt_snapshot->>'title' AS prompt_title,ea.due_at,
            c.name AS class_name,c.grade AS class_grade,
            sub.mode,sub.submitted_at,sub.attempt,
            tg.total AS teacher_total,tg.status AS teacher_status,ag.total AS ai_total,
            ea.rubric_snapshot->>'maxScore' AS max_score,
            count(*) OVER()::int AS total_count
       FROM essay_application_students eas
       JOIN essay_applications ea ON ea.id=eas.application_id
       JOIN students s ON s.id=eas.student_id
       JOIN classes c ON c.id=ea.class_id
       LEFT JOIN LATERAL (SELECT id,mode,submitted_at,attempt FROM essay_submissions
                           WHERE application_student_id=eas.id ORDER BY attempt DESC LIMIT 1) sub ON true
       LEFT JOIN LATERAL (SELECT total,status FROM essay_gradings
                           WHERE submission_id=sub.id AND kind='teacher' AND status IN ('draft','final') LIMIT 1) tg ON true
       LEFT JOIN LATERAL (SELECT total FROM essay_gradings
                           WHERE submission_id=sub.id AND kind='ai' AND status='final'
                           ORDER BY created_at DESC LIMIT 1) ag ON true
      WHERE ${where.join(' AND ')}
      ORDER BY CASE eas.status WHEN 'awaiting_grading' THEN 0 WHEN 'grading' THEN 1 WHEN 'awaiting_approval' THEN 2
               WHEN 'submitted' THEN 3 WHEN 'awaiting_ocr' THEN 3 WHEN 'awaiting_ai' THEN 3 ELSE 4 END,
               sub.submitted_at NULLS LAST,s.name
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const total = result.rows[0]?.total_count ?? 0;
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      studentName: row.student_name,
      studentNumber: row.student_number,
      applicationId: row.application_id,
      promptTitle: row.prompt_title,
      className: [row.class_grade, row.class_name].filter(Boolean).join(' — '),
      dueAt: row.due_at,
      mode: row.mode,
      attempt: row.attempt,
      submittedAt: row.submitted_at,
      teacherTotal: row.teacher_total,
      teacherStatus: row.teacher_status,
      aiTotal: row.ai_total,
      maxScore: Number(row.max_score) || null,
      publishedAt: row.published_at,
    })),
    page: filters.page,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Indicadores do painel de redação com os mesmos filtros da fila. */
export async function essayDashboard(identity, raw = {}) {
  requireStaff(identity);
  const { values, where } = filterSql(identity, raw);
  where.push(`ea.status<>'cancelled'`);
  const base = `FROM essay_application_students eas
       JOIN essay_applications ea ON ea.id=eas.application_id
       JOIN classes c ON c.id=ea.class_id
      WHERE ${where.join(' AND ')}`;
  const [counts, averages, criteria, options] = await Promise.all([
    pool.query(
      `SELECT eas.status,count(*)::int AS count,count(DISTINCT ea.id)::int AS applications ${base} GROUP BY eas.status`,
      values,
    ),
    pool.query(
      `SELECT count(*)::int AS published,round(avg(g.total))::int AS average,
              min(g.total) AS min,max(g.total) AS max,count(DISTINCT ea.id)::int AS applications
         ${base.replace('WHERE', 'JOIN essay_gradings g ON g.id=eas.published_grading_id WHERE')}`,
      values,
    ),
    pool.query(
      `SELECT score->>'criterionId' AS criterion_id,round(avg((score->>'score')::numeric))::int AS average
         ${base.replace('WHERE', 'JOIN essay_gradings g ON g.id=eas.published_grading_id CROSS JOIN LATERAL jsonb_array_elements(g.scores) score WHERE')}
          AND score->>'score' IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      values,
    ),
    pool.query(
      `SELECT DISTINCT ON (kind,id) kind,id,label FROM (
         SELECT 'class' AS kind,c.id::text AS id,concat_ws(' — ',c.grade,c.name) AS label
           FROM essay_applications ea JOIN classes c ON c.id=ea.class_id
          WHERE ea.institution_id=$1 AND ${ownsEssayApplication('ea', '$2')}
         UNION ALL SELECT 'teacher',u.id::text,u.display_name
           FROM essay_applications ea JOIN users u ON u.id=ea.created_by
          WHERE ea.institution_id=$1 AND ${ownsEssayApplication('ea', '$2')}
         UNION ALL SELECT 'prompt',ea.prompt_id::text,ea.prompt_snapshot->>'title'
           FROM essay_applications ea WHERE ea.institution_id=$1 AND ${ownsEssayApplication('ea', '$2')}
         UNION ALL SELECT 'school',sc.id::text,sc.name
           FROM essay_applications ea JOIN classes c ON c.id=ea.class_id JOIN educator_schools sc ON sc.id=c.school_id
          WHERE ea.institution_id=$1 AND ${ownsEssayApplication('ea', '$2')}
         UNION ALL SELECT 'year',c.school_year::text,c.school_year::text
           FROM essay_applications ea JOIN classes c ON c.id=ea.class_id
          WHERE ea.institution_id=$1 AND ${ownsEssayApplication('ea', '$2')}
       ) options ORDER BY kind,id,label LIMIT 2000`,
      values.slice(0, 2),
    ),
  ]);
  const byStatus = Object.fromEntries(
    ENTRY_STATUSES.map((status) => [status, 0]),
  );
  for (const row of counts.rows) byStatus[row.status] = row.count;
  const students = Object.values(byStatus).reduce(
    (sum, count) => sum + count,
    0,
  );
  const received =
    students - byStatus.pending - byStatus.draft - byStatus.absent;
  const group = (kind) =>
    options.rows
      .filter((row) => row.kind === kind)
      .map((row) => ({ id: row.id, label: row.label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'));
  return {
    byStatus,
    students,
    received,
    toGrade: RECEIVED.reduce((sum, status) => sum + byStatus[status], 0),
    awaitingApproval: byStatus.awaiting_approval,
    published: byStatus.published,
    returned: byStatus.returned,
    averageTotal: averages.rows[0]?.average ?? null,
    minTotal: averages.rows[0]?.min ?? null,
    maxTotal: averages.rows[0]?.max ?? null,
    criteriaAverages: criteria.rows.map((row) => ({
      criterionId: row.criterion_id,
      average: row.average,
    })),
    options: {
      classes: group('class'),
      teachers: group('teacher'),
      prompts: group('prompt'),
      schools: group('school'),
      years: group('year'),
    },
  };
}

// ---------- Arquivos (equipe) ----------

export async function essayFileForStaff(identity, fileId) {
  requireStaff(identity);
  const result = await pool.query(
    `SELECT f.* FROM essay_submission_files f
       JOIN essay_submissions sub ON sub.id=f.submission_id
       JOIN essay_application_students eas ON eas.id=sub.application_student_id
       JOIN essay_applications ea ON ea.id=eas.application_id
      WHERE f.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}`,
    [fileId, identity.institutionId, teacherScope(identity)],
  );
  const row = result.rows[0];
  if (!row) throw fail('Arquivo não encontrado.', 404);
  return {
    contents: await readEssayFile(row.storage_ref),
    mimeType: row.mime_type,
    filename: `redacao-pagina-${row.position}.${fileTypes[row.mime_type]}`,
  };
}

async function addFile(
  db,
  { submission, institutionId, dataUrl, decoded, userId },
) {
  const count = await db.query(
    'SELECT count(*)::int AS n,COALESCE(max(position),0) AS last FROM essay_submission_files WHERE submission_id=$1',
    [submission.id],
  );
  if (count.rows[0].n >= MAX_ESSAY_FILES)
    throw fail(`Envie no máximo ${MAX_ESSAY_FILES} páginas por redação.`);
  const file = decoded || decodeEssayFile(dataUrl);
  const storage = essayFileStorage();
  const key = await storage.put(
    `essay-submissions/${institutionId}/${submission.id}/${file.sha256}.${fileTypes[file.mimeType]}`,
    file.contents,
    { contentType: file.mimeType },
  );
  const inserted = await db.query(
    `INSERT INTO essay_submission_files (submission_id,position,mime_type,byte_size,sha256,storage_ref,uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      submission.id,
      count.rows[0].last + 1,
      file.mimeType,
      file.contents.length,
      file.sha256,
      `${storage.provider}:${key}`,
      userId,
    ],
  );
  await db.query(
    `INSERT INTO usage_events(institution_id,user_id,kind,quantity,metadata)
     VALUES($1,$2,'storage',$3,$4::jsonb)`,
    [
      institutionId,
      userId,
      Math.max(1, Math.ceil(file.contents.length / 1024)),
      JSON.stringify({ essaySubmissionId: submission.id, unit: 'KiB' }),
    ],
  );
  return fileFromRow(inserted.rows[0]);
}

async function removeFile(db, submission, fileId) {
  const removed = await db.query(
    'DELETE FROM essay_submission_files WHERE id=$1 AND submission_id=$2 RETURNING storage_ref,sha256',
    [fileId, submission.id],
  );
  if (!removed.rowCount) throw fail('Arquivo não encontrado.', 404);
  // Renumera as páginas restantes.
  await db.query(
    `UPDATE essay_submission_files f SET position=n.position FROM (
       SELECT id,row_number() OVER (ORDER BY position)::int AS position
         FROM essay_submission_files WHERE submission_id=$1) n
      WHERE f.id=n.id`,
    [submission.id],
  );
  const shared = await db.query(
    'SELECT 1 FROM essay_submission_files WHERE storage_ref=$1 LIMIT 1',
    [removed.rows[0].storage_ref],
  );
  return shared.rowCount ? null : removed.rows[0].storage_ref;
}

// ---------- Digitalização enviada pelo professor ----------

function assertYearOpen(entry) {
  if (entry.year_locked)
    throw fail(
      'O ano letivo desta turma está encerrado: redações e notas ficam somente para consulta.',
      409,
    );
}

/** Rascunho de digitalização do professor (nova tentativa quando necessário). */
async function teacherScanDraft(db, entry, identity) {
  const current = await currentSubmission(db, entry.id, { lock: true });
  if (current?.status === 'draft') {
    if (current.mode !== 'teacher_scan')
      throw fail(
        'O aluno está com um rascunho em andamento. Aguarde o envio ou devolva a produção.',
        409,
      );
    return current;
  }
  if (
    current &&
    !['returned'].includes(current.status) &&
    entry.status !== 'absent'
  )
    throw fail('Esta produção já foi recebida.', 409);
  const created = await db.query(
    `INSERT INTO essay_submissions (institution_id,application_student_id,attempt,mode,submitted_by)
     VALUES ($1,$2,$3,'teacher_scan',$4) RETURNING *`,
    [
      entry.institution_id,
      entry.id,
      (current?.attempt || 0) + 1,
      identity.userId,
    ],
  );
  return created.rows[0];
}

export async function addTeacherScanFile(identity, entryId, input) {
  requireStaff(identity);
  const { dataUrl } = z
    .object({ dataUrl: z.string().max(12_000_000) })
    .parse(input);
  return transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    const submission = await teacherScanDraft(client, entry, identity);
    const file = await addFile(client, {
      submission,
      institutionId: entry.institution_id,
      dataUrl,
      userId: identity.userId,
    });
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.scan.upload',
      entryId,
      {
        fileId: file.id,
      },
    );
    return file;
  });
}

/**
 * Página escaneada em lote (QR lido pelo worker OMR ou aluno escolhido pelo
 * professor): entra no rascunho de digitalização da produção. A mesma página
 * enviada de novo não é duplicada. Erros 409 indicam produção já recebida ou
 * com rascunho do aluno.
 */
export async function attachScanPage(client, { entryId, userId, file }) {
  const result = await client.query(
    `SELECT ${entryColumns}
       FROM essay_application_students eas
       JOIN essay_applications ea ON ea.id=eas.application_id
       JOIN students s ON s.id=eas.student_id
       JOIN classes c ON c.id=ea.class_id
      WHERE eas.id=$1 FOR UPDATE OF eas`,
    [entryId],
  );
  const entry = result.rows[0];
  if (!entry) throw fail('Produção não encontrada.', 404);
  if (entry.application_status === 'cancelled')
    throw fail('A aplicação desta folha foi cancelada.', 409);
  assertYearOpen(entry);
  const identity = { userId };
  const submission = await teacherScanDraft(client, entry, identity);
  const existing = await client.query(
    'SELECT * FROM essay_submission_files WHERE submission_id=$1 AND sha256=$2',
    [submission.id, file.sha256],
  );
  const added = existing.rows[0]
    ? fileFromRow(existing.rows[0])
    : await addFile(client, {
        submission,
        institutionId: entry.institution_id,
        decoded: file,
        userId,
      });
  if (!existing.rowCount)
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.scan.batch',
      entryId,
      { fileId: added.id },
    );
  return { file: added, entry };
}

export async function removeTeacherScanFile(identity, entryId, fileId) {
  requireStaff(identity);
  const ref = await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    const submission = await currentSubmission(client, entryId, { lock: true });
    if (submission?.status !== 'draft' || submission.mode !== 'teacher_scan')
      throw fail(
        'Só é possível remover páginas antes de registrar o recebimento.',
        409,
      );
    return removeFile(client, submission, fileId);
  });
  if (ref) await deleteEssayFile(ref);
  return { removed: true };
}

/** Registra o recebimento da produção digitalizada. */
export async function receiveTeacherScan(identity, entryId) {
  requireStaff(identity);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    const submission = await currentSubmission(client, entryId, { lock: true });
    if (submission?.status !== 'draft' || submission.mode !== 'teacher_scan')
      throw fail('Envie as páginas digitalizadas antes de registrar.', 409);
    const files = await client.query(
      'SELECT count(*)::int AS n FROM essay_submission_files WHERE submission_id=$1',
      [submission.id],
    );
    if (!files.rows[0].n) throw fail('Envie ao menos uma página.', 422);
    await client.query(
      `UPDATE essay_submissions SET status='submitted',submitted_at=now(),submitted_by=$2,updated_at=now() WHERE id=$1`,
      [submission.id, identity.userId],
    );
    await routeAfterSubmit(
      client,
      entry,
      { ...submission, status: 'submitted' },
      identity,
    );
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.scan.receive',
      entryId,
      {
        submissionId: submission.id,
        pages: files.rows[0].n,
      },
    );
  });
  return getEssayEntry(identity, entryId);
}

export async function markEssayAbsent(identity, entryId, input) {
  requireStaff(identity);
  const { absent } = z.object({ absent: z.boolean() }).parse(input);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    if (absent && !['pending', 'draft'].includes(entry.status))
      throw fail(
        'Só produções não entregues podem ser marcadas como ausência.',
        409,
      );
    if (!absent && entry.status !== 'absent')
      throw fail('Esta produção não está marcada como ausência.', 409);
    await setStatus(client, entryId, absent ? 'absent' : 'pending');
    await audit(
      client,
      identity,
      entry.institution_id,
      absent ? 'essay.absent' : 'essay.absent.undo',
      entryId,
    );
  });
  return getEssayEntry(identity, entryId);
}

// ---------- Transcrição, OCR e IA ----------

export async function saveEssayTranscription(identity, entryId, input) {
  requireStaff(identity);
  const { text } = z
    .object({
      text: z.string().trim().min(1, 'Informe o texto.').max(MAX_TYPED_CHARS),
    })
    .parse(input);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    const submission = await currentSubmission(client, entryId);
    if (submission?.status !== 'submitted' || submission.mode === 'typed')
      throw fail('Só produções manuscritas recebidas têm transcrição.', 409);
    if (['awaiting_approval', 'published'].includes(entry.status))
      throw fail('Reabra a correção para alterar a transcrição.', 409);
    const version = await client.query(
      'SELECT COALESCE(max(version),0)+1 AS v FROM essay_transcriptions WHERE submission_id=$1',
      [submission.id],
    );
    await client.query(
      `INSERT INTO essay_transcriptions (submission_id,version,source,text,needs_review,created_by)
       VALUES ($1,$2,'teacher',$3,false,$4)`,
      [submission.id, version.rows[0].v, text, identity.userId],
    );
    if (['submitted', 'awaiting_ocr'].includes(entry.status))
      await setStatus(client, entryId, 'awaiting_grading');
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.transcription.save',
      entryId,
      {
        version: version.rows[0].v,
      },
    );
  });
  return getEssayEntry(identity, entryId);
}

function requireAi() {
  if (!essayAiProvider())
    throw fail(
      'A IA de redação não está configurada neste servidor (ESSAY_AI_PROVIDER).',
      409,
    );
}

export async function requestEssayOcr(identity, entryId) {
  requireStaff(identity);
  requireAi();
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    const submission = await currentSubmission(client, entryId);
    if (submission?.status !== 'submitted' || submission.mode === 'typed')
      throw fail(
        'Só produções manuscritas recebidas passam por transcrição.',
        409,
      );
    const files = await client.query(
      'SELECT sha256 FROM essay_submission_files WHERE submission_id=$1 ORDER BY position',
      [submission.id],
    );
    const job = await enqueueEssayJob(client, {
      institutionId: entry.institution_id,
      submissionId: submission.id,
      kind: 'ocr',
      input: files.rows.map((row) => row.sha256),
      userId: identity.userId,
    });
    if (!job)
      throw fail(
        'A transcrição destas páginas já foi feita ou está na fila.',
        409,
      );
    if (RECEIVED.includes(entry.status))
      await setStatus(client, entryId, 'awaiting_ocr');
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.ocr.request',
      entryId,
      { jobId: job },
    );
  });
  return getEssayEntry(identity, entryId);
}

export async function requestEssayAiGrading(identity, entryId) {
  requireStaff(identity);
  requireAi();
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    const submission = await currentSubmission(client, entryId);
    if (submission?.status !== 'submitted')
      throw fail('A produção ainda não foi recebida.', 409);
    const { text, transcription } = await gradingText(client, submission);
    if (!text.trim())
      throw fail(
        submission.mode === 'typed'
          ? 'O texto está vazio.'
          : 'Transcreva o manuscrito (OCR ou digitação) antes de pedir a sugestão da IA.',
        409,
      );
    if (transcription?.needs_review)
      throw fail(
        'A transcrição automática tem baixa confiança. Revise e salve a transcrição antes da sugestão da IA.',
        409,
      );
    const job = await enqueueEssayJob(client, {
      institutionId: entry.institution_id,
      submissionId: submission.id,
      kind: 'ai_grading',
      input: {
        text,
        rubric: entry.rubric_snapshot?.id,
        prompt: ESSAY_PROMPT_VERSION,
      },
      userId: identity.userId,
    });
    if (!job)
      throw fail(
        'Já existe sugestão da IA (ou pedido na fila) para este mesmo texto.',
        409,
      );
    if (RECEIVED.includes(entry.status) && entry.status !== 'grading')
      await setStatus(client, entryId, 'awaiting_ai');
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.ai.request',
      entryId,
      { jobId: job },
    );
  });
  return getEssayEntry(identity, entryId);
}

// ---------- Correção do professor ----------

async function currentTeacherGrading(db, submissionId) {
  const result = await db.query(
    `SELECT * FROM essay_gradings WHERE submission_id=$1 AND kind='teacher' AND status IN ('draft','final')
      FOR UPDATE`,
    [submissionId],
  );
  return result.rows[0] || null;
}

export async function saveEssayGrading(
  identity,
  entryId,
  input,
  { finalize = false } = {},
) {
  requireStaff(identity);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    if (entry.status === 'published')
      throw fail(
        'A nota já foi publicada. Reabra a correção para alterá-la.',
        409,
      );
    if (entry.status === 'awaiting_approval')
      throw fail('A correção já foi finalizada. Reabra para alterar.', 409);
    const submission = await currentSubmission(client, entryId);
    if (submission?.status !== 'submitted')
      throw fail('Ainda não há produção recebida para corrigir.', 409);
    const graded = computeGrading(entry.rubric_snapshot, input, {
      complete: finalize,
    });
    if (graded.basedOnGradingId) {
      const base = await client.query(
        `SELECT 1 FROM essay_gradings WHERE id=$1 AND submission_id=$2 AND kind='ai'`,
        [graded.basedOnGradingId, submission.id],
      );
      if (!base.rowCount) throw fail('Sugestão da IA não encontrada.', 404);
    }
    const existing = await currentTeacherGrading(client, submission.id);
    if (existing && graded.revision && existing.revision !== graded.revision)
      throw fail(
        'Esta correção foi alterada em outra janela. Recarregue para ver a versão atual.',
        409,
        { code: 'REVISION_CONFLICT' },
      );
    const { transcription } = await gradingText(client, submission);
    const values = [
      JSON.stringify(graded.scores),
      graded.annulmentReason,
      graded.total,
      graded.maxScore,
      graded.comments,
      graded.strengths,
      graded.improvements,
      graded.rewriteSuggestions,
      graded.basedOnGradingId ?? existing?.based_on_grading_id ?? null,
      transcription?.id ?? null,
      finalize ? 'final' : 'draft',
      identity.userId,
    ];
    if (existing)
      await client.query(
        `UPDATE essay_gradings SET scores=$2::jsonb,annulment_reason=$3,total=$4,max_score=$5,comments=$6,
                strengths=$7,improvements=$8,rewrite_suggestions=$9,based_on_grading_id=$10,transcription_id=$11,
                status=$12,revision=revision+1,updated_at=now(),
                finalized_by=CASE WHEN $12='final' THEN $13::uuid END,
                finalized_at=CASE WHEN $12='final' THEN now() END
          WHERE id=$1`,
        [existing.id, ...values],
      );
    else
      await client.query(
        `INSERT INTO essay_gradings (institution_id,submission_id,kind,scores,annulment_reason,total,max_score,
                comments,strengths,improvements,rewrite_suggestions,based_on_grading_id,transcription_id,status,
                created_by,finalized_by,finalized_at)
         VALUES ($1,$2,'teacher',$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 CASE WHEN $13='final' THEN $14::uuid END,CASE WHEN $13='final' THEN now() END)`,
        [entry.institution_id, submission.id, ...values],
      );
    await setStatus(
      client,
      entryId,
      finalize ? 'awaiting_approval' : 'grading',
    );
    await audit(
      client,
      identity,
      entry.institution_id,
      finalize ? 'essay.grading.finalize' : 'essay.grading.save',
      entryId,
      {
        total: graded.total ?? graded.partialTotal,
        basedOnAi: Boolean(values[8]),
      },
    );
  });
  return getEssayEntry(identity, entryId);
}

/** Reabre a correção finalizada (e despublica, se for o caso), guardando a versão anterior. */
export async function reopenEssayGrading(identity, entryId) {
  requireStaff(identity);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    if (!['awaiting_approval', 'published'].includes(entry.status))
      throw fail('Não há correção finalizada para reabrir.', 409);
    const submission = await currentSubmission(client, entryId);
    const existing =
      submission && (await currentTeacherGrading(client, submission.id));
    if (!existing) throw fail('Correção não encontrada.', 404);
    await client.query(
      `UPDATE essay_gradings SET status='superseded',updated_at=now() WHERE id=$1`,
      [existing.id],
    );
    await client.query(
      `INSERT INTO essay_gradings (institution_id,submission_id,kind,status,scores,annulment_reason,total,max_score,
              comments,strengths,improvements,rewrite_suggestions,based_on_grading_id,transcription_id,revision,created_by)
       SELECT institution_id,submission_id,'teacher','draft',scores,annulment_reason,total,max_score,comments,
              strengths,improvements,rewrite_suggestions,based_on_grading_id,transcription_id,revision+1,$2
         FROM essay_gradings WHERE id=$1`,
      [existing.id, identity.userId],
    );
    const wasPublished = entry.status === 'published';
    await client.query(
      `UPDATE essay_application_students SET status='grading',updated_at=now(),
              published_at=NULL,published_by=NULL,published_grading_id=NULL WHERE id=$1`,
      [entryId],
    );
    await audit(
      client,
      identity,
      entry.institution_id,
      wasPublished ? 'essay.unpublish' : 'essay.grading.reopen',
      entryId,
      {
        previousGradingId: existing.id,
        previousTotal: existing.total,
      },
    );
  });
  return getEssayEntry(identity, entryId);
}

async function publishEntry(client, identity, entry) {
  if (entry.status !== 'awaiting_approval')
    throw fail('Somente correções finalizadas podem ser publicadas.', 409);
  const submission = await currentSubmission(client, entry.id);
  const grading =
    submission && (await currentTeacherGrading(client, submission.id));
  if (grading?.status !== 'final' || grading.total === null)
    throw fail('Finalize a correção antes de publicar.', 409);
  await client.query(
    `UPDATE essay_application_students SET status='published',published_at=now(),published_by=$2,
            published_grading_id=$3,updated_at=now() WHERE id=$1`,
    [entry.id, identity.userId, grading.id],
  );
  await audit(
    client,
    identity,
    entry.institution_id,
    'essay.publish',
    entry.id,
    {
      gradingId: grading.id,
      total: grading.total,
    },
  );
}

const confirmSchema = z.object({
  confirm: z.literal(true, 'Confirme a publicação da nota.'),
});

export async function publishEssayEntry(identity, entryId, input) {
  requireStaff(identity);
  confirmSchema.parse(input);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    await publishEntry(client, identity, entry);
  });
  return getEssayEntry(identity, entryId);
}

/** Publica de uma vez todas as correções finalizadas da aplicação. */
export async function publishEssayApplication(identity, applicationId, input) {
  requireStaff(identity);
  confirmSchema.parse(input);
  return transaction(async (client) => {
    const ids = await client.query(
      `SELECT eas.id FROM essay_application_students eas
         JOIN essay_applications ea ON ea.id=eas.application_id
        WHERE ea.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}
          AND eas.status='awaiting_approval' ORDER BY eas.id`,
      [applicationId, identity.institutionId, teacherScope(identity)],
    );
    for (const row of ids.rows) {
      const entry = await loadEntry(client, identity, row.id, { lock: true });
      assertYearOpen(entry);
      await publishEntry(client, identity, entry);
    }
    return { published: ids.rowCount };
  });
}

/** Devolve a produção ao aluno para reescrita (nova tentativa). */
export async function returnEssayEntry(identity, entryId, input) {
  requireStaff(identity);
  const { reason } = z
    .object({
      reason: z
        .string()
        .trim()
        .min(5, 'Explique ao aluno o que revisar.')
        .max(2000),
    })
    .parse(input);
  await transaction(async (client) => {
    const entry = await loadEntry(client, identity, entryId, { lock: true });
    assertYearOpen(entry);
    if (entry.status === 'published')
      throw fail(
        'Reabra a correção antes de devolver uma produção já publicada.',
        409,
      );
    const submission = await currentSubmission(client, entryId, { lock: true });
    if (submission?.status !== 'submitted')
      throw fail('Só produções recebidas podem ser devolvidas.', 409);
    await client.query(
      `UPDATE essay_submissions SET status='returned',return_reason=$2,updated_at=now() WHERE id=$1`,
      [submission.id, reason],
    );
    await client.query(
      `UPDATE essay_gradings SET status='superseded',updated_at=now()
        WHERE submission_id=$1 AND kind='teacher' AND status IN ('draft','final')`,
      [submission.id],
    );
    await client.query(
      `UPDATE essay_jobs SET status='cancelled',finished_at=now() WHERE submission_id=$1 AND status='queued'`,
      [submission.id],
    );
    await setStatus(client, entryId, 'returned');
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.return',
      entryId,
      { reason },
    );
  });
  return getEssayEntry(identity, entryId);
}

// ---------- Portal do aluno ----------

const studentEntryQuery = `
  SELECT eas.id AS entry_id,eas.status,eas.published_grading_id,eas.published_at,eas.student_number,
         a.id,a.institution_id,a.status AS application_status,a.due_at,a.opens_at,a.applied_on::text AS applied_on,
         a.submission_modes,a.prompt_snapshot,a.rubric_snapshot,a.ai_feedback_visible,a.ai_assist,
         c.name AS class_name,c.grade AS class_grade,u.display_name AS teacher_name,
         class_year_locked(a.class_id) AS year_locked
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

async function loadMyEntry(db, identity, applicationId, { lock = false } = {}) {
  requireStudent(identity);
  const result = await db.query(
    `${studentEntryQuery} AND a.id=$2 LIMIT 1 ${lock ? 'FOR UPDATE OF eas' : ''}`,
    [identity.userId, applicationId],
  );
  if (!result.rowCount) throw fail('Redação não encontrada.', 404);
  return result.rows[0];
}

/** O aluno pode escrever/enviar agora? Devolve o motivo quando não pode. */
export function studentWriteBlock(entry, now = new Date()) {
  if (entry.year_locked) return 'O ano letivo desta turma foi encerrado.';
  if (entry.application_status !== 'open')
    return 'O professor encerrou o recebimento desta redação.';
  if (entry.opens_at && now < new Date(entry.opens_at))
    return 'O envio ainda não foi liberado.';
  if (entry.due_at && now > new Date(entry.due_at))
    return 'O prazo de entrega terminou.';
  if (!['pending', 'draft', 'returned'].includes(entry.status))
    return 'A redação já foi enviada.';
  return '';
}

function assertCanWrite(entry) {
  const block = studentWriteBlock(entry);
  if (block) throw fail(block, 409);
}

/** Rascunho atual do aluno; abre nova tentativa após devolução. */
async function myDraft(db, entry, mode) {
  const current = await currentSubmission(db, entry.entry_id, { lock: true });
  if (current?.status === 'draft') {
    if (current.mode === 'teacher_scan')
      throw fail('O professor está registrando a sua produção em papel.', 409);
    return current;
  }
  if (current && current.status !== 'returned')
    throw fail('A redação já foi enviada.', 409);
  const keepText = mode === 'typed' && current?.mode === 'typed';
  const created = await db.query(
    `INSERT INTO essay_submissions (institution_id,application_student_id,attempt,mode,typed_text,word_count,line_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      entry.institution_id,
      entry.entry_id,
      (current?.attempt || 0) + 1,
      mode,
      // Reescrita digitada parte do texto devolvido.
      keepText ? current.typed_text : '',
      keepText ? current.word_count : 0,
      keepText ? current.line_count : 0,
    ],
  );
  await setStatus(db, entry.entry_id, 'draft');
  return created.rows[0];
}

function publishedResult(entry, grading, aiGrading) {
  if (!grading) return null;
  const criteria = entry.rubric_snapshot?.criteria || [];
  const aiVisible = entry.ai_feedback_visible && aiGrading;
  return {
    total: grading.total,
    maxScore: grading.max_score,
    annulmentReason:
      (entry.rubric_snapshot?.annulmentReasons || []).find(
        (reason) => reason.id === grading.annulment_reason,
      )?.label || '',
    publishedAt: entry.published_at,
    comments: grading.comments,
    strengths: grading.strengths,
    improvements: grading.improvements,
    rewriteSuggestions: grading.rewrite_suggestions,
    criteria: criteria.map((criterion) => {
      const score = (grading.scores || []).find(
        (item) => item.criterionId === criterion.id,
      );
      const ai = aiVisible
        ? (aiGrading.scores || []).find(
            (item) => item.criterionId === criterion.id,
          )
        : null;
      return {
        id: criterion.id,
        numeral: criterion.numeral,
        title: criterion.title,
        maxScore: criterion.maxScore,
        score: score?.score ?? null,
        level:
          criterion.levels.find((level) => level.score === score?.score)
            ?.descriptor || '',
        feedback: score?.feedback || '',
        observations: Object.entries(score?.observations || {})
          .map(([id, choice]) => {
            const observation = (criterion.observations || []).find(
              (item) => item.id === id,
            );
            if (!observation) return null;
            const option = observation.options?.find(
              (item) => item.id === choice,
            );
            return option
              ? `${observation.label}: ${option.label}`
              : observation.label;
          })
          .filter(Boolean),
        aiFeedback: ai?.feedback || '',
      };
    }),
    aiFeedback: aiVisible ? aiGrading.comments || '' : '',
  };
}

export async function myEssays(identity) {
  requireStudent(identity);
  const result = await pool.query(
    `SELECT DISTINCT ON (q.id) q.*,g.total,g.max_score FROM (${studentEntryQuery}) q
       LEFT JOIN essay_gradings g ON g.id=q.published_grading_id
      ORDER BY q.id`,
    [identity.userId],
  );
  return result.rows
    .map((row) => ({
      id: row.id,
      title: row.prompt_snapshot?.title,
      theme: row.prompt_snapshot?.theme,
      className: [row.class_grade, row.class_name].filter(Boolean).join(' — '),
      appliedOn: row.applied_on,
      dueAt: row.due_at,
      opensAt: row.opens_at,
      status: row.application_status,
      submissionStatus: row.status,
      canWrite: !studentWriteBlock(row),
      total: row.status === 'published' ? row.total : null,
      maxScore: row.status === 'published' ? row.max_score : null,
    }))
    .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
}

export async function myEssayDetail(identity, applicationId) {
  const entry = await loadMyEntry(pool, identity, applicationId);
  const submissions = await pool.query(
    `SELECT * FROM essay_submissions WHERE application_student_id=$1 ORDER BY attempt DESC`,
    [entry.entry_id],
  );
  const current = submissions.rows[0] || null;
  const files = current
    ? await pool.query(
        'SELECT * FROM essay_submission_files WHERE submission_id=$1 ORDER BY position',
        [current.id],
      )
    : { rows: [] };
  let result = null;
  if (entry.status === 'published' && entry.published_grading_id) {
    const gradings = await pool.query(
      `SELECT g.* FROM essay_gradings g WHERE g.id=$1
       UNION ALL
       (SELECT ai.* FROM essay_gradings ai JOIN essay_gradings pub ON pub.id=$1
         WHERE ai.submission_id=pub.submission_id AND ai.kind='ai' AND ai.status='final'
         ORDER BY ai.created_at DESC LIMIT 1)`,
      [entry.published_grading_id],
    );
    result = publishedResult(
      entry,
      gradings.rows.find((row) => row.kind === 'teacher'),
      gradings.rows.find((row) => row.kind === 'ai'),
    );
  }
  const block = studentWriteBlock(entry);
  return {
    id: entry.id,
    status: entry.status,
    applicationStatus: entry.application_status,
    className: [entry.class_grade, entry.class_name]
      .filter(Boolean)
      .join(' — '),
    teacherName: entry.teacher_name,
    appliedOn: entry.applied_on,
    dueAt: entry.due_at,
    opensAt: entry.opens_at,
    submissionModes: entry.submission_modes,
    canWrite: !block,
    writeBlock: block,
    limits: {
      maxChars: MAX_TYPED_CHARS,
      maxFiles: MAX_ESSAY_FILES,
      maxFileBytes: MAX_ESSAY_FILE_BYTES,
      charsPerLine: 80,
    },
    prompt: promptView(entry.prompt_snapshot),
    rubric: entry.rubric_snapshot
      ? {
          name: entry.rubric_snapshot.name,
          maxScore: entry.rubric_snapshot.maxScore,
          criteria: entry.rubric_snapshot.criteria.map((criterion) => ({
            id: criterion.id,
            numeral: criterion.numeral,
            title: criterion.title,
            maxScore: criterion.maxScore,
          })),
        }
      : null,
    submission: current
      ? {
          ...submissionFromRow(current, files.rows),
          // O aluno não vê transcrição nem notas parciais.
        }
      : null,
    attempts: submissions.rows.map((row) => ({
      attempt: row.attempt,
      mode: row.mode,
      status: row.status,
      returnReason: row.return_reason,
      submittedAt: row.submitted_at,
    })),
    result,
  };
}

const draftSchema = z.object({
  text: z
    .string()
    .max(MAX_TYPED_CHARS, 'O texto passou do limite de caracteres.'),
  revision: z.number().int().positive().optional(),
});

/** Salvamento automático do texto digitado. */
export async function saveMyEssayDraft(identity, applicationId, input) {
  const value = draftSchema.parse(input);
  return transaction(async (client) => {
    const entry = await loadMyEntry(client, identity, applicationId, {
      lock: true,
    });
    assertCanWrite(entry);
    if (!entry.submission_modes.includes('typed'))
      throw fail('Esta redação não aceita texto digitado.', 409);
    const draft = await myDraft(client, entry, 'typed');
    if (value.revision && draft.revision > value.revision)
      throw fail(
        'O texto foi alterado em outra janela ou aparelho. Recarregue para continuar.',
        409,
        { code: 'REVISION_CONFLICT' },
      );
    if (draft.mode !== 'typed') {
      const files = await client.query(
        'SELECT 1 FROM essay_submission_files WHERE submission_id=$1 LIMIT 1',
        [draft.id],
      );
      if (files.rowCount)
        throw fail(
          'Remova as fotos enviadas para escrever o texto digitado.',
          409,
        );
    }
    const updated = await client.query(
      `UPDATE essay_submissions SET mode='typed',typed_text=$2,word_count=$3,line_count=$4,
              revision=revision+1,updated_at=now() WHERE id=$1
       RETURNING revision,word_count,line_count,updated_at`,
      [draft.id, value.text, countWords(value.text), countLines(value.text)],
    );
    const row = updated.rows[0];
    return {
      revision: row.revision,
      wordCount: row.word_count,
      lineCount: row.line_count,
      savedAt: row.updated_at,
    };
  });
}

export async function addMyEssayFile(identity, applicationId, input) {
  const { dataUrl } = z
    .object({ dataUrl: z.string().max(12_000_000) })
    .parse(input);
  return transaction(async (client) => {
    const entry = await loadMyEntry(client, identity, applicationId, {
      lock: true,
    });
    assertCanWrite(entry);
    if (!entry.submission_modes.includes('upload'))
      throw fail('Esta redação não aceita fotos ou PDF.', 409);
    const draft = await myDraft(client, entry, 'upload');
    if (draft.mode !== 'upload') {
      if (draft.typed_text.trim())
        throw fail('Apague o texto digitado para enviar fotos da folha.', 409);
      await client.query(
        `UPDATE essay_submissions SET mode='upload',updated_at=now() WHERE id=$1`,
        [draft.id],
      );
    }
    return addFile(client, {
      submission: draft,
      institutionId: entry.institution_id,
      dataUrl,
      userId: identity.userId,
    });
  });
}

export async function removeMyEssayFile(identity, applicationId, fileId) {
  const ref = await transaction(async (client) => {
    const entry = await loadMyEntry(client, identity, applicationId, {
      lock: true,
    });
    assertCanWrite(entry);
    const draft = await currentSubmission(client, entry.entry_id, {
      lock: true,
    });
    if (draft?.status !== 'draft' || draft.mode !== 'upload')
      throw fail('Não há fotos em rascunho para remover.', 409);
    return removeFile(client, draft, fileId);
  });
  if (ref) await deleteEssayFile(ref);
  return { removed: true };
}

export async function myEssayFile(identity, applicationId, fileId) {
  const entry = await loadMyEntry(pool, identity, applicationId);
  const result = await pool.query(
    `SELECT f.* FROM essay_submission_files f JOIN essay_submissions sub ON sub.id=f.submission_id
      WHERE f.id=$1 AND sub.application_student_id=$2`,
    [fileId, entry.entry_id],
  );
  const row = result.rows[0];
  if (!row) throw fail('Arquivo não encontrado.', 404);
  return {
    contents: await readEssayFile(row.storage_ref),
    mimeType: row.mime_type,
    filename: `minha-redacao-pagina-${row.position}.${fileTypes[row.mime_type]}`,
  };
}

/** Envio final do aluno: valida limites e encaminha para OCR/IA/correção. */
export async function submitMyEssay(identity, applicationId) {
  await transaction(async (client) => {
    const entry = await loadMyEntry(client, identity, applicationId, {
      lock: true,
    });
    assertCanWrite(entry);
    const draft = await currentSubmission(client, entry.entry_id, {
      lock: true,
    });
    if (draft?.status !== 'draft' || draft.mode === 'teacher_scan')
      throw fail('Escreva o texto ou envie as fotos antes de enviar.', 409);
    if (draft.mode === 'typed') {
      const minLines = entry.prompt_snapshot?.minLines || 0;
      const maxLines = entry.prompt_snapshot?.maxLines || 0;
      if (!draft.typed_text.trim()) throw fail('O texto está vazio.');
      if (minLines && draft.line_count < minLines)
        throw fail(
          `O texto ocupa cerca de ${draft.line_count} linha(s); o mínimo é ${minLines}.`,
        );
      if (maxLines && draft.line_count > maxLines)
        throw fail(
          `O texto ocupa cerca de ${draft.line_count} linhas; o máximo é ${maxLines}.`,
        );
    } else {
      const files = await client.query(
        'SELECT count(*)::int AS n FROM essay_submission_files WHERE submission_id=$1',
        [draft.id],
      );
      if (!files.rows[0].n)
        throw fail('Envie ao menos uma foto ou PDF da redação.');
    }
    await client.query(
      `UPDATE essay_submissions SET status='submitted',submitted_at=now(),submitted_by=$2,updated_at=now() WHERE id=$1`,
      [draft.id, identity.userId],
    );
    const staffEntry = { ...entry, id: entry.entry_id };
    await routeAfterSubmit(
      client,
      staffEntry,
      { ...draft, status: 'submitted' },
      identity,
    );
    await audit(
      client,
      identity,
      entry.institution_id,
      'essay.submit',
      entry.entry_id,
      {
        submissionId: draft.id,
        mode: draft.mode,
        attempt: draft.attempt,
      },
    );
  });
  return myEssayDetail(identity, applicationId);
}
