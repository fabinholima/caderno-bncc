import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const databaseUrl = process.env.ADAPTED_EXAM_TEST_DATABASE_URL;

// O módulo db.mjs guarda um único pool: um schema por arquivo, limpo a cada teste.
let banco = null;
const TABELAS =
  'assessments, classes, assessment_versions, students, class_enrollments, assessment_applications, application_students, render_jobs';
async function preparar() {
  if (!banco) banco = await isolarSchema();
  await banco.pool.query(`TRUNCATE ${TABELAS}`);
  return banco;
}
after(async () => {
  if (banco) await banco.fim();
});

// Schema isolado por teste, no mesmo padrão dos demais testes de integração.
async function isolarSchema() {
  const { default: pg } = await import('pg');
  const control = new pg.Pool({ connectionString: databaseUrl });
  const schema = `adapted_exam_${randomUUID().replaceAll('-', '')}`;
  await control.query(`CREATE SCHEMA ${schema}`);
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = isolatedUrl.href;
  process.env.NODE_ENV = 'test';
  const { pool } = await import('./db.mjs');
  await pool.query(`
    CREATE TABLE assessments(id uuid PRIMARY KEY,institution_id uuid,title text,subject text);
    CREATE TABLE classes(id uuid PRIMARY KEY,institution_id uuid,name text,grade text,school_year integer,created_by uuid);
    CREATE TABLE class_subjects(class_id uuid,teacher_id uuid);
    CREATE TABLE assessment_versions(
      id uuid PRIMARY KEY,assessment_id uuid,code text,seed integer,
      snapshot jsonb NOT NULL,answer_key jsonb NOT NULL DEFAULT '[]',
      UNIQUE(assessment_id,code)
    );
    CREATE TABLE students(id uuid PRIMARY KEY,institution_id uuid,name text,registration text,active boolean DEFAULT true,status text DEFAULT 'ativo',adapted_exam boolean NOT NULL DEFAULT false);
    CREATE TABLE class_enrollments(class_id uuid,student_id uuid,number integer,PRIMARY KEY(class_id,student_id));
    CREATE TABLE assessment_applications(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,assessment_id uuid,class_id uuid,
      scheduled_at timestamptz,status text DEFAULT 'scheduled',created_by uuid,created_at timestamptz DEFAULT now(),
      UNIQUE(assessment_id,class_id)
    );
    CREATE TABLE application_students(id uuid PRIMARY KEY,application_id uuid,student_id uuid,assessment_version_id uuid,qr_payload text);
    CREATE TABLE card_scans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_student_id uuid,submission_id uuid,status text DEFAULT 'queued');
    CREATE TABLE render_jobs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assessment_version_id uuid,template_version text,
      application_student_id uuid,status text DEFAULT 'queued',error_message text,completed_at timestamptz,
      output_manifest jsonb,created_at timestamptz DEFAULT now(),
      renderer text NOT NULL DEFAULT 'context-lmtx',attempts integer NOT NULL DEFAULT 0,started_at timestamptz
    );
  `);
  return {
    pool,
    async fim() {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    },
  };
}

const alternativas = (texto) =>
  ['alt-a', 'alt-b', 'alt-c', 'alt-d', 'alt-e'].map((stableKey, i) => ({
    stableKey,
    label: 'ABCDE'[i],
    content: [{ type: 'paragraph', text: `${texto} ${i + 1}` }],
  }));

function snapshotBase(assessmentId, seed) {
  return {
    schemaVersion: '1.0',
    assessment: {
      id: assessmentId,
      title: 'Prova bimestral',
      subject: 'Matemática',
      grade: '7º ano',
      instructions: ['Leia com atenção.'],
    },
    institution: { id: 'i1', name: 'Escola Teste' },
    version: {
      id: 'base',
      code: 'A',
      seed,
      generatedAt: '2026-01-01T00:00:00Z',
    },
    candidateFields: ['name'],
    questions: [
      {
        id: 'q1',
        number: 1,
        type: 'single_choice',
        difficulty: 'easy',
        source: { institution: 'ENEM', year: 2023 },
        statement: [{ type: 'paragraph', text: 'Quanto é 2 + 2?' }],
        alternatives: alternativas('Opção'),
        answer: { correctStableKeys: ['alt-c'] },
        points: 1,
        skills: [],
      },
    ],
    totals: { points: 1, questions: 1 },
    render: {
      locale: 'pt-BR',
      paper: 'A4',
      mode: 'student',
      template: 'basicexam-v1',
      font: 'plex',
      fontSize: 11,
    },
  };
}

