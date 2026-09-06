import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';

const execFileAsync = promisify(execFile);

const pdfDocumentSchema = z.object({
  kind: z.enum(['exam', 'answer_key']),
  fileName: z.string().trim().min(1).max(240),
  dataUrl: z
    .string()
    .max(20_500_000)
    .regex(/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/),
});

export const examImportSchema = z
  .object({
    sourceInstitution: z.string().trim().min(2).max(160),
    sourceYear: z.number().int().min(1900).max(2100),
    examType: z.enum(['vestibular', 'concurso', 'enem', 'simulado', 'other']),
    subjectMode: z.enum(['single', 'multidisciplinary']),
    primarySubject: z.string().trim().max(120).default(''),
    sourceUrl: z.union([z.url().max(2_000), z.literal('')]).default(''),
    rightsStatus: z
      .enum([
        'pending_review',
        'authorized',
        'public_license',
        'citation_only',
        'restricted',
        'blocked',
      ])
      .default('pending_review'),
    documents: z.array(pdfDocumentSchema).min(1).max(2),
  })
  .refine(
    (value) =>
      value.documents.filter((item) => item.kind === 'exam').length === 1,
    'Envie exatamente um PDF da prova.',
  )
  .refine(
    (value) =>
      new Set(value.documents.map((item) => item.kind)).size ===
      value.documents.length,
    'Envie no máximo um documento de cada tipo.',
  )
  .refine(
    (value) =>
      value.subjectMode !== 'single' || value.primarySubject.length >= 2,
    'Informe a disciplina da prova.',
  );

export const decodePdf = (document) => {
  const contents = Buffer.from(document.dataUrl.split(',')[1], 'base64');
  if (
    contents.length < 100 ||
    contents.length > 15_000_000 ||
    contents.subarray(0, 5).toString('ascii') !== '%PDF-'
  )
    throw Object.assign(
      new Error('O documento deve ser um PDF válido de até 15 MB.'),
      { statusCode: 422 },
    );
  return contents;
};

export function splitExamQuestions(text) {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
  const patterns = [
    {
      expression: /^\s*QUEST(?:ÃO|AO)\s*(\d{1,3})\s*[.):-]?\s*/gim,
      allowEssay: true,
    },
    {
      expression: /^\s*(\d{1,3})\s*[.)-]\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ(])/gm,
      allowEssay: false,
    },
  ];
  for (const pattern of patterns) {
    const matches = [...normalized.matchAll(pattern.expression)];
    const candidates = matches
      .map((match, index) => {
        const end = matches[index + 1]?.index ?? normalized.length;
        const rawText = normalized.slice(match.index, end).trim();
        const alternativeCount = (
          rawText.match(/(?:^|\s)[A-Ea-e]\s*(?:[.)]|\(\s*\))\s+/g) || []
        ).length;
        return {
          id: randomUUID(),
          sourceNumber: Number(match[1]),
          rawText,
          selected: true,
          questionType: alternativeCount >= 4 ? 'single_choice' : 'essay',
          status:
            alternativeCount === 5 || alternativeCount === 0
              ? 'complete'
              : 'review',
        };
      })
      .filter(
        (candidate) =>
          candidate.rawText.length >= 40 &&
          (pattern.allowEssay ||
            (
              candidate.rawText.match(
                /(?:^|\s)[A-Ea-e]\s*(?:[.)]|\(\s*\))\s+/g,
              ) || []
            ).length >= 2),
      );
    if (candidates.length) return candidates;
  }
  return [];
}

const candidateUpdateSchema = z.object({
  rawText: z.string().trim().min(20).max(30_000).optional(),
  selected: z.boolean().optional(),
  questionType: z
    .enum(['single_choice', 'multiple_choice', 'essay'])
    .optional(),
  status: z.enum(['complete', 'review', 'completed']).optional(),
});

