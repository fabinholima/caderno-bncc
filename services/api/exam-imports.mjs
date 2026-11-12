import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { normalizeHighSchoolGrade } from './pedagogical-disciplines.mjs';
import { readExamDocument, storeExamDocument } from './exam-import-storage.mjs';
import { parsePastedExam } from '../../lib/pasted-exam.mjs';
import { downloadPdfUrl } from './pdf-url.mjs';
import { extractPdfInBatches } from './exam-pdf-batches.mjs';
import {
  dataUrlMatchesSignature,
  signatureMessage,
} from './file-signature.mjs';

const execFileAsync = promisify(execFile);

const pdfDocumentSchema = z.object({
  kind: z.enum(['exam', 'answer_key']),
  fileName: z.string().trim().min(1).max(240),
  dataUrl: z
    .string()
    .max(20_500_000)
    .regex(/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/)
    .refine(dataUrlMatchesSignature, 'O arquivo enviado não é um PDF válido.'),
});

export const examImportSchema = z
  .object({
    sourceInstitution: z.string().trim().min(2).max(160),
    sourceYear: z.number().int().min(1900).max(2100),
    examType: z.enum(['vestibular', 'concurso', 'enem', 'simulado', 'other']),
    subjectMode: z.enum(['single', 'multidisciplinary']),
    primarySubject: z.string().trim().max(120).default(''),
    sourceUrl: z.union([z.url().max(2_000), z.literal('')]).default(''),
    examPdfUrl: z.union([z.url().max(2000), z.literal('')]).default(''),
    answerKeyPdfUrl: z.union([z.url().max(2000), z.literal('')]).default(''),
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
    pastedText: z.string().max(1_000_000).default(''),
    documents: z.array(pdfDocumentSchema).max(2).default([]),
  })
  .refine(
    (value) =>
      value.documents.filter((item) => item.kind === 'exam').length +
        Number(Boolean(value.examPdfUrl)) +
        Number(Boolean(value.pastedText.trim())) ===
        1 &&
      !(
        value.pastedText.trim() &&
        (value.documents.length || value.answerKeyPdfUrl)
      ),
    'Escolha PDF ou texto colado para a prova, sem misturar as fontes.',
  )
  .refine(
    (value) =>
      !(
        value.answerKeyPdfUrl &&
        value.documents.some((item) => item.kind === 'answer_key')
      ),
    'Escolha arquivo ou URL para o gabarito.',
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

export function looksLikeTrueFalse(text) {
  return (
    /\b(?:certo\s+ou\s+errado|certo\s*\/\s*errado|verdadeiro\s+ou\s+falso|julgue\s+(?:os\s+)?(?:itens|afirmações)|assinale\s+certo\s+ou\s+errado)\b/i.test(
      text,
    ) || /(?:^|\s)C\s*\(\s*\)\s*E\s*\(\s*\)/i.test(text)
  );
}

export function splitExamQuestions(text) {
  const normalized = repairExtractedQuestionText(
    String(text).replace(/^(\d{1,2})2\s+QUEST(?:ÃO|AO)\b/gim, '$1 QUESTÃO'),
  )
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    // Tesseract commonly reads the ordinal marker in "1ª QUESTÃO" as a
    // trailing 2 ("12 QUESTAO", "22 QUESTAO"). Recover the question number.
    .replace(/^(\d{1,2})2\s+QUEST(?:ÃO|AO)\b/gim, '$1 QUESTÃO')
    .replace(/[ \t]+$/gm, '')
    .trim();
  const patterns = [
    {
      expression: /^\s*(\d{1,3})\s*(?:º|o|°)?\s*QUEST(?:ÃO|AO)\b\s*/gim,
      allowEssay: true,
    },
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
          rawText.match(/(?:^|\s)(?:\(\s*)?[A-Ea-e]\s*(?:[.)]|\(\s*\))\s+/g) ||
          []
        ).length;
        return {
          id: randomUUID(),
          sourceNumber: Number(match[1]),
          rawText,
          selected: true,
          questionType: looksLikeTrueFalse(rawText)
            ? 'true_false'
            : alternativeCount >= 4
              ? 'single_choice'
              : 'essay',
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
                /(?:^|\s)(?:\(\s*)?[A-Ea-e]\s*(?:[.)]|\(\s*\))\s+/g,
              ) || []
            ).length >= 2),
      );
    if (candidates.length) return candidates;
  }
  return [];
}

export function repairExtractedQuestionText(text) {
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\t+/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim());
  const result = [];
  const structural = (line) =>
    /^(?:(?:\d{1,3}\s+)?QUEST(?:ÃO|AO)\s*\d*|[A-Ea-e]\s*(?:[.)]|\(\s*\))|(?:\(\s*)?[A-Ea-e]\s*\)|(?:I|II|III|IV|V)\.\s|\\(?:start|stop)(?:formula|itemize)\b)/i.test(
      line,
    );
  for (const line of lines) {
    if (!line) {
      if (result.at(-1) !== '') result.push('');
      continue;
    }
    const previous = result.at(-1);
    if (!previous || structural(line) || /^\\(?:start|stop)/.test(previous)) {
      result.push(line);
      continue;
    }
    if (/\p{L}[-‐‑]$/u.test(previous) && /^\p{Ll}/u.test(line))
      result[result.length - 1] = `${previous.slice(0, -1)}${line}`;
    else result[result.length - 1] = `${previous} ${line}`;
  }
  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function questionNeedsVisualCapture(rawText) {
  const axisLabels =
    (rawText.match(/(?:^|\s)m[A-Z](?=\s|$)/g) || []).length +
    (rawText.match(/\btempo\b/gi) || []).length;
  const visualReference =
    /\b(?:curva|gr[aá]fico|figura|imagem|estrutura|diagrama|esquema|mapa)\b/i.test(
      rawText,
    );
  const emptyChoices = (rawText.match(/(?:^|\s)[A-E]\s*\(\s*\)(?=\s|$)/g) || [])
    .length;
  return axisLabels >= 4 || (visualReference && emptyChoices >= 2);
}

export function pdfTextNeedsOcr(text) {
  const value = String(text ?? '');
  if (value.length < 120) return true;
  let controls = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) controls += 1;
  }
  const replacement = (value.match(/[�]/g) || []).length;
  const letters = (value.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return controls > 4 || replacement > 2 || letters / value.length < 0.35;
}

