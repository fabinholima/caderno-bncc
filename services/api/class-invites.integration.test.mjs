import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
test(
  'student accounts and class invites preserve records and isolate access in PostgreSQL',
  { skip: !process.env.CLASS_INVITES_TEST_DATABASE_URL },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({
        connectionString: process.env.CLASS_INVITES_TEST_DATABASE_URL,
      }),
      schema = 'invites_' + randomUUID().replaceAll('-', '');
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.CLASS_INVITES_TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_BYPASS = 'false';
    process.env.AUTH_DEV_RESET_TOKENS = 'true';
    process.env.CPF_HASH_SECRET = 'test-isolated-secret';
    process.env.AUTH_FRONTEND_URL = 'http://localhost:3000';
    const { pool } = await import('./db.mjs');
    const {
      registerStudent,
      login,
      verifyEmail,
      authenticate,
      loginWithGoogle,
    } = await import('./auth.mjs');
    const api = await import('./class-invites.mjs');
    try {
      await pool.query(`CREATE TABLE institutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,slug text UNIQUE);
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,password_hash text,active boolean DEFAULT true,portal_admin boolean DEFAULT false,portal_editor boolean DEFAULT false);
 CREATE TABLE memberships(institution_id uuid REFERENCES institutions(id),user_id uuid REFERENCES users(id),role text CHECK(role IN('admin','coordinator','teacher')),PRIMARY KEY(institution_id,user_id));
 CREATE TABLE user_sessions(id uuid DEFAULT gen_random_uuid(),user_id uuid,token_hash text UNIQUE,expires_at timestamptz,last_seen_at timestamptz,global_bank boolean DEFAULT false,last_ip inet,user_agent text);
 CREATE TABLE audit_log(institution_id uuid,user_id uuid,action text,entity_type text,entity_id text);
 CREATE TABLE classes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,school_id uuid);
 CREATE TABLE students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,registration text,active boolean DEFAULT true,teacher_id uuid,access_code text,UNIQUE(institution_id,registration));
 CREATE TABLE class_enrollments(class_id uuid,student_id uuid,PRIMARY KEY(class_id,student_id));
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
      ])
        await pool.query(
          await readFile(
            new URL('../../database/' + name, import.meta.url),
            'utf8',
          ),
        );
      await pool.query(
        await readFile(
          new URL('../../database/070_class_invites.sql', import.meta.url),
          'utf8',
        ),
      );
      const school = randomUUID(),
        otherSchool = randomUUID(),
        teacher = randomUUID(),
        otherTeacher = randomUUID(),
        classId = randomUUID(),
        existingStudent = randomUUID();
      await pool.query(
        "INSERT INTO institutions VALUES($1,'Escola A','a'),($2,'Escola B','b')",
        [school, otherSchool],
      );
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,'teacher@example.test','Professor A'),($2,'other@example.test','Professor B')",
        [teacher, otherTeacher],
      );
      await pool.query(
        "INSERT INTO memberships VALUES($1,$2,'teacher'),($3,$4,'teacher')",
        [school, teacher, otherSchool, otherTeacher],
      );
      await pool.query("INSERT INTO classes VALUES($1,$2,'Turma A',NULL)", [
        classId,
        school,
      ]);
      await pool.query(
        "INSERT INTO students(id,institution_id,name,registration) VALUES($1,$2,'Aluno existente','001')",
        [existingStudent, school],
      );
      await pool.query('INSERT INTO class_enrollments VALUES($1,$2)', [
        classId,
        existingStudent,
      ]);
      await pool.query(
        "INSERT INTO educator_schools(user_id,name,school_type,city,state) VALUES($1,'Escola A','estadual','Campo Grande','MS')",
        [teacher],
      );
      await pool.query(
        "INSERT INTO subscription_plans VALUES('trial',30,100);",
      );
      await pool.query(
        "INSERT INTO institution_subscriptions VALUES($1,'trial','trialing',now(),now()+interval '7 days')",
        [school],
      );
      const staff = { userId: teacher, institutionId: school, role: 'teacher' },
        other = {
          userId: otherTeacher,
          institutionId: otherSchool,
          role: 'teacher',
        };
      const registration = await registerStudent({
        displayName: 'Aluno teste',
        email: 'student@example.test',
        password: 'TestPassword123!',
      });
      await assert.rejects(
        login({ email: 'student@example.test', password: 'TestPassword123!' }),
        /Confirme/,
      );
      await verifyEmail({ token: registration.developmentToken });
      const session = await login({
        email: 'student@example.test',
        password: 'TestPassword123!',
      });
      assert.equal(session.role, 'student');
      assert.equal(session.institution, null);
      let student = await authenticate({
        headers: { authorization: `Bearer ${session.token}` },
      });
      assert.equal(student.role, 'student');
      assert.equal(student.portalAdmin, false);
      assert.equal(student.portalEditor, false);
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM institutions')).rows[0]
          .n,
        2,
      );
      await assert.rejects(
        registerStudent({
          displayName: 'Forged',
          email: 'forged@example.test',
          password: 'TestPassword123!',
          role: 'admin',
        }),
      );
      await assert.rejects(
        api.createInvite(student, classId),
        (e) => e.statusCode === 403,
      );
      await assert.rejects(
        api.createInvite(other, classId),
        (e) => e.statusCode === 404,
      );
      const invite = await api.createInvite(staff, classId);
      assert.match(invite.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      assert.equal((await api.getInvite(staff, classId)).code, invite.code);
      await assert.rejects(
        api.inspectInvite(staff, { code: invite.code }),
        (e) => e.statusCode === 403,
      );
      assert.equal(
        (await api.inspectInvite(student, { code: invite.code })).schoolName,
        'Escola A',
      );
      const req = await api.requestJoin(student, { code: invite.code });
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM class_enrollments'))
          .rows[0].n,
        1,
      );
      await assert.rejects(
        api.requestJoin(student, { code: invite.code }),
        (e) => e.statusCode === 409,
      );
      await assert.rejects(
        api.decideRequest(other, req.id, {
          action: 'approve',
          studentId: existingStudent,
          confirmed: true,
        }),
        (e) => e.statusCode === 404,
      );
      await assert.rejects(
        api.decideRequest(staff, req.id, {
          action: 'approve',
          studentId: existingStudent,
        }),
        (e) => e.statusCode === 422,
      );
      const decisions = await Promise.allSettled(
        [1, 2].map(() =>
          api.decideRequest(staff, req.id, {
            action: 'approve',
            studentId: existingStudent,
            confirmed: true,
          }),
        ),
      );
      assert.equal(decisions.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal(
        decisions.filter(
          (x) => x.status === 'rejected' && x.reason.statusCode === 409,
        ).length,
        1,
      );
      assert.equal(
        (
          await pool.query('SELECT name FROM students WHERE id=$1', [
            existingStudent,
          ])
        ).rows[0].name,
        'Aluno existente',
      );
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM students')).rows[0].n,
        1,
      );
      assert.equal((await api.myJoinRequests(student))[0].status, 'approved');
      assert.equal((await api.listRequests(staff, classId)).length, 0);
      student = await authenticate({
        headers: { authorization: `Bearer ${session.token}` },
      });
      assert.equal(student.role, 'student');
      const renewed = await api.createInvite(staff, classId);
      await assert.rejects(
        api.inspectInvite(student, { code: invite.code }),
        (e) => e.statusCode === 404,
      );
      assert.equal(
        (await api.inspectInvite(student, { code: renewed.code })).className,
        'Turma A',
      );
      await api.deactivateInvite(staff, classId);
      await assert.rejects(
        api.inspectInvite(student, { code: renewed.code }),
        (e) => e.statusCode === 404,
      );
      await Promise.all([
        api.createInvite(staff, classId),
        api.createInvite(staff, classId),
      ]);
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int n FROM class_invites WHERE active',
          )
        ).rows[0].n,
        1,
      );
      const google = await loginWithGoogle(
        {
          sub: 'student-google',
          email: 'google-student@example.test',
          name: 'Aluno Google',
        },
        null,
        'student',
      );
      const g = await authenticate({
        headers: { authorization: `Bearer ${google.token}` },
      });
      assert.equal(g.role, 'student');
      assert.equal(g.institutionId, null);
      const second = await api.requestJoin(g, {
        code: (await api.getInvite(staff, classId)).code,
      });
      await assert.rejects(
        api.decideRequest(staff, second.id, {
          action: 'approve',
          studentId: existingStudent,
          confirmed: true,
        }),
        (e) => e.statusCode === 409,
      );
      assert.equal((await api.myJoinRequests(g))[0].status, 'pending');
      await api.decideRequest(staff, second.id, { action: 'reject' });
      assert.equal((await api.myJoinRequests(g))[0].status, 'rejected');
      assert.deepEqual(await api.myActivities(g), []);
      const assessment = randomUUID(),
        application = randomUUID(),
        assignment = randomUUID(),
        submission = randomUUID();
      await pool.query(
        "INSERT INTO assessments VALUES($1,'Prova preservada')",
        [assessment],
      );
      await pool.query(
        "INSERT INTO assessment_applications VALUES($1,$2,$3,$4,now(),'closed')",
        [application, assessment, classId, school],
      );
      await pool.query('INSERT INTO application_students VALUES($1,$2,$3)', [
        assignment,
        application,
        existingStudent,
      ]);
      // Sem autorização do professor o aluno vê apenas "em correção", sem nota.
      await pool.query(
        'INSERT INTO assessment_submissions VALUES($1,8,10,false)',
        [submission],
      );
      await pool.query(
        "INSERT INTO card_scans VALUES($1,$2,'completed',now())",
        [assignment, submission],
      );
      assert.equal(
        (await api.myActivities(student))[0].resultStatus,
        'not_corrected',
      );
      const version = (
        await pool.query(
          'INSERT INTO assessment_result_versions(score,max_score,percent,valid_count,correct_count,incorrect_count,blank_count,invalid_count,annulled_count) VALUES(8,10,80,10,8,1,1,0,0) RETURNING id',
        )
      ).rows[0].id;
      await pool.query(
        'INSERT INTO assessment_results(application_student_id) VALUES($1)',
        [assignment],
      );
      let [activity] = await api.myActivities(student);
      assert.deepEqual(
        [activity.score, activity.requiresManualReview, activity.resultStatus],
        [null, true, 'in_correction'],
      );
      await pool.query(
        'UPDATE assessment_results SET published_version_id=$1',
        [version],
      );
      await pool.query(
        'INSERT INTO assessment_result_publications(result_version_id) VALUES($1)',
        [version],
      );
      [activity] = await api.myActivities(student);
      assert.deepEqual(
        [
          activity.score,
          activity.percent,
          activity.correctCount,
          activity.resultStatus,
          activity.requiresManualReview,
        ],
        ['8', 80, 8, 'published', false],
      );
      assert.deepEqual(await api.myActivities(g), []);
      const newStudent = await loginWithGoogle(
        {
          sub: 'new-student-account',
          email: 'new-student@example.test',
          name: 'Aluno Novo',
        },
        null,
        'student',
      );
      const n = await authenticate({
        headers: { authorization: `Bearer ${newStudent.token}` },
      });
      const newReq = await api.requestJoin(n, {
        code: (await api.getInvite(staff, classId)).code,
      });
      await assert.rejects(
        api.decideRequest(staff, newReq.id, {
          action: 'approve',
          studentName: 'Aluno Novo',
          registration: '001',
          confirmed: true,
        }),
        { statusCode: 409, message: /matrícula 001/ },
      );
      await api.decideRequest(staff, newReq.id, {
        action: 'approve',
        studentName: 'Aluno Novo',
        registration: '002',
        confirmed: true,
      });
      assert.equal((await api.myJoinRequests(n))[0].status, 'approved');
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM students')).rows[0].n,
        2,
      );
      const actions = (
        await pool.query('SELECT action FROM audit_log')
      ).rows.map((x) => x.action);
      for (const action of [
        'class_invite.created',
        'class_invite.renewed',
        'class_invite.deactivated',
        'class_join.approved',
        'class_join.rejected',
      ])
        assert(actions.includes(action));
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
