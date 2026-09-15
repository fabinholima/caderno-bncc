import process from 'node:process';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const DEFAULT_SHEET = 'ITA arquivos';
const MAX_PDF_BYTES = 15_000_000;
const execFileAsync = promisify(execFile);
const readerPath = fileURLToPath(new URL('./read-ita-catalog.py', import.meta.url));

export function normalizeItaRows(rows) {
  const records = rows
    .map((row) => ({
      year: Number(row[0]),
      phase: String(row[1] || '').trim(),
      file: String(row[2] || '').trim(),
      url: String(row[3] || '').trim(),
      validation: String(row[4] || '').trim(),
    }))
    .filter(
      (item) =>
        Number.isInteger(item.year) &&
        item.phase &&
        item.file &&
        /^https:\/\//.test(item.url),
    );

  const answerKeys = new Map(
    records
      .filter((item) => item.file.toLowerCase() === 'gabarito')
      .map((item) => [`${item.year}|${item.phase}`, item]),
  );

  return records
    .filter((item) => item.file.toLowerCase() !== 'gabarito')
    .map((exam) => {
      const answerKey = answerKeys.get(`${exam.year}|${exam.phase}`);
      const firstPhase = /^1/.test(exam.phase);
      return {
        catalogKey: `ita-${exam.year}-${slug(exam.phase)}-${slug(exam.file)}`,
        sourceInstitution: 'ITA',
        sourceYear: exam.year,
        examType: 'vestibular',
        subjectMode: firstPhase ? 'multidisciplinary' : 'single',
        primarySubject: firstPhase || exam.file === 'Prova' ? '' : exam.file,
        phase: exam.phase,
        rightsStatus: 'pending_review',
        sourceUrl: exam.url,
        documents: [
          { kind: 'exam', url: exam.url },
          ...(answerKey ? [{ kind: 'answer_key', url: answerKey.url }] : []),
        ],
      };
    });
}

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function readItaCatalog(path, sheetName = DEFAULT_SHEET) {
  const python = process.env.CATALOG_PYTHON || 'python3';
  const { stdout } = await execFileAsync(python, [readerPath, path, sheetName], {
    maxBuffer: 2_000_000,
  });
  return normalizeItaRows(JSON.parse(stdout));
}

async function downloadPdf(document) {
  const response = await fetch(document.url, { redirect: 'follow' });
  if (!response.ok)
    throw new Error(`Download ${response.status}: ${document.url}`);
  const type = response.headers.get('content-type') || '';
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length < 100 ||
    bytes.length > MAX_PDF_BYTES ||
    bytes.subarray(0, 5).toString('ascii') !== '%PDF-'
  )
    throw new Error(`Arquivo não é um PDF válido de até 15 MB: ${document.url}`);
  if (type && !type.includes('pdf') && !type.includes('octet-stream'))
    throw new Error(`Tipo inesperado (${type}): ${document.url}`);
  return {
    kind: document.kind,
    fileName: new URL(response.url).pathname.split('/').at(-1) || 'documento.pdf',
    dataUrl: `data:application/pdf;base64,${bytes.toString('base64')}`,
  };
}

async function apiJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `API ${response.status}`);
  return body.data;
}

export async function executeImport({ apiUrl, items, enqueueExtraction = true }) {
  const existing = await apiJson(`${apiUrl}/api/exam-imports`);
  const existingUrls = new Set(existing.map((item) => item.sourceUrl));
  const results = [];
  for (const item of items) {
    if (existingUrls.has(item.sourceUrl)) {
      results.push({ catalogKey: item.catalogKey, status: 'duplicate' });
      continue;
    }
    try {
      const documents = [];
      for (const document of item.documents)
        documents.push(await downloadPdf(document));
      const created = await apiJson(`${apiUrl}/api/exam-imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceInstitution: item.sourceInstitution,
          sourceYear: item.sourceYear,
          examType: item.examType,
          subjectMode: item.subjectMode,
          primarySubject: item.primarySubject,
          sourceUrl: item.sourceUrl,
          rightsStatus: item.rightsStatus,
          documents,
        }),
      });
      if (enqueueExtraction)
        await apiJson(`${apiUrl}/api/exam-imports/${created.id}/extract`, {
          method: 'POST',
        });
      existingUrls.add(item.sourceUrl);
      results.push({ catalogKey: item.catalogKey, status: 'queued', id: created.id });
    } catch (error) {
      results.push({ catalogKey: item.catalogKey, status: 'failed', error: error.message });
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const noExtraction = args.includes('--no-extraction');
  const limitArgument = args.find((item) => item.startsWith('--limit='));
  const limit = limitArgument ? Number(limitArgument.split('=')[1]) : null;
  const positional = args.filter((item) => !item.startsWith('--'));
  const path = positional[0];
  if (!path)
    throw new Error('Informe o caminho da planilha. Use --execute para importar.');
  const catalogItems = await readItaCatalog(path, positional[1] || DEFAULT_SHEET);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1))
    throw new Error('--limit deve ser um número inteiro positivo.');
  const items = limit === null ? catalogItems : catalogItems.slice(0, limit);
  if (!execute) {
    console.log(JSON.stringify({ mode: 'dry-run', imports: items.length, items }, null, 2));
    return;
  }
  const apiUrl = process.env.API_URL || 'http://localhost:8788';
  const results = await executeImport({
    apiUrl,
    items,
    enqueueExtraction: !noExtraction,
  });
  console.log(JSON.stringify({ mode: 'execute', results }, null, 2));
  if (results.some((item) => item.status === 'failed')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