function decodeXmlText(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parsePdfQuestionBounds(xml) {
  const pages = [];
  for (const pageMatch of xml.matchAll(
    /<page\b[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g,
  )) {
    const words = [
      ...pageMatch[3].matchAll(
        /<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g,
      ),
    ].map((match) => ({
      xMin: Number(match[1]),
      yMin: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
      text: decodeXmlText(match[5].replace(/<[^>]+>/g, '')),
    }));
    const markers = [];
    for (let index = 0; index < words.length - 1; index += 1) {
      if (!/^quest(?:ão|ao)$/i.test(words[index].text)) continue;
      const number = Number(words[index + 1].text.replace(/\D/g, ''));
      if (number)
        markers.push({
          sourceNumber: number,
          yMin: Math.min(words[index].yMin, words[index + 1].yMin),
        });
    }
    pages.push({
      width: Number(pageMatch[1]),
      height: Number(pageMatch[2]),
      markers,
    });
  }
  return pages;
}

/**
 * Reconstructs question-sized regions from pdftotext's bbox XML.  Unlike
 * pdftotext -layout, this keeps the reading order inside each column and
 * never lets the end of a question in the left column consume text from the
 * right column.
 */
export function parsePdfQuestionRegions(xml) {
  const pages = [];
  for (const pageMatch of xml.matchAll(
    /<page\b[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g,
  )) {
    const width = Number(pageMatch[1]);
    const height = Number(pageMatch[2]);
    const words = [
      ...pageMatch[3].matchAll(
        /<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g,
      ),
    ].map((match) => ({
      xMin: Number(match[1]),
      yMin: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
      text: decodeXmlText(match[5].replace(/<[^>]+>/g, '')),
    }));
    const numericMarkers = words
      .filter((word) =>
        /^(?:quest(?:ão|ao)\s*)?\d{1,3}[.)]?$/.test(word.text.trim()),
      )
      .map((word) => ({
        sourceNumber: Number(word.text.match(/\d+/)?.[0]),
        xMin: word.xMin,
        xMax: word.xMax,
        yMin: word.yMin,
        yMax: word.yMax,
      }))
      .filter(
        (marker) => marker.sourceNumber > 0 && marker.sourceNumber < 1000,
      );
    const explicitMarkers = [];
    for (let index = 0; index < words.length - 1; index += 1) {
      const label = words[index].text.trim();
      const number = words[index + 1].text.trim();
      if (!/^quest(?:ão|ao)$/i.test(label) || !/^\d{1,3}$/.test(number))
        continue;
      explicitMarkers.push({
        sourceNumber: Number(number),
        xMin: words[index].xMin,
        xMax: words[index + 1].xMax,
        yMin: Math.min(words[index].yMin, words[index + 1].yMin),
        yMax: Math.max(words[index].yMax, words[index + 1].yMax),
      });
    }
    // Prefer the explicit QUESTÃO N marker when present. Numeric-only markers
    // are retained for layouts such as Fuvest that print only "01", "02".
    const markers =
      explicitMarkers.length >= 2 ? explicitMarkers : numericMarkers;
    const deduped = [];
    for (const marker of markers) {
      const duplicate = deduped.some(
        (item) =>
          item.sourceNumber === marker.sourceNumber &&
          Math.abs(item.xMin - marker.xMin) < 4 &&
          Math.abs(item.yMin - marker.yMin) < 4,
      );
      if (!duplicate) deduped.push(marker);
    }
    const columns = deduped.reduce((map, marker) => {
      const key = marker.xMin < width / 2 ? 'left' : 'right';
      const list = map.get(key) || [];
      list.push(marker);
      map.set(key, list);
      return map;
    }, new Map());
    const regions = [];
    for (const [column, columnMarkers] of columns) {
      columnMarkers.sort((a, b) => a.yMin - b.yMin);
      columnMarkers.forEach((marker, index) => {
        const next = columnMarkers[index + 1];
        const left = column === 'left' ? 0 : width / 2;
        const right = column === 'left' ? width / 2 : width;
        const regionWords = words.filter(
          (word) =>
            word.xMin >= left - 3 &&
            word.xMax <= right + 3 &&
            word.yMin >= marker.yMin - 2 &&
            word.yMin < (next?.yMin ?? height) - 2,
        );
        const lines = [];
        for (const word of regionWords.sort(
          (a, b) => a.yMin - b.yMin || a.xMin - b.xMin,
        )) {
          let line = lines.at(-1);
          if (!line || Math.abs(line.y - word.yMin) > 3) {
            line = { y: word.yMin, words: [] };
            lines.push(line);
          }
          line.words.push(word.text);
        }
        const rawText = lines.map((line) => line.words.join(' ')).join('\n');
        if (rawText.length >= 40)
          regions.push({
            sourceNumber: marker.sourceNumber,
            rawText: repairExtractedQuestionText(rawText),
            pageNumber: pages.length + 1,
            column,
            xMin: left,
            xMax: right,
            yMin: marker.yMin,
            yMax: next?.yMin ?? height,
          });
      });
    }
    pages.push({ width, height, regions });
  }
  return pages.flatMap((page) => page.regions);
}

export function mergeReextractedCandidates(candidates, previousCandidates) {
  const previousByNumber = new Map(
    previousCandidates.map((candidate) => [candidate.sourceNumber, candidate]),
  );
  return candidates.map((candidate) => {
    const previous = previousByNumber.get(candidate.sourceNumber);
    if (!previous) return candidate;
    return {
      ...candidate,
      id: previous.id || candidate.id,
      selected: previous.selected ?? candidate.selected,
      questionType: previous.questionType || candidate.questionType,
      status: ['completed', 'duplicate', 'ignored'].includes(previous.status)
        ? previous.status
        : candidate.status,
      ...(previous.correctAnswers
        ? { correctAnswers: previous.correctAnswers }
        : {}),
      ...(previous.answerStatus ? { answerStatus: previous.answerStatus } : {}),
      ...(previous.answerConfidence !== undefined
        ? { answerConfidence: previous.answerConfidence }
        : {}),
      ...Object.fromEntries(
        [
          'grade',
          'difficulty',
          'skill',
          'pedagogicalDisciplineId',
          'pedagogicalTopicId',
          'duplicateQuestionId',
          'duplicateQuestionCode',
          // Vínculo com o texto-base já criado no banco para o grupo.
          'sharedTextId',
        ]
          .filter((field) => previous[field] !== undefined)
          .map((field) => [field, previous[field]]),
      ),
      ...(previous.imageDataUrl &&
      previous.imageExtractionMethod !== 'automatic_page_region'
        ? {
            imageDataUrl: previous.imageDataUrl,
            imageAlt: previous.imageAlt,
          }
        : {}),
    };
  });
}

export function examImportProgress(candidates) {
  const resolved = candidates.filter((item) =>
    ['completed', 'duplicate', 'ignored'].includes(item.status),
  ).length;
  return {
    resolved,
    status:
      candidates.length > 0 && resolved === candidates.length
        ? 'completed'
        : 'needs_review',
  };
}

async function createAutomaticVisualCapture({
  pdfPath,
  workingDirectory,
  candidate,
  pageBounds,
}) {
  const markerIndex = pageBounds.markers.findIndex(
    (marker) => marker.sourceNumber === candidate.sourceNumber,
  );
  if (markerIndex < 0) return candidate;
  const marker = pageBounds.markers[markerIndex];
  const nextMarker = pageBounds.markers[markerIndex + 1];
  const top = Math.max(0, marker.yMin - 8);
  const bottom = Math.min(
    pageBounds.height,
    nextMarker ? nextMarker.yMin - 8 : pageBounds.height - 10,
  );
  if (bottom - top < 35) return candidate;
  const pagePath = join(
    workingDirectory,
    `visual-page-${candidate.pageNumber}.jpg`,
  );
  const cropPath = join(workingDirectory, `visual-${candidate.id}.jpg`);
  try {
    await readFile(pagePath);
  } catch {
    await execFileAsync(
      process.env.PDFTOPPM_BIN || 'pdftoppm',
      [
        '-f',
        String(candidate.pageNumber),
        '-l',
        String(candidate.pageNumber),
        '-singlefile',
        '-r',
        '170',
        '-jpeg',
        pdfPath,
        pagePath.replace(/\.jpg$/, ''),
      ],
      { maxBuffer: 2_000_000 },
    );
  }
  const { stdout: dimensions } = await execFileAsync(
    process.env.IMAGEMAGICK_BIN || 'magick',
    ['identify', '-format', '%w %h', pagePath],
  );
  const [pageWidth, pageHeight] = dimensions.split(/\s+/).map(Number);
  const cropY = Math.round((pageHeight * top) / pageBounds.height);
  const cropHeight = Math.max(
    1,
    Math.round((pageHeight * (bottom - top)) / pageBounds.height),
  );
  await execFileAsync(process.env.IMAGEMAGICK_BIN || 'magick', [
    pagePath,
    '-crop',
    `${pageWidth}x${cropHeight}+0+${cropY}`,
    '+repage',
    '-resize',
    '1400x1400>',
    '-strip',
    '-quality',
    '72',
    cropPath,
  ]);
  const contents = await readFile(cropPath);
  if (contents.length > 400_000) return candidate;
  return {
    ...candidate,
    imageDataUrl: `data:image/jpeg;base64,${contents.toString('base64')}`,
    imageAlt: `Recorte automático com elementos visuais da questão ${candidate.sourceNumber}`,
    imageExtractionMethod: 'automatic_page_region',
    status: 'review',
  };
}

const aiReviewFieldSchema = z.enum([
  'rawText',
  'questionType',
  'pedagogicalDisciplineId',
  'grade',
  'difficulty',
  'correctAnswers',
  'skill',
  'pedagogicalTopicId',
]);

const aiReviewSchema = z
  .object({
    acceptedFields: z.array(aiReviewFieldSchema).max(8),
    rejectedFields: z.array(aiReviewFieldSchema).max(8),
  })
  .superRefine((value, context) => {
    const accepted = new Set(value.acceptedFields);
    for (const field of value.rejectedFields) {
      if (accepted.has(field)) {
        context.addIssue({
          code: 'custom',
          message: `O campo ${field} não pode ser aceito e rejeitado ao mesmo tempo.`,
          path: ['rejectedFields'],
        });
      }
    }
  });

export const candidateUpdateSchema = z.object({
  registeredQuestionId: z.uuid().optional(),
  registeredQuestionCode: z
    .string()
    .regex(/^[A-Z]{2,4}-\d{4}$/)
    .optional(),
  resetAi: z.boolean().optional(),
  resolution: z.string().max(20000).optional(),
  editorialReviewed: z.boolean().optional(),
  adoteNote: z.string().max(8000).optional(),
  rawText: z.string().trim().min(20).max(30_000).optional(),
  selected: z.boolean().optional(),
  questionType: z
    .enum(['single_choice', 'multiple_choice', 'true_false', 'essay'])
    .optional(),
  status: z
    .enum(['complete', 'review', 'completed', 'duplicate', 'ignored'])
    .optional(),
  duplicateQuestionId: z.uuid().optional(),
  duplicateQuestionCode: z
    .string()
    .regex(/^[A-Z]{2,4}-\d{4}$/)
    .optional(),
  imageDataUrl: z
    .string()
    .max(550_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
    .refine(dataUrlMatchesSignature, signatureMessage)
    .optional(),
  imageAlt: z.string().trim().min(3).max(240).optional(),
  correctAnswers: z
    .array(z.enum(['A', 'B', 'C', 'D', 'E']))
    .max(5)
    .optional(),
  answerStatus: z.enum(['missing', 'suggested', 'confirmed']).optional(),
  answerConfidence: z.number().min(0).max(1).optional(),
  grade: z
    .enum(['1ª série', '2ª série', '3ª série'])
    .optional()
    .or(z.literal('')),
  difficulty: z.enum(['Fácil', 'Média', 'Difícil']).optional(),
  skill: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[0-9A-Z]{4,12}$/)
    .optional()
    .or(z.literal('')),
  pedagogicalDisciplineId: z.uuid().optional().or(z.literal('')),
  pedagogicalTopicId: z.uuid().optional().or(z.literal('')),
  aiReview: aiReviewSchema.optional(),
  // Texto-base sugerido pela IA (aceito junto com o texto) e o texto-base do
  // banco criado para o grupo no primeiro cadastro.
  sharedText: z
    .object({
      title: z.string().trim().max(300).default(''),
      source: z.string().trim().max(500).default(''),
      content: z.string().trim().min(1).max(30000),
      sourceNumbers: z.array(z.number().int().min(1).max(9999)).max(200),
    })
    .nullable()
    .optional(),
  sharedTextId: z.uuid().nullable().optional(),
});

const cropSchema = z
  .object({
    x: z.number().min(0).max(99),
    y: z.number().min(0).max(99),
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100),
  })
  .refine((value) => value.x + value.width <= 100, 'Recorte excede a largura.')
  .refine((value) => value.y + value.height <= 100, 'Recorte excede a altura.');

export async function updateExamImportCandidate({
  institutionId,
  examImportId,
  candidateId,
  input,
  userId,
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
    const previous = candidates[index];
    if (
      (previous.status === 'completed' || previous.registeredQuestionId) &&
      value.status &&
      value.status !== 'completed'
    )
      throw Object.assign(
        new Error(
          'A importação já foi cadastrada. A questão permanece disponível no banco e no histórico de concluídas.',
        ),
        { statusCode: 409 },
      );
    if (
      value.status === 'completed' &&
      previous.status !== 'completed' &&
      !value.registeredQuestionId &&
      !previous.registeredQuestionId
    )
      throw Object.assign(
        new Error(
          'Cadastre a questão no banco antes de concluir a importação.',
        ),
        { statusCode: 422 },
      );
    if (value.registeredQuestionId) {
      const question = await client.query(
        'SELECT id,public_code FROM questions WHERE id=$1 AND institution_id=$2',
        [value.registeredQuestionId, institutionId],
      );
      if (!question.rowCount)
        throw Object.assign(
          new Error('Questão cadastrada não encontrada nesta instituição.'),
          { statusCode: 422 },
        );
      value.registeredQuestionCode = question.rows[0].public_code;
      value.status = 'completed';
      value.selected = false;
    }
    if (value.resetAi) {
      const running = await client.query(
        "SELECT 1 FROM exam_import_jobs WHERE exam_import_id=$1 AND job_type='ai_analysis' AND status IN ('queued','running')",
        [examImportId],
      );
      if (running.rowCount)
        throw Object.assign(
          new Error(
            'Aguarde ou cancele a análise atual antes de reprocessar a questão.',
          ),
          { statusCode: 409 },
        );
      if (
        ['completed', 'duplicate', 'ignored'].includes(candidates[index].status)
      )
        throw Object.assign(
          new Error('Somente questões pendentes podem ser reprocessadas.'),
          { statusCode: 409 },
        );
      const previous = candidates[index];
      candidates[index] = {
        ...previous,
        aiSuggestion: undefined,
        aiReview: undefined,
        selected: true,
        aiAnalysisHistory: [
          ...(previous.aiAnalysisHistory || []).slice(-9),
          {
            suggestion: previous.aiSuggestion,
            review: previous.aiReview,
            resetBy: userId,
            resetAt: new Date().toISOString(),
          },
        ],
      };
      delete value.resetAi;
    }
    const reviewedAt = value.aiReview ? new Date().toISOString() : null;
    const reviewHistory = candidates[index].aiReview?.history || [];
    candidates[index] = {
      ...candidates[index],
      ...value,
      ...(value.registeredQuestionId
        ? { registeredAt: previous.registeredAt || new Date().toISOString() }
        : {}),
      ...(value.rawText !== undefined ||
      value.resolution !== undefined ||
      value.adoteNote !== undefined
        ? { editorialReviewed: false }
        : {}),
      ...(value.aiReview
        ? {
            aiReview: {
              ...value.aiReview,
              reviewedAt,
              reviewedBy: userId || null,
              history: [
                ...reviewHistory.slice(-49),
                {
                  ...value.aiReview,
                  reviewedAt,
                  reviewedBy: userId || null,
                },
              ],
            },
          }
        : {}),
    };
    const progress = examImportProgress(candidates);
    await client.query(
      `UPDATE exam_imports
          SET extracted_candidates=$3::jsonb,reviewed_questions=$4,
              status=$5,updated_at=now()
        WHERE institution_id=$1 AND id=$2`,
      [
        institutionId,
        examImportId,
        JSON.stringify(candidates),
        progress.resolved,
        progress.status,
      ],
    );
    return candidates[index];
  });
}

