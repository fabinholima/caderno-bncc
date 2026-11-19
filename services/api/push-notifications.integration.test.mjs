import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Aviso de nota nova: só o aluno dono do resultado recebe, uma vez por
// publicação, e tokens recusados pelo Expo saem da lista.
const databaseUrl = process.env.PUSH_TEST_DATABASE_URL;
const databaseDir = path.resolve(
  new URL('../../database', import.meta.url).pathname,
);

test(
  'publishing a result notifies only the linked student, once',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const schema = 'push_' + randomUUID().replaceAll('-', '');
    const control = new pg.Pool({ connectionString: databaseUrl });
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.href;
    const { pool, transaction } = await import('./db.mjs');
    try {
      await transaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('ufaprova:schema-migrations',0))",
        );
        for (const file of (await readdir(databaseDir))
          .filter((name) => /^\d{3}_.*\.sql$/.test(name))
          .sort())
          await client.query(
            await readFile(path.join(databaseDir, file), 'utf8'),
          );
      });
      const publication = await import('./result-publication.mjs');
      const { recordResultVersion } = await import('./result-versions.mjs');
      const push = await import('./push-notifications.mjs');
      const one = async (sql, values) =>
        (await pool.query(sql, values)).rows[0];

      const institution = await one(
        `INSERT INTO institutions(name,slug) VALUES('Escola A',$1) RETURNING id`,
        ['a' + schema],
      );
      const teacher = await one(
        `INSERT INTO users(email,display_name) VALUES($1,'Profa. Ana') RETURNING id`,
        [`t-${schema}@test.local`],
      );
      const assessment = await one(
        `INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Prova 1','Química','1º ano',$2) RETURNING id`,
        [institution.id, teacher.id],
      );
      const question = (number, correct) => ({
        number,
        type: 'single_choice',
        points: 1,
        alternatives: ['A', 'B'].map((label) => ({
          label,
          stableKey: `${number}${label}`,
        })),
        answer: { correctStableKeys: [`${number}${correct}`] },
      });
      const version = await one(
        `INSERT INTO assessment_versions(assessment_id,code,seed,snapshot,answer_key) VALUES($1,'A',1,$2::jsonb,'{}') RETURNING id`,
        [
          assessment.id,
          JSON.stringify({ questions: [question(1, 'A'), question(2, 'B')] }),
        ],
      );
      const klass = await one(
        `INSERT INTO classes(institution_id,name,grade,school_year) VALUES($1,'1A','1º ano',2026) RETURNING id`,
        [institution.id],
      );
      const application = await one(
        `INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
        [institution.id, assessment.id, klass.id, teacher.id],
      );
      const enroll = async (name) => {
        const student = await one(
          `INSERT INTO students(institution_id,name,registration) VALUES($1,$2,$3) RETURNING id`,
          [institution.id, name, randomUUID()],
        );
        await pool.query(
          'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
          [klass.id, student.id],
        );
        const assignment = await one(
          `INSERT INTO application_students(application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4) RETURNING id`,
          [application.id, student.id, version.id, randomUUID()],
        );
        return { studentId: student.id, assignmentId: assignment.id };
      };
      const ana = await enroll('Ana'),
        bia = await enroll('Bia');
      const account = async (enrolled, email) => {
        const user = await one(
          `INSERT INTO users(email,display_name,account_type) VALUES($1,$1,'student') RETURNING id`,
          [email],
        );
        await pool.query(
          'INSERT INTO student_account_links(institution_id,user_id,student_id,linked_by) VALUES($1,$2,$3,$2)',
          [institution.id, user.id, enrolled.studentId],
        );
        await pool.query(
          `INSERT INTO class_join_requests(class_id,institution_id,user_id,student_id,status,source) VALUES($1,$2,$3,$4,'approved','access_code')`,
          [klass.id, institution.id, user.id, enrolled.studentId],
        );
        return { userId: user.id, role: 'student' };
      };
      const anaAccount = await account(ana, `ana-${schema}@test.local`);
      const biaAccount = await account(bia, `bia-${schema}@test.local`);

      // Só aluno registra; token precisa ser do Expo.
      await assert.rejects(
        push.registerPushDevice(
          { userId: teacher.id, role: 'teacher' },
          { token: 'ExponentPushToken[t]', platform: 'android' },
        ),
        (e) => e.statusCode === 403,
      );
      await assert.rejects(
        push.registerPushDevice(anaAccount, {
          token: 'qualquer',
          platform: 'android',
        }),
      );
      await push.registerPushDevice(anaAccount, {
        token: 'ExponentPushToken[ana]',
        platform: 'android',
      });
      await push.registerPushDevice(anaAccount, {
        token: 'ExponentPushToken[ana-old]',
        platform: 'ios',
      });
      await push.registerPushDevice(biaAccount, {
        token: 'ExponentPushToken[bia]',
        platform: 'android',
      });

      const answers = [
        { questionNumber: 1, selectedLabels: ['A'], status: 'recognized' },
        { questionNumber: 2, selectedLabels: ['A'], status: 'recognized' },
      ];
      const anaV1 = await transaction((client) =>
        recordResultVersion(client, {
          applicationStudentId: ana.assignmentId,
          source: 'omr',
          answers,
        }),
      );
      const input = {
        clientMutationId: randomUUID(),
        applicationId: application.id,
        items: [{ resultId: anaV1.resultId, versionId: anaV1.versionId }],
      };
      const authorized = await publication.authorizeResults({
        institutionId: institution.id,
        userId: teacher.id,
        input,
      });
      assert.equal(authorized.items[0].outcome, 'published');

      const sent = [];
      const send = async (messages) => {
        sent.push(...messages);
        return { invalid: ['ExponentPushToken[ana-old]'] };
      };
      assert.deepEqual(
        await push.notifyPublishedResults([anaV1.resultId], { send }),
        { sent: 2, removed: 1 },
      );
      assert.deepEqual(
        sent.map((m) => m.to).sort((a, b) => a.localeCompare(b)),
        ['ExponentPushToken[ana-old]', 'ExponentPushToken[ana]'],
      );
      assert.deepEqual(sent[0].data, {
        type: 'result',
        resultId: anaV1.resultId,
      });
      assert.equal(sent[0].body, 'Química: Prova 1');
      assert(
        !JSON.stringify(sent).includes('50'),
        'a nota não vai na mensagem',
      );
      assert.equal(
        (
          await one(
            'SELECT count(*)::int n FROM push_devices WHERE user_id=$1',
            [anaAccount.userId],
          )
        ).n,
        1,
      );

      // Reenvio da mesma autorização não avisa de novo.
      await publication.authorizeResults({
        institutionId: institution.id,
        userId: teacher.id,
        input,
      });
      assert.deepEqual(
        await push.notifyPublishedResults([anaV1.resultId], { send }),
        { sent: 0 },
      );
      assert.equal(sent.length, 2);

      // Sair de todos os aparelhos e excluir a conta apagam os tokens.
      await push.removePushDevice(biaAccount, {
        token: 'ExponentPushToken[ana]',
      });
      assert.equal(
        (await one('SELECT count(*)::int n FROM push_devices')).n,
        2,
        'só o dono remove o próprio token',
      );
      const { logoutAll } = await import('./auth.mjs');
      await logoutAll({ ...biaAccount, institutionId: null });
      assert.equal(
        (
          await one(
            'SELECT count(*)::int n FROM push_devices WHERE user_id=$1',
            [biaAccount.userId],
          )
        ).n,
        0,
      );
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);

test('Expo tickets with DeviceNotRegistered are reported for removal', async () => {
  const { sendExpoPush } = await import('./push-notifications.mjs');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
      auth: init.headers.authorization,
    });
    return new Response(
      JSON.stringify({
        data: [
          { status: 'ok', id: '1' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    );
  };
  const messages = [
    { to: 'ExponentPushToken[a]' },
    { to: 'ExponentPushToken[b]' },
  ];
  assert.deepEqual(
    await sendExpoPush(messages, { fetchImpl, accessToken: undefined }),
    { invalid: ['ExponentPushToken[b]'] },
  );
  assert.equal(calls[0].url, 'https://exp.host/--/api/v2/push/send');
  assert.equal(calls[0].auth, undefined);
  await assert.rejects(
    sendExpoPush(messages, {
      fetchImpl: async () => new Response('x', { status: 500 }),
    }),
  );
});
