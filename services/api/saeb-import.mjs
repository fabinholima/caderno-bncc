import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';

const execFileAsync = promisify(execFile);
const serviceDir = fileURLToPath(new URL('.', import.meta.url));
const projectDir = resolve(serviceDir, '../..');

export const OFFICIAL_SAEB_SOURCES = [
  {
    key: 'saeb-lp-ef',
    subject: 'Língua Portuguesa',
    file: resolve(projectDir, 'work/saeb/lingua-portuguesa.pdf'),
    url: 'https://download.inep.gov.br/educacao_basica/prova_brasil_saeb/menu_do_professor/o_que_cai_nas_provas/Matriz_de_Referencia_de_Lingua_Portuguesa.pdf',
  },
  {
    key: 'saeb-mat-ef',
    subject: 'Matemática',
    file: resolve(projectDir, 'work/saeb/matematica.pdf'),
    url: 'https://download.inep.gov.br/educacao_basica/prova_brasil_saeb/menu_do_professor/o_que_cai_nas_provas/Matriz_de_Referencia_de_Matematica.pdf',
  },
];

function clean(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function parseSaebReference(text, source) {
  const lines = text.replace(/\f/g, '\n').split(/\r?\n/).map(clean);
  const matrices = [];
  let matrix = null;
  let topic = null;
  let descriptor = null;

  const flushDescriptor = () => {
    if (!descriptor || !matrix || !topic) return;
    descriptor.description = clean(descriptor.description);
    if (descriptor.description)
      matrix.descriptors.push({ ...descriptor, topicCode: topic.code });
    descriptor = null;
  };
  const flushMatrix = () => {
    flushDescriptor();
    if (matrix?.descriptors.length) matrices.push(matrix);
    matrix = null;
    topic = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (/3ª\s*S[eé]rie do Ensino M[eé]dio/i.test(line)) {
      flushMatrix();
      break;
    }
    const grade = line.match(/^(5º|9º)\s*(?:ANO|ano) do Ensino Fundamental$/i);
    if (grade) {
      flushMatrix();
      matrix = {
        sourceKey: `${source.key}-${grade[1].replace('º', '')}`,
        name: `Matriz de Referência de ${source.subject} do Saeb`,
        subject: source.subject,
        gradeRange: `${grade[1]} ano`,
        topics: [],
        descriptors: [],
      };
      continue;
    }
    if (!matrix) continue;
    const topicMatch = line.match(/^([IVX]+)\.\s+(.+)$/);
    if (topicMatch) {
      flushDescriptor();
      topic = {
        code: topicMatch[1],
        name: topicMatch[2],
        position: matrix.topics.length + 1,
      };
      matrix.topics.push(topic);
      continue;
    }
    const descriptorMatch = line.match(/^(D\d+)\s*[–—-]\s*(.*)$/);
    if (descriptorMatch) {
      flushDescriptor();
      descriptor = {
        code: descriptorMatch[1],
        description: descriptorMatch[2],
        position: matrix.descriptors.length + 1,
      };
      continue;
    }
    if (
      descriptor &&
      !/^(Sistema de Avalia[cç][aã]o|Educa[cç][aã]o B[aá]sica|Matriz de Refer[eê]ncia|do Saeb:|Quadro \d|T[ÓO]PICOS|DESCRITORES)/i.test(
        line,
      )
    )
      descriptor.description += ` ${line}`;
  }
  flushMatrix();
  return matrices;
}

export async function importSaebSources(sources = OFFICIAL_SAEB_SOURCES) {
  const temporary = await mkdtemp(join(tmpdir(), 'caderno-saeb-'));
  const parsed = [];
  try {
    for (const source of sources) {
      const textPath = join(temporary, `${source.key}.txt`);
      await execFileAsync('pdftotext', ['-layout', source.file, textPath]);
      parsed.push(
        ...parseSaebReference(await readFile(textPath, 'utf8'), source).map(
          (matrix) => ({ ...matrix, source }),
        ),
      );
    }
    await transaction(async (client) => {
      for (const matrix of parsed) {
        const matrixResult = await client.query(
          `INSERT INTO saeb_matrices
             (source_key, name, stage, subject, grade_range, version, source_url, source_metadata)
           VALUES ($1, $2, 'Ensino Fundamental', $3, $4, 'SAEB-2001-2023', $5, $6)
           ON CONFLICT (source_key) DO UPDATE SET
             name = EXCLUDED.name, subject = EXCLUDED.subject,
             grade_range = EXCLUDED.grade_range, version = EXCLUDED.version,
             source_url = EXCLUDED.source_url, source_metadata = EXCLUDED.source_metadata
           RETURNING id`,
          [
            matrix.sourceKey,
            matrix.name,
            matrix.subject,
            matrix.gradeRange,
            matrix.source.url,
            { authority: 'INEP', importedFrom: matrix.source.file },
          ],
        );
        const matrixId = matrixResult.rows[0].id;
        await client.query('DELETE FROM saeb_topics WHERE matrix_id = $1', [
          matrixId,
        ]);
        const topicIds = new Map();
        for (const item of matrix.topics) {
          const result = await client.query(
            `INSERT INTO saeb_topics (matrix_id, code, name, position)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [matrixId, item.code, item.name, item.position],
          );
          topicIds.set(item.code, result.rows[0].id);
        }
        for (const item of matrix.descriptors) {
          await client.query(
            `INSERT INTO saeb_descriptors
               (matrix_id, topic_id, code, description, position, source_metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              matrixId,
              topicIds.get(item.topicCode),
              item.code,
              item.description,
              item.position,
              { authority: 'INEP' },
            ],
          );
        }
      }
    });
    return parsed.map((item) => ({
      sourceKey: item.sourceKey,
      topics: item.topics.length,
      descriptors: item.descriptors.length,
    }));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await importSaebSources(), null, 2));
  } finally {
    await pool.end();
  }
}