async function esperarJob(pool, jobId, { ate = 5000 } = {}) {
  const inicio = Date.now();
  for (;;) {
    const { rows } = await pool.query(
      'SELECT status,error_message,output_manifest FROM render_jobs WHERE id=$1',
      [jobId],
    );
    if (rows[0].status !== 'queued' && rows[0].status !== 'running')
      return rows[0];
    if (Date.now() - inicio > ate)
      throw new Error('O job não terminou a tempo.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test(
  'criação da aplicação deixa o aluno com laudo fora e enfileira a versão adaptada',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    const anterior = process.env.ADAPTED_EXAM_PROVIDER;
    // Sem IA, a geração em segundo plano falha de forma controlada: o teste confere isso também.
    process.env.ADAPTED_EXAM_PROVIDER = 'desativado';
    try {
      const { createApplication } = await import('./academic.mjs');
      const institutionId = randomUUID();
      const assessmentId = randomUUID();
      const classId = randomUUID();
      const versaoA = randomUUID();
      const regular = randomUUID();
      const laudo = randomUUID();
      await pool.query(
        'INSERT INTO assessments(id,institution_id,title,subject) VALUES($1,$2,$3,$4)',
        [assessmentId, institutionId, 'Prova bimestral', 'Matemática'],
      );
      await pool.query(
        'INSERT INTO classes(id,institution_id,name,grade,school_year) VALUES($1,$2,$3,$4,$5)',
        [classId, institutionId, '7º A', '7º ano', 2026],
      );
      await pool.query(
        'INSERT INTO assessment_versions(id,assessment_id,code,seed,snapshot) VALUES($1,$2,$3,$4,$5)',
        [versaoA, assessmentId, 'A', 7, snapshotBase(assessmentId, 7)],
      );
      await pool.query(
        "INSERT INTO render_jobs(assessment_version_id,template_version,status) VALUES($1,'basicexam-v1','completed')",
        [versaoA],
      );
      await pool.query(
        'INSERT INTO students(id,institution_id,name,registration,adapted_exam) VALUES($1,$2,$3,$4,false),($5,$2,$6,$7,true)',
        [regular, institutionId, 'Ana', '001', laudo, 'Bruno', '002'],
      );
      await pool.query(
        'INSERT INTO class_enrollments(class_id,student_id,number) VALUES($1,$2,1),($1,$3,2)',
        [classId, regular, laudo],
      );

      const resultado = await createApplication({
        institutionId,
        userId: randomUUID(),
        input: {
          assessmentId,
          classId,
          scheduledAt: '2026-10-28T16:00:00.000Z',
        },
      });

      assert.equal(
        resultado.assignments.length,
        1,
        'só o aluno sem laudo entra na aplicação',
      );
      assert.equal(resultado.assignments[0].studentName, 'Ana');
      assert.equal(
        resultado.assignments[0].versionCode,
        'A',
        'a versão ADAPTADA não entra no sorteio',
      );
      assert.equal(resultado.adaptedExam.excludedStudents, 1);
      assert.equal(resultado.adaptedExam.status, 'queued');

      const job = await pool.query(
        'SELECT renderer,application_student_id,template_version FROM render_jobs WHERE id=$1',
        [resultado.adaptedExam.renderJobId],
      );
      assert.equal(job.rows[0].renderer, 'ia-adaptada');
      assert.equal(job.rows[0].application_student_id, null);

      // O job roda em segundo plano; sem IA ele termina como failed com o motivo.
      const fim = await esperarJob(pool, resultado.adaptedExam.renderJobId);
      assert.equal(fim.status, 'failed');
      assert.match(fim.error_message, /desativada/);

      // A listagem da aplicação mostra o resumo da prova adaptada e não expõe a versão ADAPTADA como gabarito.
      const { listApplications } = await import('./academic.mjs');
      const lista = await listApplications({ institutionId, ownerId: null });
      const item = lista.find((x) => x.id === resultado.id);
      assert.equal(item.adaptedExam.students, 1);
      assert.equal(item.adaptedExam.status, 'failed');
      assert.match(item.adaptedExam.error, /desativada/);
      assert.deepEqual(
        item.versions.map((version) => version.code),
        ['A'],
      );

      await assert.rejects(
        createApplication({
          institutionId,
          userId: randomUUID(),
          input: { assessmentId, classId, studentIds: [laudo] },
        }),
        /não entram na aplicação/,
      );
    } finally {
      if (anterior === undefined) delete process.env.ADAPTED_EXAM_PROVIDER;
      else process.env.ADAPTED_EXAM_PROVIDER = anterior;
    }
  },
);

test(
  'geração com IA grava versão ADAPTADA, gabarito e os dois PDFs',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    const saida = await mkdtemp(path.join(os.tmpdir(), 'adaptada-'));
    try {
      const { ensureAdaptedExamVersion } = await import('./adapted-exam.mjs');
      const { executarProvaAdaptada } = await import('./adapted-exam-job.mjs');
      const assessmentId = randomUUID();
      const versaoA = randomUUID();
      await pool.query(
        'INSERT INTO assessments(id,institution_id) VALUES($1,$2)',
        [assessmentId, randomUUID()],
      );
      await pool.query(
        'INSERT INTO assessment_versions(id,assessment_id,code,seed,snapshot) VALUES($1,$2,$3,$4,$5)',
        [versaoA, assessmentId, 'A', 7, snapshotBase(assessmentId, 7)],
      );

      const garantida = await ensureAdaptedExamVersion(pool, assessmentId);
      assert.equal(garantida.status, 'queued');

      let chamadaIA;
      const fetchImpl = async (url, options) => {
        chamadaIA = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            id: 'resp_teste',
            model: 'gpt-5-mini',
            usage: {},
            output_text: JSON.stringify({
              questions: [
                {
                  sourceNumber: 1,
                  statement: 'Quanto é dois mais dois?',
                  alternatives: ['três', 'quatro', 'cinco'],
                  correctIndex: 1,
                },
              ],
            }),
          }),
        };
      };

      const resultado = await executarProvaAdaptada(garantida.renderJobId, {
        fetchImpl,
        env: { OPENAI_API_KEY: 'chave-de-teste' },
        outputRoot: saida,
      });
      assert.equal(resultado.status, 'completed');
      assert.equal(chamadaIA.store, false, 'a IA não guarda o conteúdo');
      assert.equal(chamadaIA.text.format.type, 'json_schema');

      const job = await esperarJob(pool, garantida.renderJobId);
      assert.equal(job.status, 'completed');
      assert.equal(job.output_manifest.ia.questoesAdaptadas, 1);
      assert.equal(job.output_manifest.ia.model, 'gpt-5-mini');

      const pdf = await readFile(
        path.join(saida, garantida.renderJobId, 'prova-adaptada.pdf'),
      );
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      const gabarito = await readFile(
        path.join(saida, garantida.renderJobId, 'gabarito-adaptado.pdf'),
      );
      assert.equal(gabarito.subarray(0, 5).toString(), '%PDF-');

      const versao = await pool.query(
        'SELECT code,snapshot,answer_key FROM assessment_versions WHERE id=$1',
        [garantida.versionId],
      );
      assert.equal(versao.rows[0].code, 'ADAPTADA');
      const questao = versao.rows[0].snapshot.questions[0];
      assert.equal(questao.statement[0].text, 'QUANTO É DOIS MAIS DOIS?');
      assert.deepEqual(
        questao.alternatives.map((alt) => alt.label),
        ['A', 'B', 'C'],
      );
      assert.deepEqual(questao.answer.correctStableKeys, ['alt-b']);
      assert.equal(versao.rows[0].answer_key[0].correctStableKeys[0], 'alt-b');

      // Reaproveitar a versão concluída não gera de novo.
      const de_novo = await ensureAdaptedExamVersion(pool, assessmentId);
      assert.equal(de_novo.status, 'completed');
    } finally {
      await rm(saida, { recursive: true, force: true });
    }
  },
);