export async function updateExamImportCandidate({
  institutionId,
  examImportId,
  candidateId,
  input,
}) {
  const value = candidateUpdateSchema.parse(input);
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT extracted_candidates FROM exam_imports
        WHERE institution_id=$1 AND id=$2 FOR UPDATE`,
      [institutionId, examImportId],
    );
    if (!current.rowCount)
      throw Object.assign(new Error('Importação não encontrada.'), {
        statusCode: 404,
      });
    const candidates = current.rows[0].extracted_candidates || [];
    const index = candidates.findIndex((item) => item.id === candidateId);
    if (index < 0)
      throw Object.assign(new Error('Questão extraída não encontrada.'), {
        statusCode: 404,
      });
    candidates[index] = { ...candidates[index], ...value };
    const completed = candidates.filter(
      (item) => item.status === 'completed',
    ).length;
    await client.query(
      `UPDATE exam_imports
          SET extracted_candidates=$3::jsonb,reviewed_questions=$4,updated_at=now()
        WHERE institution_id=$1 AND id=$2`,
      [institutionId, examImportId, JSON.stringify(candidates), completed],
    );
    return candidates[index];
  });
}

export async function createExamImport({ institutionId, userId, role, input }) {
  const value = examImportSchema.parse(input);
  if (
    role === 'teacher' &&
    !['pending_review', 'restricted'].includes(value.rightsStatus)
  )
    throw Object.assign(
      new Error(
        'A autorização de publicação deve ser confirmada pela coordenação ou administração.',
      ),
      { statusCode: 403 },
    );
  const documents = value.documents.map((document) => ({
    ...document,
    contents: decodePdf(document),
  }));
  return transaction(async (client) => {
    const created = await client.query(
      `INSERT INTO exam_imports
         (institution_id,created_by,source_institution,source_year,exam_type,
          subject_mode,primary_subject,source_url,rights_status)
       VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),NULLIF($8,''),$9)
       RETURNING id,status,created_at`,
      [
        institutionId,
        userId,
        value.sourceInstitution,
        value.sourceYear,
        value.examType,
        value.subjectMode,
        value.primarySubject,
        value.sourceUrl,
        value.rightsStatus,
      ],
    );
    for (const document of documents)
      await client.query(
        `INSERT INTO exam_import_documents
           (exam_import_id,kind,file_name,size_bytes,sha256,file_data)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          created.rows[0].id,
          document.kind,
          document.fileName,
          document.contents.length,
          createHash('sha256').update(document.contents).digest('hex'),
          document.contents,
        ],
      );
    const totalBytes = documents.reduce(
      (sum, document) => sum + document.contents.length,
      0,
    );
    await client.query(
      `INSERT INTO usage_events(institution_id,user_id,kind,quantity,metadata)
       VALUES($1,$2,'storage',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        Math.max(1, Math.ceil(totalBytes / 1024)),
        JSON.stringify({ examImportId: created.rows[0].id, unit: 'KiB' }),
      ],
    );
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'exam_import.created','exam_import',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        created.rows[0].id,
        JSON.stringify({ documents: documents.map((item) => item.kind) }),
      ],
    );
    return {
      id: created.rows[0].id,
      status: created.rows[0].status,
      createdAt: created.rows[0].created_at,
    };
  });
}

export async function listExamImports({ institutionId }) {
  const result = await pool.query({
    text: `SELECT i.id,i.source_institution,i.source_year,i.exam_type,i.subject_mode,
                  i.primary_subject,i.source_url,i.rights_status,i.status,
                  i.detected_questions,i.reviewed_questions,i.error_message,
                  i.extracted_candidates,i.created_at,
                  COALESCE(jsonb_agg(jsonb_build_object(
                    'id',d.id,'kind',d.kind,'fileName',d.file_name,
                    'sizeBytes',d.size_bytes,'sha256',d.sha256
                  ) ORDER BY d.kind) FILTER (WHERE d.id IS NOT NULL),'[]') documents
           FROM exam_imports i
           LEFT JOIN exam_import_documents d ON d.exam_import_id=i.id
           WHERE i.institution_id=$1
           GROUP BY i.id
           ORDER BY i.created_at DESC`,
    values: [institutionId],
  });
  return result.rows.map((row) => ({
    id: row.id,
    sourceInstitution: row.source_institution,
    sourceYear: row.source_year,
    examType: row.exam_type,
    subjectMode: row.subject_mode,
    primarySubject: row.primary_subject,
    sourceUrl: row.source_url,
    rightsStatus: row.rights_status,
    status: row.status,
    detectedQuestions: row.detected_questions,
    reviewedQuestions: row.reviewed_questions,
    error: row.error_message,
    candidates: row.extracted_candidates || [],
    documents: row.documents,
    createdAt: row.created_at,
  }));
}

export async function extractExamImportQuestions({
  institutionId,
  examImportId,
}) {
  const source = await pool.query(
    `SELECT i.id,d.file_data
       FROM exam_imports i
       JOIN exam_import_documents d ON d.exam_import_id=i.id AND d.kind='exam'
      WHERE i.institution_id=$1 AND i.id=$2`,
    [institutionId, examImportId],
  );
  if (!source.rowCount)
    throw Object.assign(new Error('Importação não encontrada.'), {
      statusCode: 404,
    });
  await pool.query(
    `UPDATE exam_imports SET status='extracting',error_message=NULL,updated_at=now()
      WHERE institution_id=$1 AND id=$2`,
    [institutionId, examImportId],
  );
  const workingDirectory = await mkdtemp(join(tmpdir(), 'caderno-import-'));
  try {
    const pdfPath = join(workingDirectory, 'prova.pdf');
    await writeFile(pdfPath, source.rows[0].file_data);
    const { stdout } = await execFileAsync(
      process.env.PDFTOTEXT_BIN || 'pdftotext',
      ['-layout', '-enc', 'UTF-8', pdfPath, '-'],
      { maxBuffer: 20_000_000 },
    );
    let candidates = stdout.split('\f').flatMap((pageText, pageIndex) =>
      splitExamQuestions(pageText).map((candidate) => ({
        ...candidate,
        pageNumber: pageIndex + 1,
        extractionMethod: 'text',
      })),
    );
    if (!candidates.length) {
      const imagePrefix = join(workingDirectory, 'pagina');
      await execFileAsync(
        process.env.PDFTOPPM_BIN || 'pdftoppm',
        ['-r', '220', '-png', pdfPath, imagePrefix],
        { maxBuffer: 20_000_000 },
      );
      const pageImages = (await readdir(workingDirectory))
        .filter((name) => /^pagina-\d+\.png$/.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      try {
        candidates = (
          await Promise.all(
            pageImages.map(async (name, pageIndex) => {
              const { stdout: ocrText } = await execFileAsync(
                process.env.TESSERACT_BIN || 'tesseract',
                [
                  join(workingDirectory, name),
                  'stdout',
                  '-l',
                  'por+eng',
                  '--psm',
                  '6',
                ],
                { maxBuffer: 20_000_000 },
              );
              return splitExamQuestions(ocrText).map((candidate) => ({
                ...candidate,
                pageNumber: pageIndex + 1,
                extractionMethod: 'ocr',
              }));
            }),
          )
        ).flat();
      } catch (error) {
        if (error.code === 'ENOENT')
          throw Object.assign(
            new Error(
              'O PDF não possui texto pesquisável. Instale o Tesseract com os idiomas português e inglês para ativar o OCR.',
            ),
            { statusCode: 503 },
          );
        throw error;
      }
    }
    if (!candidates.length)
      throw Object.assign(
        new Error(
          'Nenhuma questão com alternativas foi reconhecida. O PDF pode ser uma imagem e precisar de OCR.',
        ),
        { statusCode: 422 },
      );
    await pool.query(
      `UPDATE exam_imports
          SET status='needs_review',detected_questions=$3,
              extracted_candidates=$4::jsonb,error_message=NULL,updated_at=now()
        WHERE institution_id=$1 AND id=$2`,
      [
        institutionId,
        examImportId,
        candidates.length,
        JSON.stringify(candidates),
      ],
    );
    return candidates;
  } catch (error) {
    await pool.query(
      `UPDATE exam_imports SET status='failed',error_message=$3,updated_at=now()
        WHERE institution_id=$1 AND id=$2`,
      [institutionId, examImportId, error.message || 'Falha na extração.'],
    );
    throw error;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export async function getExamImportPagePreview({
  institutionId,
  examImportId,
  pageNumber,
}) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 500)
    return { status: 422, error: 'Número de página inválido.' };
  const source = await pool.query(
    `SELECT d.file_data
       FROM exam_imports i
       JOIN exam_import_documents d ON d.exam_import_id=i.id AND d.kind='exam'
      WHERE i.institution_id=$1 AND i.id=$2`,
    [institutionId, examImportId],
  );
  if (!source.rowCount)
    return { status: 404, error: 'Importação não encontrada.' };
  const workingDirectory = await mkdtemp(join(tmpdir(), 'caderno-page-'));
  try {
    const pdfPath = join(workingDirectory, 'prova.pdf');
    const imagePath = join(workingDirectory, 'pagina.jpg');
    await writeFile(pdfPath, source.rows[0].file_data);
    await execFileAsync(
      process.env.PDFTOPPM_BIN || 'pdftoppm',
      [
        '-f',
        String(pageNumber),
        '-l',
        String(pageNumber),
        '-singlefile',
        '-r',
        '130',
        '-jpeg',
        pdfPath,
        join(workingDirectory, 'pagina'),
      ],
      { maxBuffer: 2_000_000 },
    );
    const contents = await readFile(imagePath);
    return { contents, size: contents.length };
  } catch (error) {
    return { status: 422, error: 'A página não pôde ser renderizada.' };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export async function getExamImportDocument({
  institutionId,
  examImportId,
  documentId,
}) {
  const result = await pool.query(
    `SELECT d.file_name,d.size_bytes,d.file_data
       FROM exam_import_documents d
       JOIN exam_imports i ON i.id=d.exam_import_id
      WHERE i.institution_id=$1 AND i.id=$2 AND d.id=$3`,
    [institutionId, examImportId, documentId],
  );
  if (!result.rowCount)
    return { status: 404, error: 'Documento da importação não encontrado.' };
  return {
    fileName: result.rows[0].file_name,
    size: result.rows[0].size_bytes,
    contents: result.rows[0].file_data,
  };
}
