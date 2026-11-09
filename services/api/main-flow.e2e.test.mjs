import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fluxo principal de ponta a ponta pela API HTTP real, num esquema isolado:
// professor cria questão, avaliação, turma e aluno → aplica a prova → envia o
// cartão → confere a leitura → autoriza a nota → o aluno entra com o código e
// vê o resultado. A leitura óptica (OMR) e o PDF (ConTeXt) rodam em workers à
// parte; aqui o cartão vai para revisão, como quando o QR não é lido.
const databaseUrl = process.env.MAIN_FLOW_TEST_DATABASE_URL;
const apiDir = path.dirname(fileURLToPath(import.meta.url));
const origin = 'http://localhost:3000';

async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  return port;
}

function randomCpf() {
  const digits = Array.from({ length: 9 }, () =>
    Math.floor(Math.random() * 10),
  );
  for (const length of [9, 10]) {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    digits.push(((sum * 10) % 11) % 10);
  }
  return digits.join('');
}

const run = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: apiDir, env });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) =>
      code === 0 ? resolve(output) : reject(new Error(output)),
    );
  });

test(
  'prova → cartão → nota → aluno pela API',
  { skip: !databaseUrl, timeout: 180_000 },
  async () => {
    const { default: pg } = await import('pg');
    const schema = 'main_flow_' + randomUUID().replaceAll('-', '');
    const control = new pg.Pool({ connectionString: databaseUrl });
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    const port = await freePort();
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      DATABASE_URL: url.href,
      PORT: String(port),
      CPF_HASH_SECRET: 'main-flow-test-secret-0123456789abcdef',
      CORS_ORIGIN: origin,
      AUTH_FRONTEND_URL: origin,
      AUTH_DEV_RESET_TOKENS: 'true',
      DEV_AUTH_BYPASS: 'false',
    };
    let server;
    const db = new pg.Pool({ connectionString: url.href });
    try {
      await run(['migrate.mjs'], env);
      server = spawn(process.execPath, ['server.mjs'], { cwd: apiDir, env });
      let serverLog = '';
      server.stdout.on('data', (chunk) => (serverLog += chunk));
      server.stderr.on('data', (chunk) => (serverLog += chunk));
      const base = `http://127.0.0.1:${port}`;
      for (let attempt = 0; ; attempt += 1) {
        const ready = await fetch(`${base}/health`).catch(() => null);
        if (ready?.ok) break;
        if (attempt > 100) throw new Error(`API não subiu:\n${serverLog}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const api = async (
        method,
        route,
        body,
        token,
        expected = [200, 201, 202],
      ) => {
        const init = {
          method,
          headers: {
            origin,
            'x-client': 'mobile',
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        };
        if (body) init.body = JSON.stringify(body);
        const response = await fetch(`${base}${route}`, init);
        const payload = await response.json().catch(() => ({}));
        assert.ok(
          expected.includes(response.status),
          `${method} ${route}: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`,
        );
        return payload.data;
      };

      // 1. Professor: cadastro, e-mail confirmado, escola em "Minhas escolas", login.
      const teacher = {
        email: `prof-${schema}@test.local`,
        password: 'SenhaForte#2026',
      };
      const registration = await api('POST', '/api/auth/register', {
        cpf: randomCpf(),
        institutionName: 'Escola do Fluxo',
        displayName: 'Prof Fluxo',
        ...teacher,
      });
      await api('POST', '/api/auth/verify-email', {
        token: registration.developmentToken,
      });
      // O banco de questões é mantido e aprovado pela administração do portal
      // (mesma conta dos testes de tela, services/api/e2e-seed.mjs).
      await db.query('UPDATE users SET portal_admin=true WHERE email=$1', [
        teacher.email,
      ]);
      await db.query(
        `INSERT INTO educator_profiles(user_id,professional_role)
         SELECT id,'teacher' FROM users WHERE email=$1`,
        [teacher.email],
      );
      const school = (
        await db.query(
          `INSERT INTO educator_schools(user_id,name,school_type,city,state)
           SELECT id,'Escola Estadual do Fluxo','estadual','Campo Grande','MS' FROM users WHERE email=$1
           RETURNING id`,
          [teacher.email],
        )
      ).rows[0];
      const { token } = await api('POST', '/api/auth/login', teacher);
      const me = await api('GET', '/api/auth/me', null, token);
      assert.equal(me.role, 'admin');

      // 2. Questão com gabarito e avaliação com uma versão.
      const question = await api(
        'POST',
        '/api/questions',
        {
          type: 'single_choice',
          statement: 'Qual é o símbolo químico do sódio?',
          subject: 'Química',
          grade: '1º ano EM',
          sourceInstitution: 'Escola do Fluxo',
          sourceYear: 2026,
          difficulty: 'Fácil',
          alternatives: ['S', 'Na', 'So', 'N', 'Sd'].map((content, index) => ({
            stableKey: `alt-${'abcde'[index]}`,
            content,
            isCorrect: index === 1,
            position: index + 1,
          })),
        },
        token,
      );
      // Rascunho → revisão → aprovada, como no portal.
      const selection = {
        questions: [
          {
            id: question.id,
            revision: question.revision ?? question.currentRevision ?? 1,
          },
        ],
      };
      await api('POST', '/api/questions/status/bulk-review', selection, token);
      const approval = await api(
        'POST',
        '/api/questions/status/bulk-approve',
        selection,
        token,
      );
      assert.equal(approval.approved, 1, JSON.stringify(approval));
      const assessment = await api(
        'POST',
        '/api/assessments',
        {
          title: 'Avaliação do fluxo principal',
          grade: '1º ano EM',
          sections: [{ subject: 'Química', questionIds: [question.id] }],
          versionCount: 1,
        },
        token,
      );

      // 3. Turma, aluno e matrícula.
      const klass = await api(
        'POST',
        '/api/classes',
        {
          name: '1º A',
          grade: '1º ano EM',
          schoolYear: 2026,
          schoolId: school.id,
        },
        token,
      );
      const student = await api(
        'POST',
        '/api/students',
        { registration: 'FLUXO-001', name: 'Bianca Souza' },
        token,
      );
      await api(
        'POST',
        `/api/classes/${klass.id}/enrollments`,
        { studentId: student.id, number: 1 },
        token,
      );

      // 4. Aplicação da prova para a turma.
      const application = await api(
        'POST',
        '/api/assessment-applications',
        { assessmentId: assessment.id, classId: klass.id },
        token,
      );
      assert.equal(application.assignments.length, 1);
      const assignment = application.assignments[0];

      // 5. Cartão enviado; sem worker OMR, ele fica como "QR não localizado".
      const png = Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        Buffer.alloc(64),
      ]);
      const scan = await api(
        'POST',
        '/api/card-scans',
        {
          expectedApplicationId: application.id,
          imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
        },
        token,
      );
      await db.query(
        "UPDATE card_scans SET status='review',error_message='QR Code não localizado.' WHERE id=$1",
        [scan.id],
      );

      // 6. Professor confere a leitura: aluno e a alternativa correta, que a
      // versão embaralhada pode ter posto em qualquer letra.
      const { snapshot } = (
        await db.query(
          'SELECT av.snapshot FROM application_students aps JOIN assessment_versions av ON av.id=aps.assessment_version_id WHERE aps.id=$1',
          [assignment.id],
        )
      ).rows[0];
      const findQuestion = (node) => {
        if (!node || typeof node !== 'object') return null;
        if (node.number === 1 && Array.isArray(node.alternatives)) return node;
        for (const value of Object.values(node)) {
          const found = findQuestion(value);
          if (found) return found;
        }
        return null;
      };
      const printed = findQuestion(snapshot);
      const correctIndex = printed.alternatives.findIndex(
        (alternative) => alternative.stableKey === 'alt-b',
      );
      assert.ok(correctIndex >= 0, JSON.stringify(printed).slice(0, 400));
      const correctLabel =
        printed.alternatives[correctIndex].label ?? 'ABCDE'[correctIndex];
      await api(
        'POST',
        `/api/card-scans/${scan.id}/confirm`,
        {
          applicationStudentId: assignment.id,
          responses: [{ questionNumber: 1, selectedLabels: [correctLabel] }],
        },
        token,
      );
      const results = await api(
        'GET',
        `/api/assessment-applications/${application.id}/results`,
        null,
        token,
      );
      const result = results.students.find(
        (row) => row.applicationStudentId === assignment.id,
      );
      assert.ok(result?.resultId, JSON.stringify(results).slice(0, 500));
      assert.equal(result.score, result.maxScore);
      assert.ok(result.maxScore > 0);

      // 7. Nota autorizada e publicada para o aluno.
      await api(
        'POST',
        '/api/assessment-results/authorize',
        {
          applicationId: application.id,
          items: [
            { resultId: result.resultId, versionId: result.currentVersionId },
          ],
        },
        token,
      );

      // 8. Aluno: primeiro acesso com o código individual e consulta do resultado.
      const { access_code: code } = (
        await db.query('SELECT access_code FROM students WHERE id=$1', [
          student.id,
        ])
      ).rows[0];
      const firstAccess = await api('POST', '/api/auth/student/first-access', {
        code,
        password: 'SenhaAluno#2026',
      });
      const studentToken =
        firstAccess.token ??
        (
          await api('POST', '/api/auth/student/code-login', {
            code,
            password: 'SenhaAluno#2026',
          })
        ).token;
      const activities = await api(
        'GET',
        '/api/student/activities',
        null,
        studentToken,
      );
      const detail = await api(
        'GET',
        `/api/student/results/${result.resultId}`,
        null,
        studentToken,
      );
      assert.ok(
        JSON.stringify(activities).includes('Avaliação do fluxo principal'),
      );
      assert.equal(detail.resultStatus, 'published');
      assert.deepEqual(
        [detail.percent, detail.correctCount, detail.releasePolicy],
        [100, 1, 'summary'],
      );
      // O aluno não acessa a área do professor.
      await api('GET', '/api/classes', null, studentToken, [403]);
    } finally {
      server?.kill();
      await db.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
