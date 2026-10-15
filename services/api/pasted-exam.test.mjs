import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePastedExam,
  parseContextQuestion,
  PASTED_EXAM_EXAMPLE,
} from '../../lib/pasted-exam.mjs';
import { examImportSchema, candidateUpdateSchema } from './exam-imports.mjs';

test('batch preserves ConTeXt and separates alternatives answer and resolution', () => {
  const text =
    PASTED_EXAM_EXAMPLE +
    '\n\nQUESTÃO 2\nExplique o movimento observado nesta figura.\n\\startMPcode\n% QUESTÃO 99\nlabel(btex $A$ etex, origin);\n\\stopMPcode\nRESOLUÇÃO:\n\\bold{Explicação} em ConTeXt.\nFIM DA QUESTÃO';
  const result = parsePastedExam(text);
  assert.equal(result.length, 2);
  assert.equal(result[0].correctAnswers[0], 'C');
  assert.equal(result[0].alternatives.A, '3 cm²');
  assert.match(result[0].resolution, /\\startformula\nA = l\^2/);
  assert.doesNotMatch(result[0].rawText, /RESOLUÇÃO|GABARITO/);
  assert.match(result[1].statement, /label\(btex \$A\$ etex/);
  assert.equal(
    parseContextQuestion(result[0].rawText).statement,
    result[0].statement,
  );
});
test('Markdown headings and alternative formats are accepted without rewriting content', () => {
  const result = parsePastedExam(
    '## QUESTÃO 8\nEnunciado suficientemente longo para revisar.\n(a) 10% do total\nB) Outro valor\nc. Terceiro valor\n**GABARITO:** A\n**RESOLUÇÃO:**\n\\m{10/100} sem alteração.',
  );
  assert.equal(result[0].alternatives.A, '10% do total');
  assert.equal(result[0].alternatives.C, 'Terceiro valor');
  assert.equal(result[0].correctAnswers[0], 'A');
  assert.equal(result[0].resolution, '\\m{10/100} sem alteração.');
});
test('invalid boundaries, duplicates, answer labels and oversized batches fail', () => {
  assert.throws(() => parsePastedExam('sem marcador'), /Comece/);
  assert.throws(
    () => parsePastedExam(PASTED_EXAM_EXAMPLE + '\n' + PASTED_EXAM_EXAMPLE),
    /repetido/,
  );
  assert.throws(
    () =>
      parsePastedExam(
        PASTED_EXAM_EXAMPLE.replace('GABARITO: C', 'GABARITO: Z'),
      ),
    /inválido/,
  );
  assert.throws(
    () =>
      parsePastedExam(
        'QUESTÃO 1\nEnunciado suficientemente longo para revisar.\n\\startMPcode',
      ),
    /não finalizado/,
  );
  assert.throws(
    () =>
      parsePastedExam(
        'QUESTÃO 1\nEnunciado suficientemente longo para revisar.\nA) Um\nA) Dois',
      ),
    /repetida/,
  );
  assert.throws(
    () =>
      parsePastedExam(
        'QUESTÃO 1\nEnunciado suficientemente longo para revisar.\nA) Um\nGABARITO: E',
      ),
    /ausente/,
  );
  assert.throws(
    () =>
      parsePastedExam(
        Array.from(
          { length: 101 },
          (_, i) =>
            `QUESTÃO ${i + 1}\nEnunciado suficientemente longo para revisar.`,
        ).join('\n'),
      ),
    /100/,
  );
});
test('source schema accepts text exclusively and resolution updates are limited', () => {
  const base = {
    sourceInstitution: 'UFG',
    sourceYear: 2025,
    examType: 'vestibular',
    subjectMode: 'single',
    primarySubject: 'Física',
    pastedText: PASTED_EXAM_EXAMPLE,
  };
  assert.equal(examImportSchema.safeParse(base).success, true);
  assert.equal(
    examImportSchema.safeParse({
      ...base,
      examPdfUrl: 'https://example.com/prova.pdf',
    }).success,
    false,
  );
  assert.equal(
    examImportSchema.safeParse({ ...base, pastedText: '' }).success,
    false,
  );
  assert.equal(
    candidateUpdateSchema.safeParse({ resolution: '\\m{x^2}' }).success,
    true,
  );
  assert.equal(
    candidateUpdateSchema.safeParse({ resolution: 'a'.repeat(20001) }).success,
    false,
  );
});

test('text batch is persisted atomically for review with no extraction or AI jobs', async () => {
  const { pool } = await import('./db.mjs');
  const { createExamImport } = await import('./exam-imports.mjs');
  const original = pool.connect,
    queries = [];
  pool.connect = async () => ({
    release() {},
    async query(sql, args) {
      queries.push({ sql, args });
      return {
        rowCount: 1,
        rows: sql.includes('INSERT INTO exam_imports')
          ? [{ id: 'import', status: 'uploaded', created_at: 'today' }]
          : [],
      };
    },
  });
  try {
    await createExamImport({
      institutionId: 'school',
      userId: 'teacher',
      role: 'teacher',
      input: {
        sourceInstitution: 'UFG',
        sourceYear: 2025,
        examType: 'vestibular',
        subjectMode: 'single',
        primarySubject: 'Física',
        pastedText: PASTED_EXAM_EXAMPLE,
      },
    });
    const persisted = queries.find((q) =>
      q.sql.includes('extracted_candidates'),
    );
    const [candidate] = JSON.parse(persisted.args[2]);
    assert.equal(candidate.answerStatus, 'suggested');
    assert.equal(candidate.status, 'review');
    assert.match(candidate.resolution, /\\startformula/);
    assert.equal(queries.at(-1).sql, 'COMMIT');
    assert(
      !queries.some((q) =>
        /INSERT INTO (questions|exam_import_jobs|exam_import_documents)/.test(
          q.sql,
        ),
      ),
    );
    await assert.rejects(
      createExamImport({
        institutionId: 'school',
        userId: 'teacher',
        role: 'teacher',
        input: {
          sourceInstitution: 'UFG',
          sourceYear: 2025,
          examType: 'vestibular',
          subjectMode: 'single',
          primarySubject: 'Física',
          rightsStatus: 'authorized',
          pastedText: PASTED_EXAM_EXAMPLE,
        },
      }),
      (e) => e.statusCode === 403,
    );
  } finally {
    pool.connect = original;
  }
});

test('imports HABILIDADE as metadata and keeps it out of alternatives and resolution', () => {
  const text = PASTED_EXAM_EXAMPLE.replace(
    'HABILIDADE:',
    '**HABILIDADE BNCC:** em13mat307',
  );
  const [q] = parsePastedExam(text);
  assert.equal(q.skill, 'EM13MAT307');
  assert.doesNotMatch(q.rawText, /HABILIDADE|EM13MAT307/);
  assert.doesNotMatch(q.resolution, /HABILIDADE/);
  assert.throws(
    () => parsePastedExam(text.replace('em13mat307', 'errado')),
    /inválido/,
  );
  assert.throws(
    () =>
      parsePastedExam(
        text.replace('RESOLUÇÃO:', 'HABILIDADE: EM13MAT307\nRESOLUÇÃO:'),
      ),
    /repetido/,
  );
});

test('server validates skill in the institution discipline catalog and rolls back unknown codes', async () => {
  const { pool } = await import('./db.mjs');
  const { createExamImport } = await import('./exam-imports.mjs');
  const original = pool.connect,
    queries = [];
  let codes = ['EM13MAT307'];
  pool.connect = async () => ({
    release() {},
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql.includes('SELECT DISTINCT skill.code'))
        return { rows: codes.map((code) => ({ code })) };
      return {
        rowCount: 1,
        rows: sql.includes('INSERT INTO exam_imports')
          ? [{ id: 'batch', status: 'uploaded', created_at: 'today' }]
          : [],
      };
    },
  });
  const input = {
    sourceInstitution: 'UFG',
    sourceYear: 2025,
    examType: 'vestibular',
    subjectMode: 'single',
    primarySubject: 'Matemática',
    pastedText: PASTED_EXAM_EXAMPLE.replace(
      'HABILIDADE:',
      'HABILIDADE: EM13MAT307',
    ),
  };
  try {
    await createExamImport({
      institutionId: 'school',
      userId: 'user',
      role: 'teacher',
      input,
    });
    const catalog = queries.find((q) =>
      q.sql.includes('SELECT DISTINCT skill.code'),
    );
    assert.deepEqual(catalog.args, ['school', ['EM13MAT307'], 'Matemática']);
    const write = queries.find((q) => q.sql.includes('extracted_candidates'));
    assert.equal(JSON.parse(write.args[2])[0].skill, 'EM13MAT307');
    codes = [];
    queries.length = 0;
    await assert.rejects(
      createExamImport({
        institutionId: 'school',
        userId: 'user',
        role: 'teacher',
        input,
      }),
      (e) => e.statusCode === 422 && /Questão 1/.test(e.message),
    );
    assert.equal(queries.at(-1).sql, 'ROLLBACK');
    assert(!queries.some((q) => q.sql.includes('INSERT INTO exam_imports')));
  } finally {
    pool.connect = original;
  }
});