export function pastedQuestionType(question) {
  const alternatives = question.alternatives || {};
  const isLabeledJudgment =
    Object.keys(alternatives).sort().join('') === 'CE' &&
    /certo/i.test(alternatives.C || '') &&
    /errado/i.test(alternatives.E || '');
  const isFixedTrueFalse =
    Object.keys(alternatives).sort().join('') === 'AB' &&
    /certo/i.test(alternatives.A || '') &&
    /errado/i.test(alternatives.B || '');
  const statement = question.statement || '';
  const isJudgmentPrompt =
    /\b(?:certo\s+ou\s+errado|certo\s*\/\s*errado|verdadeiro\s+ou\s+falso|julgue\s+(?:os\s+)?(?:itens|afirmações))\b/i.test(
      statement,
    );
  if (isLabeledJudgment || isFixedTrueFalse || isJudgmentPrompt)
    return 'true_false';
  return question.correctAnswers?.length > 1
    ? 'multiple_choice'
    : Object.keys(alternatives).length
      ? 'single_choice'
      : 'essay';
}

export function pastedQuestionAnswers(question) {
  if (pastedQuestionType(question) !== 'true_false')
    return question.correctAnswers || [];
  const alternatives = question.alternatives || {};
  if (Object.keys(alternatives).sort().join('') === 'CE')
    return (question.correctAnswers || []).map((answer) =>
      answer === 'C' ? 'A' : answer === 'E' ? 'B' : answer,
    );
  return (question.correctAnswers || []).map((answer) =>
    answer === 'B' || answer === 'E' ? 'B' : 'A',
  );
}

