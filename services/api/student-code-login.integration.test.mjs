import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
test(
  'students without e-mail sign up with the personal code, log in with code and password, and teachers renew codes',
  { skip: !process.env.CLASS_INVITES_TEST_DATABASE_URL },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({
        connectionString: process.env.CLASS_INVITES_TEST_DATABASE_URL,
      }),
      schema = 'code_login_' + randomUUID().replaceAll('-', '');
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.CLASS_INVITES_TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_BYPASS = 'false';
    process.env.CPF_HASH_SECRET = 'test-isolated-secret';
    process.env.AUTH_FRONTEND_URL = 'http://localhost:3000';
    const { pool } = await import('./db.mjs');
    const { authenticate, loginWithGoogle } = await import('./auth.mjs');
    const codes = await import('./student-access-code.mjs');
    const { listStudents } = await import('./academic.mjs');
    try {
      await pool.query(`CREATE TABLE institutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,slug text UNIQUE);
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,password_hash text,active boolean DEFAULT true,portal_admin boolean DEFAULT false,portal_editor boolean DEFAULT false);
 CREATE TABLE memberships(institution_id uuid REFERENCES institutions(id),user_id uuid REFERENCES users(id),role text CHECK(role IN('admin','coordinator','teacher')),PRIMARY KEY(institution_id,user_id));
 CREATE TABLE user_sessions(id uuid DEFAULT gen_random_uuid(),user_id uuid,token_hash text UNIQUE,expires_at timestamptz,last_seen_at timestamptz DEFAULT now(),global_bank boolean DEFAULT false,last_ip inet,user_agent text);
 CREATE TABLE audit_log(institution_id uuid,user_id uuid,action text,entity_type text,entity_id text);
 CREATE TABLE classes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,school_id uuid,created_by uuid);
 CREATE TABLE class_subjects(class_id uuid,teacher_id uuid,subject text);
 CREATE TABLE students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,registration text,active boolean DEFAULT true,teacher_id uuid,access_code text,selfie_data_url text NOT NULL DEFAULT '',status text,adapted_exam boolean NOT NULL DEFAULT false,UNIQUE(institution_id,registration));
 CREATE UNIQUE INDEX students_access_code_unique ON students(lower(access_code));
 CREATE TABLE class_enrollments(class_id uuid,student_id uuid,number integer,PRIMARY KEY(class_id,student_id));
 CREATE TABLE institution_subscriptions(institution_id uuid,plan_id text,status text DEFAULT 'trialing',period_started_at timestamptz,period_ends_at timestamptz);
 CREATE TABLE password_reset_tokens(user_id uuid,token_hash text,expires_at timestamptz,used_at timestamptz);
 CREATE TABLE subscription_plans(id text,monthly_assessments integer,max_students integer);
 CREATE TABLE portal_settings(id integer,question_bank_id uuid);
 CREATE TABLE assessments(id uuid PRIMARY KEY,title text,subject text);
 CREATE TABLE assessment_applications(id uuid PRIMARY KEY,assessment_id uuid,class_id uuid,institution_id uuid,scheduled_at timestamptz,status text);
 CREATE TABLE application_students(id uuid PRIMARY KEY,application_id uuid,student_id uuid);
 CREATE TABLE card_scans(application_student_id uuid,submission_id uuid,status text,completed_at timestamptz);
 CREATE TABLE assessment_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_student_id uuid UNIQUE,published_version_id uuid);
 CREATE TABLE assessment_result_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),score numeric,max_score numeric,percent numeric,valid_count int,correct_count int,incorrect_count int,blank_count int,invalid_count int,annulled_count int);
 CREATE TABLE assessment_result_publications(result_version_id uuid,authorized_at timestamptz DEFAULT now());
 CREATE TABLE assessment_submissions(id uuid PRIMARY KEY,score numeric,max_score numeric,requires_manual_review boolean);
 `);
      for (const name of [
        '042_google_auth.sql',
        '043_unique_cpf.sql',
        '044_educator_schools.sql',
        '067_auth_email_verification.sql',
        '069_mobile_google_login.sql',
        '070_class_invites.sql',
        '071_student_accounts_class_links.sql',
        '102_student_access_code_links.sql',
        '104_student_code_login.sql',
        '107_auth_rate_limits.sql',
        '108_session_active_institution.sql',
      ])
        await pool.query(
          await readFile(
            new URL('../../database/' + name, import.meta.url),
            'utf8',
          ),
        );
      const instA = randomUUID(),
        instB = randomUUID(),
        teacherA = randomUUID(),
        teacherB = randomUUID(),
        classA = randomUUID(),
        ana = randomUUID(),
        bia = randomUUID(),
        semTurma = randomUUID();
      await pool.query(
        "INSERT INTO institutions VALUES($1,'Instituição A','a'),($2,'Instituição B','b')",
        [instA, instB],
      );
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,'teacher-a@example.test','Professor A'),($2,'teacher-b@example.test','Professor B')",
        [teacherA, teacherB],
      );
      await pool.query(
        "INSERT INTO memberships VALUES($1,$2,'teacher'),($3,$4,'teacher')",
        [instA, teacherA, instB, teacherB],
      );
      await pool.query("INSERT INTO classes VALUES($1,$2,'6º A',NULL)", [
        classA,
        instA,
      ]);
      await pool.query(
        `INSERT INTO students(id,institution_id,name,registration,access_code) VALUES
         ($1,$4,'Ana Souza','001','UFA-AAAA0001'),($2,$4,'Bia Lima','002','UFA-BBBB0002'),($3,$4,'Sem Turma','003','UFA-CCCC0003')`,
        [ana, bia, semTurma, instA],
      );
      await pool.query('INSERT INTO class_enrollments VALUES($1,$2),($1,$3)', [
        classA,
        ana,
        bia,
      ]);
      const staffA = {
          userId: teacherA,
          institutionId: instA,
          role: 'teacher',
        },
        staffB = { userId: teacherB, institutionId: instB, role: 'teacher' };
      const status = (code) => (e) => e.statusCode === code;
      const who = (token) =>
        authenticate({ headers: { authorization: `Bearer ${token}` } });

      // Educadores continuam exigindo e-mail.
      await assert.rejects(
        pool.query(
          "INSERT INTO users(email,display_name) VALUES(NULL,'Sem e-mail')",
        ),
        /users_email_required_check/,
      );

      // Conferência dos dados: não grava nada.
      assert.deepEqual(await codes.inspectFirstAccess({ code: 'aaaa0001' }), {
        studentName: 'Ana Souza',
        schoolName: 'Instituição A',
        classes: [{ className: '6º A' }],
        passwordReset: false,
      });
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM student_account_links'))
          .rows[0].n,
        0,
      );
      await assert.rejects(
        codes.inspectFirstAccess({ code: 'UFA-FFFFFFFF' }),
        status(404),
      );
      await assert.rejects(
        codes.inspectFirstAccess({ code: 'UFA-CCCC0003' }),
        status(422),
      );

      // Primeiro acesso: cria a conta sem e-mail, liga ao cadastro e entra.
      await assert.rejects(
        codes.completeFirstAccess({ code: 'UFA-AAAA0001', password: 'curta' }),
        status(422),
      );
      const first = await codes.completeFirstAccess({
        code: 'UFA-AAAA0001',
        password: 'senha-da-ana',
      });
      assert.equal(first.role, 'student');
      assert.deepEqual(first.user.email, null);
      assert.equal(first.user.displayName, 'Ana Souza');
      assert.equal(first.institution.id, instA);
      const anaIdentity = await who(first.token);
      assert.equal(anaIdentity.role, 'student');
      assert.equal(anaIdentity.institutionId, instA);
      const listed = (await listStudents({ institutionId: instA })).find(
        (s) => s.id === ana,
      );
      assert.equal(listed.linkedAccountName, 'Ana Souza');
      assert.equal(listed.linkedAccountEmail, null);

      // O código vale uma vez para o primeiro acesso.
      await assert.rejects(
        codes.inspectFirstAccess({ code: 'UFA-AAAA0001' }),
        status(409),
      );
      await assert.rejects(
        codes.completeFirstAccess({
          code: 'UFA-AAAA0001',
          password: 'outra-senha',
        }),
        status(409),
      );

      // Login com código e senha.
      const login = await codes.loginWithCode({
        code: 'ufa aaaa0001',
        password: 'senha-da-ana',
      });
      assert.equal((await who(login.token)).userId, anaIdentity.userId);
      await assert.rejects(
        codes.loginWithCode({ code: 'UFA-AAAA0001', password: 'errada' }),
        status(401),
      );
      await assert.rejects(
        codes.loginWithCode({ code: 'xyz', password: 'senha-da-ana' }),
        status(401),
      );
      await assert.rejects(
        codes.loginWithCode({ code: 'UFA-BBBB0002', password: 'senha-da-ana' }),
        status(401),
      );

      // Cadastro ligado a uma conta com e-mail: sem primeiro acesso nem login por código.
      const google = await loginWithGoogle(
        { sub: 'bia', email: 'bia@example.test', name: 'Bia' },
        null,
        'student',
      );
      await codes.claimAccessCode(await who(google.token), {
        code: 'UFA-BBBB0002',
      });
      await assert.rejects(
        codes.inspectFirstAccess({ code: 'UFA-BBBB0002' }),
        status(409),
      );
      await assert.rejects(
        codes.completeFirstAccess({
          code: 'UFA-BBBB0002',
          password: 'senha-da-bia',
        }),
        status(409),
      );

      // Novo código: só a instituição do aluno; encerra as sessões da conta sem e-mail.
      await assert.rejects(codes.renewAccessCode(staffB, ana), status(404));
      await assert.rejects(
        codes.renewAccessCode(anaIdentity, ana),
        status(403),
      );
      const renewed = await codes.renewAccessCode(staffA, ana);
      assert.match(renewed.accessCode, /^UFA-[0-9A-F]{8}$/);
      assert.notEqual(renewed.accessCode, 'UFA-AAAA0001');
      assert.equal(await who(first.token), null);
      assert.equal(await who(login.token), null);
      await assert.rejects(
        codes.loginWithCode({ code: 'UFA-AAAA0001', password: 'senha-da-ana' }),
        status(401),
      );
      // A senha antiga continua valendo com o código novo até o aluno trocá-la.
      assert.ok(
        (
          await codes.loginWithCode({
            code: renewed.accessCode,
            password: 'senha-da-ana',
          })
        ).token,
      );

      // Primeiro acesso com o código novo troca a senha da mesma conta.
      assert.equal(
        (await codes.inspectFirstAccess({ code: renewed.accessCode }))
          .passwordReset,
        true,
      );
      const reset = await codes.completeFirstAccess({
        code: renewed.accessCode,
        password: 'nova-senha-ana',
      });
      assert.equal((await who(reset.token)).userId, anaIdentity.userId);
      await assert.rejects(
        codes.loginWithCode({
          code: renewed.accessCode,
          password: 'senha-da-ana',
        }),
        status(401),
      );
      assert.ok(
        (
          await codes.loginWithCode({
            code: renewed.accessCode,
            password: 'nova-senha-ana',
          })
        ).token,
      );
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int n FROM users WHERE email IS NULL',
          )
        ).rows[0].n,
        1,
      );
      assert.deepEqual(
        (
          await pool.query(
            "SELECT action FROM audit_log WHERE action LIKE 'student.%' ORDER BY action",
          )
        ).rows.map((r) => r.action),
        [
          'student.access_code_renewed',
          'student.first_access',
          'student.password_reset_by_code',
        ],
      );

      // Limite de tentativas por código.
      for (let i = 0; i < 10; i++)
        assert.equal(
          await codes.allowCodeAttempt({ code: 'UFA-DDDD0004' }),
          true,
        );
      assert.equal(
        await codes.allowCodeAttempt({ code: 'ufa-dddd0004' }),
        false,
      );
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