test(
  'IA sem nenhuma questão válida falha o job e não grava nada parcial',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    const saida = await mkdtemp(path.join(os.tmpdir(), 'adaptada-'));
    try {
      const { ensureAdaptedExamVersion } = await import('./adapted-exam.mjs');
      const { executarProvaAdaptada } = await import('./adapted-exam-job.mjs');
      const assessmentId = randomUUID();
      await pool.query(
        'INSERT INTO assessments(id,institution_id) VALUES($1,$2)',
        [assessmentId, randomUUID()],
      );
      await pool.query(
        'INSERT INTO assessment_versions(id,assessment_id,code,seed,snapshot) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), assessmentId, 'A', 7, snapshotBase(assessmentId, 7)],
      );
      const garantida = await ensureAdaptedExamVersion(pool, assessmentId);
      const antes = await pool.query(
        'SELECT snapshot FROM assessment_versions WHERE id=$1',
        [garantida.versionId],
      );

      const resultado = await executarProvaAdaptada(garantida.renderJobId, {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({
            output_text: JSON.stringify({
              questions: [
                {
                  sourceNumber: 1,
                  statement: 'x',
                  alternatives: ['a', 'a', 'b'],
                  correctIndex: 0,
                },
              ],
            }),
          }),
        }),
        env: { OPENAI_API_KEY: 'chave-de-teste' },
        outputRoot: saida,
      });
      assert.equal(resultado.status, 'failed');
      const job = await esperarJob(pool, garantida.renderJobId);
      assert.equal(job.status, 'failed');
      assert.match(job.error_message, /nenhuma questão válida/);
      const depois = await pool.query(
        'SELECT snapshot FROM assessment_versions WHERE id=$1',
        [garantida.versionId],
      );
      assert.deepEqual(
        depois.rows[0].snapshot,
        antes.rows[0].snapshot,
        'o snapshot da versão não muda numa falha',
      );
    } finally {
      await rm(saida, { recursive: true, force: true });
    }
  },
);