const catalogKey = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Turns DISCIPLINA/SÉRIE/TÓPICO/SUBTÓPICO names from a text batch into catalog
// ids. Nothing is created: an unknown or ambiguous name rejects the whole batch.
export async function resolvePastedClassification(
  client,
  institutionId,
  value,
  candidates,
) {
  if (!candidates.some((candidate) => candidate.discipline || candidate.topic))
    return candidates;
  const fail = (candidate, message) => {
    throw Object.assign(
      new Error(
        `Questão ${candidate.sourceNumber}: ${message} Confira o cadastro em Planejamento.`,
      ),
      { statusCode: 422 },
    );
  };
  const disciplines = (
    await client.query(
      `SELECT id,name FROM pedagogical_disciplines
      WHERE institution_id=$1 AND stage='Ensino Médio'`,
      [institutionId],
    )
  ).rows;
  const topics = (
    await client.query(
      `SELECT id,name,discipline_id,parent_id,grade_range FROM pedagogical_topics
      WHERE institution_id=$1 AND active`,
      [institutionId],
    )
  ).rows;
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const topicGrade = (topic) => {
    for (let current = topic; current; current = byId.get(current.parent_id))
      if (current.grade_range)
        return normalizeHighSchoolGrade(current.grade_range);
    return '';
  };
  const primary = value.subjectMode === 'single' ? value.primarySubject : '';
  return candidates.map((candidate) => {
    const {
      discipline: disciplineName,
      topic: topicName,
      subtopic,
      detail,
      ...rest
    } = candidate;
    if (!disciplineName && !topicName) return rest;
    const name = disciplineName || primary;
    if (
      disciplineName &&
      primary &&
      catalogKey(disciplineName) !== catalogKey(primary)
    )
      fail(
        candidate,
        `a disciplina ${disciplineName} difere da disciplina da prova (${primary}).`,
      );
    if (!name) fail(candidate, 'informe a DISCIPLINA para localizar o tópico.');
    const discipline = disciplines.find(
      (item) => catalogKey(item.name) === catalogKey(name),
    );
    if (!discipline)
      fail(candidate, `disciplina ${name} não cadastrada no Ensino Médio.`);
    const resolved = { ...rest, pedagogicalDisciplineId: discipline.id };
    if (!topicName) return resolved;
    let parent = null;
    for (const [label, text] of [
      ['tópico', topicName],
      ['subtópico', subtopic],
      ['detalhamento', detail],
    ]) {
      if (!text) break;
      const matches = topics.filter(
        (topic) =>
          topic.discipline_id === discipline.id &&
          (topic.parent_id || null) === (parent?.id || null) &&
          catalogKey(topic.name) === catalogKey(text) &&
          (!candidate.grade ||
            !topicGrade(topic) ||
            topicGrade(topic) === candidate.grade),
      );
      if (!matches.length)
        fail(
          candidate,
          `${label} ${text} não encontrado em ${discipline.name}${candidate.grade ? `, ${candidate.grade}` : ''}${parent ? `, dentro de ${parent.name}` : ''}.`,
        );
      if (matches.length > 1)
        fail(
          candidate,
          `${label} ${text} existe em mais de uma série; informe a SÉRIE.`,
        );
      parent = matches[0];
    }
    resolved.pedagogicalTopicId = parent.id;
    if (!resolved.grade && topicGrade(parent))
      resolved.grade = topicGrade(parent);
    return resolved;
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
  if (value.examPdfUrl)
    value.documents.push(await downloadPdfUrl(value.examPdfUrl, 'exam'));
  if (value.answerKeyPdfUrl)
    value.documents.push(
      await downloadPdfUrl(value.answerKeyPdfUrl, 'answer_key'),
    );
  let pastedCandidates = [];
  if (value.pastedText.trim()) {
    try {
      pastedCandidates = parsePastedExam(value.pastedText).map((question) => ({
        id: randomUUID(),
        sourceNumber: question.sourceNumber,
        rawText: question.rawText,
        resolution: question.resolution,
        adoteNote: question.adoteNote,
        ...(question.skill ? { skill: question.skill } : {}),
        ...Object.fromEntries(
          ['discipline', 'grade', 'topic', 'subtopic', 'detail']
            .filter((field) => question[field])
            .map((field) => [field, question[field]]),
        ),
        selected: true,
        status: 'review',
        questionType: pastedQuestionType(question),
        correctAnswers: pastedQuestionAnswers(question),
        answerStatus: question.correctAnswers.length ? 'suggested' : 'missing',
        extractionMethod: 'pasted-text',
      }));
    } catch (error) {
      throw Object.assign(error, { statusCode: 422 });
    }
  }
  const documents = value.documents.map((document) => ({
    ...document,
    contents: decodePdf(document),
  }));
  return transaction(async (client) => {
    pastedCandidates = await resolvePastedClassification(
      client,
      institutionId,
      value,
      pastedCandidates,
    );
    const skillCodes = [
      ...new Set(
        pastedCandidates.map((candidate) => candidate.skill).filter(Boolean),
      ),
    ];
    if (skillCodes.length) {
      const catalog = await client.query(
        `SELECT DISTINCT skill.code,discipline.id AS discipline_id FROM curriculum_skills skill
         JOIN pedagogical_discipline_skills relation ON relation.skill_id=skill.id
         JOIN pedagogical_disciplines discipline ON discipline.id=relation.discipline_id
         WHERE discipline.institution_id=$1 AND skill.code=ANY($2::text[])
           AND ($3::text='' OR discipline.name=$3)`,
        [
          institutionId,
          skillCodes,
          value.subjectMode === 'single' ? value.primarySubject : '',
        ],
      );
      const valid = (candidate) =>
        catalog.rows.some(
          (row) =>
            row.code === candidate.skill &&
            (!candidate.pedagogicalDisciplineId ||
              !row.discipline_id ||
              row.discipline_id === candidate.pedagogicalDisciplineId),
        );
      const invalid = pastedCandidates.find(
        (candidate) => candidate.skill && !valid(candidate),
      );
      if (invalid)
        throw Object.assign(
          new Error(
            `Questão ${invalid.sourceNumber}: habilidade ${invalid.skill} não cadastrada para a disciplina desta ${invalid.pedagogicalDisciplineId ? 'questão' : 'importação'}. Confira o código em Planejamento.`,
          ),
          { statusCode: 422 },
        );
    }
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
    if (pastedCandidates.length)
      await client.query(
        `UPDATE exam_imports SET status='needs_review',detected_questions=$2,extracted_candidates=$3::jsonb WHERE id=$1`,
        [
          created.rows[0].id,
          pastedCandidates.length,
          JSON.stringify(pastedCandidates),
        ],
      );
    for (const document of documents) {
      const stored = await storeExamDocument(
        created.rows[0].id,
        document.kind,
        document.contents,
      );
      await client.query(
        `INSERT INTO exam_import_documents
           (exam_import_id,kind,file_name,size_bytes,sha256,file_data,
            storage_provider,storage_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          created.rows[0].id,
          document.kind,
          document.fileName,
          document.contents.length,
          createHash('sha256').update(document.contents).digest('hex'),
          stored.databaseContents,
          stored.provider,
          stored.key,
        ],
      );
    }
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
      status: pastedCandidates.length ? 'needs_review' : created.rows[0].status,
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
                  latest_job.id AS job_id,latest_job.status AS job_status,
                  latest_job.stage AS job_stage,latest_job.progress AS job_progress,
                  latest_job.attempts AS job_attempts,
                  latest_job.error_message AS job_error,
                  ai_job.id AS ai_job_id,ai_job.status AS ai_job_status,
                  ai_job.stage AS ai_job_stage,ai_job.progress AS ai_job_progress,
                  ai_job.attempts AS ai_job_attempts,ai_job.error_message AS ai_job_error,
                  ai_job.provider AS ai_job_provider,ai_job.model AS ai_job_model,
                  ai_job.metrics AS ai_job_metrics,ai_job.prompt_version AS ai_prompt_version,
                  COALESCE(jsonb_agg(jsonb_build_object(
                    'id',d.id,'kind',d.kind,'fileName',d.file_name,
                    'sizeBytes',d.size_bytes,'sha256',d.sha256
                  ) ORDER BY d.kind) FILTER (WHERE d.id IS NOT NULL),'[]') documents
           FROM exam_imports i
           LEFT JOIN LATERAL (
             SELECT job.id,job.status,job.stage,job.progress,job.attempts,
                    job.error_message
             FROM exam_import_jobs job WHERE job.exam_import_id=i.id AND job.job_type='extract'
             ORDER BY job.created_at DESC LIMIT 1
           ) latest_job ON true
           LEFT JOIN LATERAL (
             SELECT job.id,job.status,job.stage,job.progress,job.attempts,
                    job.error_message,job.provider,job.model,job.metrics,job.prompt_version
             FROM exam_import_jobs job WHERE job.exam_import_id=i.id AND job.job_type='ai_analysis'
             ORDER BY job.created_at DESC LIMIT 1
           ) ai_job ON true
           LEFT JOIN exam_import_documents d ON d.exam_import_id=i.id
           WHERE i.institution_id=$1
           GROUP BY i.id,latest_job.id,latest_job.status,latest_job.stage,
                    latest_job.progress,latest_job.attempts,latest_job.error_message,
                    ai_job.id,ai_job.status,ai_job.stage,ai_job.progress,ai_job.attempts,
                    ai_job.error_message,ai_job.provider,ai_job.model,ai_job.metrics,ai_job.prompt_version
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
    processingJob: row.job_id
      ? {
          id: row.job_id,
          status: row.job_status,
          stage: row.job_stage,
          progress: row.job_progress,
          attempts: row.job_attempts,
          error: row.job_error,
        }
      : null,
    aiJob: row.ai_job_id
      ? {
          id: row.ai_job_id,
          status: row.ai_job_status,
          stage: row.ai_job_stage,
          progress: row.ai_job_progress,
          attempts: row.ai_job_attempts,
          error: row.ai_job_error,
          provider: row.ai_job_provider,
          model: row.ai_job_model,
          metrics: row.ai_job_metrics,
          promptVersion: row.ai_prompt_version,
        }
      : null,
    documents: row.documents,
    createdAt: row.created_at,
  }));
}

export async function deleteExamImport({ institutionId, examImportId }) {
  const result = await pool.query(
    `DELETE FROM exam_imports
      WHERE institution_id=$1 AND id=$2
        AND NOT EXISTS (
          SELECT 1 FROM exam_import_jobs j
           WHERE j.exam_import_id=exam_imports.id
             AND j.status IN ('queued','running')
        )
      RETURNING id`,
    [institutionId, examImportId],
  );
  return Boolean(result.rowCount);
}

export async function extractExamImportQuestions({
  institutionId,
  examImportId,
  onProgress = async () => {},
  shouldCancel = async () => false,
}) {
  const source = await pool.query(
    `SELECT i.id,i.extracted_candidates,d.file_data,d.storage_provider,d.storage_key
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
    const checkpoint = async (stage, progress) => {
      if (await shouldCancel()) {
        const error = new Error('Importação cancelada pelo usuário.');
        error.code = 'IMPORT_CANCELLED';
        throw error;
      }
      await onProgress(stage, progress);
    };
    await checkpoint('reading_pdf', 10);
    const pdfPath = join(workingDirectory, 'prova.pdf');
    await writeFile(pdfPath, await readExamDocument(source.rows[0]));
    const { stdout } = await execFileAsync(
      process.env.PDFTOTEXT_BIN || 'pdftotext',
      ['-layout', '-enc', 'UTF-8', pdfPath, '-'],
      { maxBuffer: 20_000_000 },
    );
    const pageTexts = stdout.split('\f');
    let candidates = pageTexts.flatMap((pageText, pageIndex) =>
      splitExamQuestions(pageText).map((candidate) => ({
        ...candidate,
        pageNumber: pageIndex + 1,
        extractionMethod: 'text',
      })),
    );
    // Prefer question-sized regions whenever bbox data is available. This is
    // essential for two-column exams: page-wide extraction interleaves columns.
    try {
      const { stdout: bboxXml } = await execFileAsync(
        process.env.PDFTOTEXT_BIN || 'pdftotext',
        ['-bbox-layout', '-enc', 'UTF-8', pdfPath, '-'],
        { maxBuffer: 30_000_000 },
      );
      const regions = parsePdfQuestionRegions(bboxXml);
      const regionCandidates = regions
        .map((region) => {
          const alternatives = (
            region.rawText.match(/(?:^|\s)[A-Ea-e]\s*(?:[.)]|\(\s*\))\s+/g) ||
            []
          ).length;
          return {
            id: randomUUID(),
            sourceNumber: region.sourceNumber,
            rawText: region.rawText,
            pageNumber: region.pageNumber,
            selected: true,
            questionType: looksLikeTrueFalse(region.rawText)
              ? 'true_false'
              : alternatives >= 4
                ? 'single_choice'
                : 'essay',
            status:
              alternatives === 5 || alternatives === 0 ? 'complete' : 'review',
            extractionMethod: 'text-region',
            region: {
              column: region.column,
              xMin: region.xMin,
              xMax: region.xMax,
              yMin: region.yMin,
              yMax: region.yMax,
            },
          };
        })
        .filter(
          (candidate) =>
            candidate.rawText.length >= 40 &&
            (candidate.questionType === 'essay' ||
              candidate.rawText.match(/(?:^|\s)[A-Ea-e]\s*(?:[.)]|\(\s*\))\s+/g)
                ?.length >= 2),
        );
      if (regionCandidates.length >= 2) candidates = regionCandidates;
    } catch {
      // Some PDFs do not expose bbox XML; the existing page/OCR fallback below
      // remains valid for those documents.
    }
    await checkpoint('extracting_text', 35);
    const useGeminiPdf =
      process.env.EXAM_AI_PROVIDER === 'gemini' &&
      Boolean(process.env.GEMINI_API_KEY) &&
      (!candidates.length || pageTexts.some(pdfTextNeedsOcr));
    if (useGeminiPdf) {
      await transaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('exam-ai-daily-admission'))",
        );
        const allowed = await client.query(
          `SELECT EXISTS(SELECT 1 FROM exam_ai_daily_admissions WHERE usage_day=(now() AT TIME ZONE 'America/Campo_Grande')::date AND exam_import_id=$1) AS admitted,
          (SELECT count(*)::int FROM exam_ai_daily_admissions WHERE usage_day=(now() AT TIME ZONE 'America/Campo_Grande')::date) AS total`,
          [examImportId],
        );
        if (!allowed.rows[0].admitted && allowed.rows[0].total >= 3)
          throw Object.assign(
            new Error(
              'Limite de três provas com IA por dia atingido. A extração aguardará uma nova tentativa.',
            ),
            { code: 'AI_QUOTA_EXHAUSTED', retryAfterSeconds: 3600 },
          );
        await client.query(
          "INSERT INTO exam_ai_daily_admissions(usage_day,exam_import_id) VALUES((now() AT TIME ZONE 'America/Campo_Grande')::date,$1) ON CONFLICT DO NOTHING",
          [examImportId],
        );
      });
      await checkpoint('reading_pdf_with_gemini', 55);
      const { stdout: pdfInfo } = await execFileAsync('pdfinfo', [pdfPath], {
        maxBuffer: 1000000,
      });
      const pageCount = Number(/^Pages:\s+(\d+)/m.exec(pdfInfo)?.[1]);
      candidates = await extractPdfInBatches({
        pdfPath,
        directory: workingDirectory,
        pageCount,
        onProgress: checkpoint,
      });
    }
    if (
      !useGeminiPdf &&
      (!candidates.length || pageTexts.some(pdfTextNeedsOcr))
    ) {
      await checkpoint('rendering_pages', 45);
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
        await checkpoint('running_ocr', 55);
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
    if (!candidates.length) {
      const manualMessage =
        'A extração automática não reconheceu questões. O PDF foi mantido para revisão manual por página e recorte.';
      await pool.query(
        `UPDATE exam_imports
            SET status='needs_review',detected_questions=0,
                extracted_candidates='[]'::jsonb,error_message=$3,updated_at=now()
          WHERE institution_id=$1 AND id=$2`,
        [institutionId, examImportId, manualMessage],
      );
      return [];
    }
    await checkpoint('normalizing_questions', 72);
    candidates = mergeReextractedCandidates(
      candidates,
      source.rows[0].extracted_candidates || [],
    );
    if (
      candidates.some((candidate) =>
        questionNeedsVisualCapture(candidate.rawText),
      )
    ) {
      await checkpoint('extracting_images', 82);
      try {
        const { stdout: boundingXml } = await execFileAsync(
          process.env.PDFTOTEXT_BIN || 'pdftotext',
          ['-bbox-layout', '-enc', 'UTF-8', pdfPath, '-'],
          { maxBuffer: 30_000_000 },
        );
        const pageBounds = parsePdfQuestionBounds(boundingXml);
        candidates = await Promise.all(
          candidates.map((candidate) =>
            questionNeedsVisualCapture(candidate.rawText) &&
            pageBounds[candidate.pageNumber - 1]
              ? createAutomaticVisualCapture({
                  pdfPath,
                  workingDirectory,
                  candidate,
                  pageBounds: pageBounds[candidate.pageNumber - 1],
                })
              : candidate,
          ),
        );
      } catch {
        candidates = candidates.map((candidate) =>
          questionNeedsVisualCapture(candidate.rawText)
            ? {
                ...candidate,
                visualCaptureWarning:
                  'Há indícios de conteúdo gráfico, mas o recorte automático falhou. Use o recorte manual.',
                status: 'review',
              }
            : candidate,
        );
      }
    }
    await checkpoint('saving_results', 95);
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
      `UPDATE exam_imports SET status=$3,error_message=$4,updated_at=now()
        WHERE institution_id=$1 AND id=$2`,
      [
        institutionId,
        examImportId,
        error.code === 'IMPORT_CANCELLED'
          ? 'cancelled'
          : error.code === 'AI_QUOTA_EXHAUSTED'
            ? 'queued'
            : 'failed',
        error.message || 'Falha na extração.',
      ],
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
    `SELECT d.file_data,d.storage_provider,d.storage_key
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
    await writeFile(pdfPath, await readExamDocument(source.rows[0]));
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
  } catch {
    return { status: 422, error: 'A página não pôde ser renderizada.' };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export async function cropExamImportCandidateImage({
  institutionId,
  examImportId,
  candidateId,
  input,
}) {
  const crop = cropSchema.parse(input);
  const source = await pool.query(
    `SELECT d.file_data,d.storage_provider,d.storage_key,i.extracted_candidates
       FROM exam_imports i
       JOIN exam_import_documents d ON d.exam_import_id=i.id AND d.kind='exam'
      WHERE i.institution_id=$1 AND i.id=$2`,
    [institutionId, examImportId],
  );
  if (!source.rowCount)
    throw Object.assign(new Error('Importação não encontrada.'), {
      statusCode: 404,
    });
  const candidate = (source.rows[0].extracted_candidates || []).find(
    (item) => item.id === candidateId,
  );
  if (!candidate?.pageNumber)
    throw Object.assign(new Error('A questão não possui página associada.'), {
      statusCode: 422,
    });
  const workingDirectory = await mkdtemp(join(tmpdir(), 'caderno-crop-'));
  try {
    const pdfPath = join(workingDirectory, 'prova.pdf');
    const pagePath = join(workingDirectory, 'pagina.jpg');
    const cropPath = join(workingDirectory, 'recorte.jpg');
    await writeFile(pdfPath, await readExamDocument(source.rows[0]));
    await execFileAsync(
      process.env.PDFTOPPM_BIN || 'pdftoppm',
      [
        '-f',
        String(candidate.pageNumber),
        '-l',
        String(candidate.pageNumber),
        '-singlefile',
        '-r',
        '170',
        '-jpeg',
        pdfPath,
        join(workingDirectory, 'pagina'),
      ],
      { maxBuffer: 2_000_000 },
    );
    const { stdout: dimensions } = await execFileAsync(
      process.env.IMAGEMAGICK_BIN || 'magick',
      ['identify', '-format', '%w %h', pagePath],
    );
    const [pageWidth, pageHeight] = dimensions.split(/\s+/).map(Number);
    const x = Math.round((pageWidth * crop.x) / 100);
    const y = Math.round((pageHeight * crop.y) / 100);
    const width = Math.round((pageWidth * crop.width) / 100);
    const height = Math.round((pageHeight * crop.height) / 100);
    await execFileAsync(process.env.IMAGEMAGICK_BIN || 'magick', [
      pagePath,
      '-crop',
      `${width}x${height}+${x}+${y}`,
      '+repage',
      '-resize',
      '1400x1400>',
      '-strip',
      '-quality',
      '78',
      cropPath,
    ]);
    const contents = await readFile(cropPath);
    if (contents.length > 400_000)
      throw Object.assign(
        new Error('O recorte ficou muito grande. Selecione uma área menor.'),
        { statusCode: 422 },
      );
    const imageDataUrl = `data:image/jpeg;base64,${contents.toString('base64')}`;
    let cropText = '';
    try {
      const { stdout } = await execFileAsync(
        process.env.TESSERACT_BIN || 'tesseract',
        [cropPath, 'stdout', '-l', 'por+eng', '--psm', '6'],
        { maxBuffer: 2_000_000 },
      );
      cropText = repairExtractedQuestionText(stdout);
    } catch (error) {
      if (error.code === 'ENOENT') cropText = '';
    }
    const rawText = cropText
      ? `${candidate.rawText}\n\n[Texto extraído do recorte]\n${cropText}`
      : candidate.rawText;
    return updateExamImportCandidate({
      institutionId,
      examImportId,
      candidateId,
      input: {
        imageDataUrl,
        imageAlt: `Figura original da questão ${candidate.sourceNumber}`,
        rawText,
        status: 'review',
      },
    });
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export function parseAnswerKeyText(text, expectedNumbers = []) {
  const expected = new Set(expectedNumbers.map(Number));
  const normalized = text
    .replace(/\r/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
  const answers = new Map();
  for (const match of normalized.matchAll(
    /(?:^|\s)(\d{1,3})\s*(?:[-.:)]|\s)\s*(A|B|C|D|E|CERTO|ERRADO|VERDADEIRO|FALSO)(?=\s|$)/gi,
  )) {
    const number = Number(match[1]);
    if ((!expected.size || expected.has(number)) && !answers.has(number))
      answers.set(
        number,
        { CERTO: 'C', VERDADEIRO: 'C', ERRADO: 'E', FALSO: 'E' }[
          match[2].toUpperCase()
        ] || match[2].toUpperCase(),
      );
  }
  const expectedCount = expected.size || answers.size;
  const coverage = expectedCount ? answers.size / expectedCount : 0;
  const confidence = coverage >= 0.7 ? 0.95 : coverage >= 0.3 ? 0.75 : 0.45;
  return {
    coverage,
    confidence,
    answers: [...answers.entries()].map(([sourceNumber, answer]) => ({
      sourceNumber,
      answer,
    })),
  };
}

export async function extractExamImportAnswerKey({
  institutionId,
  examImportId,
}) {
  const source = await pool.query(
    `SELECT d.file_data,d.storage_provider,d.storage_key,i.extracted_candidates
       FROM exam_imports i
       JOIN exam_import_documents d ON d.exam_import_id=i.id AND d.kind='answer_key'
      WHERE i.institution_id=$1 AND i.id=$2`,
    [institutionId, examImportId],
  );
  if (!source.rowCount)
    throw Object.assign(new Error('Envie o PDF do gabarito primeiro.'), {
      statusCode: 422,
    });
  const candidates = source.rows[0].extracted_candidates || [];
  if (!candidates.length)
    throw Object.assign(
      new Error('Extraia as questões antes de ler o gabarito.'),
      {
        statusCode: 422,
      },
    );
  const workingDirectory = await mkdtemp(join(tmpdir(), 'caderno-key-'));
  try {
    const pdfPath = join(workingDirectory, 'gabarito.pdf');
    await writeFile(pdfPath, await readExamDocument(source.rows[0]));
    const { stdout } = await execFileAsync(
      process.env.PDFTOTEXT_BIN || 'pdftotext',
      ['-layout', '-enc', 'UTF-8', pdfPath, '-'],
      { maxBuffer: 10_000_000 },
    );
    const parsed = parseAnswerKeyText(
      stdout,
      candidates.map((candidate) => candidate.sourceNumber),
    );
    if (
      parsed.answers.length < Math.min(3, candidates.length) ||
      parsed.coverage < 0.3
    )
      throw Object.assign(
        new Error(
          'O arquivo não parece conter um gabarito objetivo reconhecível. Confira se o PDF correto foi enviado.',
        ),
        { statusCode: 422 },
      );
    const answerByNumber = new Map(
      parsed.answers.map((item) => [item.sourceNumber, item.answer]),
    );
    const updated = candidates.map((candidate) => {
      const answer = answerByNumber.get(candidate.sourceNumber);
      return answer && candidate.questionType !== 'essay'
        ? {
            ...candidate,
            correctAnswers: [
              candidate.questionType === 'true_false'
                ? { C: 'A', E: 'B' }[answer] || answer
                : answer,
            ],
            answerStatus: 'suggested',
            answerConfidence: parsed.confidence,
            status: 'review',
          }
        : candidate;
    });
    await pool.query(
      `UPDATE exam_imports SET extracted_candidates=$3::jsonb,updated_at=now()
        WHERE institution_id=$1 AND id=$2`,
      [institutionId, examImportId, JSON.stringify(updated)],
    );
    return {
      detected: parsed.answers.length,
      coverage: parsed.coverage,
      confidence: parsed.confidence,
    };
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
    `SELECT d.file_name,d.size_bytes,d.file_data,d.storage_provider,d.storage_key
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
    contents: await readExamDocument(result.rows[0]),
  };
}