test(
  'recuperação reenfileira job interrompido e falha quem esgotou as tentativas',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    try {
      const { recuperarProvasAdaptadasPendentes } =
        await import('./adapted-exam-job.mjs');
      const versao = randomUUID();
      const interrompido = randomUUID();
      const esgotado = randomUUID();
      const recente = randomUUID();
      await pool.query(
        `INSERT INTO render_jobs(id,assessment_version_id,template_version,renderer,status,started_at,attempts) VALUES
       ($1,$4,'ia-adaptada-v1','ia-adaptada','running',now()-interval '20 minutes',1),
       ($2,$4,'ia-adaptada-v1','ia-adaptada','running',now()-interval '20 minutes',3),
       ($3,$4,'ia-adaptada-v1','ia-adaptada','running',now()-interval '2 minutes',1)`,
        [interrompido, esgotado, recente, versao],
      );
      const agendados = [];
      const resultado = await recuperarProvasAdaptadasPendentes({
        db: pool,
        agendar: (id) => agendados.push(id),
      });
      assert.deepEqual(resultado.reenfileirados, [interrompido]);
      assert.deepEqual(resultado.falhados, [esgotado]);
      assert.deepEqual(
        agendados,
        [interrompido],
        'o job reenfileirado é agendado de novo',
      );

      const estados = await pool.query(
        'SELECT id,status FROM render_jobs ORDER BY id',
      );
      const porId = Object.fromEntries(
        estados.rows.map((row) => [row.id, row.status]),
      );
      assert.equal(porId[interrompido], 'queued');
      assert.equal(porId[esgotado], 'failed');
      assert.equal(porId[recente], 'running', 'job recente continua rodando');
    } finally {
    }
  },
);

test(
  'lotes: 12 questões viram duas chamadas, com série na entrada e descarte registrado',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    const saida = await mkdtemp(path.join(os.tmpdir(), 'adaptada-lote-'));
    try {
      const { ensureAdaptedExamVersion } = await import('./adapted-exam.mjs');
      const { executarProvaAdaptada } = await import('./adapted-exam-job.mjs');
      const assessmentId = randomUUID();
      const base = snapshotBase(assessmentId, 7);
      base.questions = Array.from({ length: 12 }, (_, i) => ({
        ...base.questions[0],
        id: `q${i + 1}`,
        number: i + 1,
        statement: [{ type: 'paragraph', text: `Pergunta ${i + 1}?` }],
      }));
      base.totals = { points: 12, questions: 12 };
      await pool.query(
        'INSERT INTO assessments(id,institution_id,title,subject) VALUES($1,$2,$3,$4)',
        [assessmentId, randomUUID(), 'Prova', 'Matemática'],
      );
      await pool.query(
        'INSERT INTO assessment_versions(id,assessment_id,code,seed,snapshot) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), assessmentId, 'A', 7, base],
      );
      const garantida = await ensureAdaptedExamVersion(pool, assessmentId);

      const entradas = [];
      const fetchImpl = async (url, options) => {
        const corpo = JSON.parse(options.body);
        const entrada = JSON.parse(corpo.input);
        entradas.push(entrada);
        const questions = entrada.questions.map((q) => ({
          sourceNumber: q.sourceNumber,
          statement: `Reescrita ${q.sourceNumber}`,
          alternatives: ['um', 'dois', 'três'],
          correctIndex: 0,
        }));
        // A última questão do segundo lote vem com alternativa repetida e é descartada.
        if (entradas.length === 2)
          questions[questions.length - 1].alternatives = ['x', 'x', 'y'];
        return {
          ok: true,
          json: async () => ({
            id: `resp_${entradas.length}`,
            model: 'gpt-5-mini',
            usage: {},
            output_text: JSON.stringify({ questions }),
          }),
        };
      };

      const resultado = await executarProvaAdaptada(garantida.renderJobId, {
        fetchImpl,
        env: { OPENAI_API_KEY: 'chave-de-teste' },
        outputRoot: saida,
      });
      assert.equal(resultado.status, 'completed');
      assert.equal(entradas.length, 2, 'doze questões em lotes de dez');
      assert.equal(entradas[0].contexto.serie, '7º ano');
      assert.equal(entradas[0].contexto.disciplina, 'Matemática');
      assert.equal(entradas[0].questions.length, 10);
      assert.equal(entradas[1].questions.length, 2);

      const job = await esperarJob(pool, garantida.renderJobId);
      assert.equal(job.status, 'completed');
      assert.equal(job.output_manifest.ia.questoesAdaptadas, 11);
      assert.equal(
        job.output_manifest.ia.descartadas.length,
        1,
        'a questão inválida fica registrada',
      );
    } finally {
      await rm(saida, { recursive: true, force: true });
    }
  },
);

test(
  'turma com um único aluno de laudo cria a aplicação só para o PDF adaptado isolado',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    const anterior = process.env.ADAPTED_EXAM_PROVIDER;
    process.env.ADAPTED_EXAM_PROVIDER = 'desativado';
    try {
      const { createApplication, listApplications } =
        await import('./academic.mjs');
      const institutionId = randomUUID();
      const assessmentId = randomUUID();
      const classId = randomUUID();
      const aluno = randomUUID();
      await pool.query(
        'INSERT INTO assessments(id,institution_id,title,subject) VALUES($1,$2,$3,$4)',
        [assessmentId, institutionId, 'Prova de frações', 'Matemática'],
      );
      await pool.query(
        'INSERT INTO classes(id,institution_id,name,grade,school_year) VALUES($1,$2,$3,$4,$5)',
        [classId, institutionId, '6º B', '6º ano', 2026],
      );
      await pool.query(
        'INSERT INTO assessment_versions(id,assessment_id,code,seed,snapshot) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), assessmentId, 'A', 7, snapshotBase(assessmentId, 7)],
      );
      await pool.query(
        'INSERT INTO students(id,institution_id,name,registration,adapted_exam) VALUES($1,$2,$3,$4,true)',
        [aluno, institutionId, 'Carla', '010'],
      );
      await pool.query(
        'INSERT INTO class_enrollments(class_id,student_id,number) VALUES($1,$2,1)',
        [classId, aluno],
      );

      const resultado = await createApplication({
        institutionId,
        userId: randomUUID(),
        input: {
          assessmentId,
          classId,
          scheduledAt: '2026-10-28T16:00:00.000Z',
        },
      });
      assert.equal(
        resultado.assignments.length,
        0,
        'nenhum cartão para o aluno de laudo',
      );
      assert.equal(resultado.adaptedExam.excludedStudents, 1);
      assert.equal(resultado.adaptedExam.status, 'queued');

      const fim = await esperarJob(pool, resultado.adaptedExam.renderJobId);
      assert.equal(
        fim.status,
        'failed',
        'sem IA o PDF não é gerado, com motivo',
      );

      const lista = await listApplications({ institutionId, ownerId: null });
      const item = lista.find((x) => x.id === resultado.id);
      assert.equal(item.students, 0);
      assert.equal(
        item.adaptedExam.students,
        1,
        'a tela mostra o aluno de laudo',
      );
    } finally {
      if (anterior === undefined) delete process.env.ADAPTED_EXAM_PROVIDER;
      else process.env.ADAPTED_EXAM_PROVIDER = anterior;
    }
  },
);

test(
  'geração inclui imagem da IA na questão e registra falhas de imagem no manifesto',
  { skip: !databaseUrl },
  async () => {
    const banco = await preparar();
    const { pool } = banco;
    const saida = await mkdtemp(path.join(os.tmpdir(), 'adaptada-img-'));
    try {
      const { ensureAdaptedExamVersion } = await import('./adapted-exam.mjs');
      const { executarProvaAdaptada } = await import('./adapted-exam-job.mjs');
      const PNG =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
      const assessmentId = randomUUID();
      const base = snapshotBase(assessmentId, 7);
      base.questions = [1, 2].map((n) => ({
        ...base.questions[0],
        id: `q${n}`,
        number: n,
        statement: [{ type: 'paragraph', text: `Pergunta ${n}?` }],
      }));
      base.totals = { points: 2, questions: 2 };
      await pool.query(
        'INSERT INTO assessments(id,institution_id,title,subject) VALUES($1,$2,$3,$4)',
        [assessmentId, randomUUID(), 'Prova', 'Ciências'],
      );
      await pool.query(
        'INSERT INTO assessment_versions(id,assessment_id,code,seed,snapshot) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(), assessmentId, 'A', 7, base],
      );
      const garantida = await ensureAdaptedExamVersion(pool, assessmentId);

      const imagensPedidas = [];
      const fetchImpl = async (url, options) => {
        if (url.includes('generateContent') && url.includes('image')) {
          imagensPedidas.push(JSON.parse(options.body));
          // A segunda imagem falha: a questão sai só com texto.
          if (imagensPedidas.length === 2)
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: 'indisponível' } }),
            };
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      { inlineData: { mimeType: 'image/png', data: PNG } },
                    ],
                  },
                },
              ],
            }),
          };
        }
        const entrada = JSON.parse(JSON.parse(options.body).input);
        return {
          ok: true,
          json: async () => ({
            id: 'resp_img',
            model: 'gpt-5-mini',
            usage: {},
            output_text: JSON.stringify({
              questions: entrada.questions.map((q) => ({
                sourceNumber: q.sourceNumber,
                statement: `Reescrita ${q.sourceNumber}`,
                alternatives: ['um', 'dois', 'três'],
                correctIndex: 0,
                imagePrompt: `uma figura para ${q.sourceNumber}`,
              })),
            }),
          }),
        };
      };

      const resultado = await executarProvaAdaptada(garantida.renderJobId, {
        fetchImpl,
        env: { OPENAI_API_KEY: 'chave', GEMINI_API_KEY: 'chave-g' },
        outputRoot: saida,
      });
      assert.equal(resultado.status, 'completed');
      assert.equal(
        imagensPedidas.length,
        2,
        'uma imagem por questão que pediu figura',
      );

      const job = await esperarJob(pool, garantida.renderJobId);
      assert.equal(job.status, 'completed');
      assert.equal(job.output_manifest.ia.imagens.geradas, 1);
      assert.equal(job.output_manifest.ia.imagens.falharam.length, 1);
      assert.equal(job.output_manifest.ia.imagens.falharam[0].sourceNumber, 2);

      const versao = await pool.query(
        'SELECT snapshot FROM assessment_versions WHERE id=$1',
        [garantida.versionId],
      );
      const [primeira, segunda] = versao.rows[0].snapshot.questions;
      assert.equal(
        primeira.statement.filter((no) => no.type === 'image').length,
        1,
        'a primeira questão recebe a figura',
      );
      assert.equal(
        segunda.statement.filter((no) => no.type === 'image').length,
        0,
        'a segunda sai só com texto',
      );
      const pdf = await readFile(
        path.join(saida, garantida.renderJobId, 'prova-adaptada.pdf'),
      );
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    } finally {
      await rm(saida, { recursive: true, force: true });
    }
  },
);
