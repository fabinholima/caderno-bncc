import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
test(
  "student access codes link accounts immediately, isolate institutions and can be undone",
  { skip: !process.env.CLASS_INVITES_TEST_DATABASE_URL },
  async () => {
    const { default: pg } = await import("pg");
    const control = new pg.Pool({ connectionString: process.env.CLASS_INVITES_TEST_DATABASE_URL }),
      schema = "access_code_" + randomUUID().replaceAll("-", "");
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.CLASS_INVITES_TEST_DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = "test";
    process.env.DEV_AUTH_BYPASS = "false";
    process.env.CPF_HASH_SECRET = "test-isolated-secret";
    process.env.AUTH_FRONTEND_URL = "http://localhost:3000";
    const { pool } = await import("./db.mjs");
    const { authenticate, loginWithGoogle } = await import("./auth.mjs");
    const invites = await import("./class-invites.mjs");
    const codes = await import("./student-access-code.mjs");
    const { myStudentProfiles } = await import("./student-profile.mjs");
    const { listStudents } = await import("./academic.mjs");
    try {
      await pool.query(`CREATE TABLE institutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,slug text UNIQUE);
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,password_hash text,active boolean DEFAULT true,portal_admin boolean DEFAULT false,portal_editor boolean DEFAULT false);
 CREATE TABLE memberships(institution_id uuid REFERENCES institutions(id),user_id uuid REFERENCES users(id),role text CHECK(role IN('admin','coordinator','teacher')),PRIMARY KEY(institution_id,user_id));
 CREATE TABLE user_sessions(id uuid DEFAULT gen_random_uuid(),user_id uuid,token_hash text UNIQUE,expires_at timestamptz,last_seen_at timestamptz,global_bank boolean DEFAULT false,last_ip inet,user_agent text);
 CREATE TABLE audit_log(institution_id uuid,user_id uuid,action text,entity_type text,entity_id text);
 CREATE TABLE classes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,school_id uuid);
 CREATE TABLE students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,registration text,active boolean DEFAULT true,teacher_id uuid,access_code text,selfie_data_url text NOT NULL DEFAULT '',status text,adapted_exam boolean NOT NULL DEFAULT false,UNIQUE(institution_id,registration));
 CREATE UNIQUE INDEX students_access_code_unique ON students(lower(access_code));
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
        "042_google_auth.sql",
        "043_unique_cpf.sql",
        "044_educator_schools.sql",
        "067_auth_email_verification.sql",
        "069_mobile_google_login.sql",
        "070_class_invites.sql",
        "071_student_accounts_class_links.sql",
        "102_student_access_code_links.sql",
      ])
        await pool.query(
          await readFile(new URL("../../database/" + name, import.meta.url), "utf8"),
        );
      const instA = randomUUID(),
        instB = randomUUID(),
        teacherA = randomUUID(),
        teacherB = randomUUID(),
        classA1 = randomUUID(),
        classA2 = randomUUID(),
        classB1 = randomUUID(),
        s1 = randomUUID(),
        sNoClass = randomUUID(),
        sInactive = randomUUID(),
        s4 = randomUUID(),
        sB = randomUUID();
      await pool.query(
        "INSERT INTO institutions VALUES($1,'Instituição A','a'),($2,'Instituição B','b')",
        [instA, instB],
      );
      await pool.query(
        "INSERT INTO users(id,email,display_name) VALUES($1,'teacher-a@example.test','Professor A'),($2,'teacher-b@example.test','Professor B')",
        [teacherA, teacherB],
      );
      await pool.query("INSERT INTO memberships VALUES($1,$2,'teacher'),($3,$4,'teacher')", [
        instA,
        teacherA,
        instB,
        teacherB,
      ]);
      const schoolX = (
        await pool.query(
          "INSERT INTO educator_schools(user_id,name,school_type,city,state) VALUES($1,'Escola Estadual X','estadual','Campo Grande','MS') RETURNING id",
          [teacherA],
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO classes VALUES($1,$4,'1º A',$6),($2,$4,'2º B',NULL),($3,$5,'Turma B',NULL)",
        [classA1, classA2, classB1, instA, instB, schoolX],
      );
      await pool.query(
        `INSERT INTO students(id,institution_id,name,registration,active,access_code) VALUES
         ($1,$6,'Ana Souza','001',true,'UFA-1A2B3C4D'),($2,$6,'Sem Turma','002',true,'UFA-00000002'),
         ($3,$6,'Inativo','003',false,'UFA-00000003'),($4,$6,'Bruno Lima','004',true,'UFA-00000004'),
         ($5,$7,'Aluno B','001',true,'UFA-0000000B')`,
        [s1, sNoClass, sInactive, s4, sB, instA, instB],
      );
      await pool.query(
        "INSERT INTO class_enrollments VALUES($1,$3),($2,$3),($1,$4),($1,$5),($6,$7)",
        [classA1, classA2, s1, sInactive, s4, classB1, sB],
      );
      const staffA = { userId: teacherA, institutionId: instA, role: "teacher" },
        staffB = { userId: teacherB, institutionId: instB, role: "teacher" };
      const account = async (sub) => {
        const session = await loginWithGoogle(
          { sub, email: `${sub}@example.test`, name: `Conta ${sub}` },
          null,
          "student",
        );
        return () => authenticate({ headers: { authorization: `Bearer ${session.token}` } });
      };
      const ana = await account("ana"),
        other = await account("other"),
        bruno = await account("bruno"),
        attacker = await account("attacker");
      const status = (code) => (e) => e.statusCode === code;

      // Consulta: não grava e aceita variações do código.
      await assert.rejects(codes.inspectAccessCode(staffA, { code: "UFA-1A2B3C4D" }), status(403));
      const preview = await codes.inspectAccessCode(await ana(), { code: " 1a2b3c4d " });
      assert.deepEqual(preview, {
        studentName: "Ana Souza",
        schoolName: "Escola Estadual X",
        classes: [{ className: "1º A" }, { className: "2º B" }],
      });
      assert.deepEqual(
        (await codes.inspectAccessCode(await ana(), { code: "ufa-1A2B3C4D" })).studentName,
        "Ana Souza",
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM student_account_links")).rows[0].n,
        0,
      );
      await assert.rejects(codes.inspectAccessCode(await ana(), { code: "UFA-FFFFFFFF" }), status(404));
      await assert.rejects(codes.inspectAccessCode(await ana(), { code: "UFA-00000003" }), status(404));
      await assert.rejects(codes.inspectAccessCode(await ana(), { code: "xyz" }), status(404));
      await assert.rejects(codes.claimAccessCode(await ana(), { code: "UFA-00000003" }), status(404));
      await assert.rejects(codes.claimAccessCode(await ana(), { code: "00000002" }), status(422));

      // Vínculo imediato e idempotente.
      const claimed = await codes.claimAccessCode(await ana(), { code: "1A2B3C4D" });
      assert.deepEqual(claimed, {
        studentId: s1,
        classes: [
          { className: "1º A", schoolName: "Escola Estadual X" },
          { className: "2º B", schoolName: "Instituição A" },
        ],
      });
      assert.deepEqual(await codes.claimAccessCode(await ana(), { code: "UFA-1a2b3c4d" }), claimed);
      const link = (await pool.query("SELECT * FROM student_account_links")).rows;
      assert.equal(link.length, 1);
      assert.equal(link[0].linked_by, link[0].user_id);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM audit_log WHERE action='student_link.access_code' AND entity_id=$1",
            [s1],
          )
        ).rows[0].n,
        1,
      );
      const anaIdentity = await ana();
      assert.equal(anaIdentity.role, "student");
      assert.equal(anaIdentity.institutionId, instA);
      const requests = await invites.myJoinRequests(anaIdentity);
      assert.deepEqual(
        requests.map((r) => [r.className, r.schoolName, r.status]).sort(),
        [
          ["1º A", "Escola Estadual X", "approved"],
          ["2º B", "Instituição A", "approved"],
        ],
      );
      assert.deepEqual(
        (await myStudentProfiles(anaIdentity)).map((p) => p.id),
        [s1],
      );
      const assessment = randomUUID(),
        application = randomUUID(),
        assignment = randomUUID();
      await pool.query("INSERT INTO assessments VALUES($1,'Prova de Física')", [assessment]);
      await pool.query("INSERT INTO assessment_applications VALUES($1,$2,$3,$4,now(),'closed')", [
        application,
        assessment,
        classA1,
        instA,
      ]);
      await pool.query("INSERT INTO application_students VALUES($1,$2,$3)", [
        assignment,
        application,
        s1,
      ]);
      const activities = await invites.myActivities(anaIdentity);
      assert.equal(activities.length, 1);
      assert.equal(activities[0].title, "Prova de Física");
      assert.equal(activities[0].schoolName, "Escola Estadual X");

      // Conflitos: cadastro de outra conta e segundo cadastro na mesma instituição.
      await assert.rejects(codes.inspectAccessCode(await other(), { code: "UFA-1A2B3C4D" }), status(409));
      await assert.rejects(codes.claimAccessCode(await other(), { code: "UFA-1A2B3C4D" }), status(409));
      await assert.rejects(codes.claimAccessCode(await ana(), { code: "UFA-00000004" }), status(409));
      const race = await Promise.allSettled([
        codes.claimAccessCode(await other(), { code: "UFA-00000004" }),
        codes.claimAccessCode(await bruno(), { code: "UFA-00000004" }),
      ]);
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(race.filter((r) => r.reason?.statusCode === 409).length, 1);
      const brunoWon = race[1].status === "fulfilled";
      const winner = brunoWon ? bruno : other,
        loser = brunoWon ? other : bruno;
      assert.deepEqual(await invites.myJoinRequests(await loser()), []);

      // Solicitação pendente por convite vira aprovada quando o código é usado.
      const invite = await invites.createInvite(staffA, classA1, { schoolId: schoolX });
      const pending = await invites.requestJoin(await loser(), { code: invite.code });
      assert.equal(pending.status, "pending");
      await assert.rejects(
        codes.claimAccessCode(await loser(), { code: "UFA-00000004" }),
        status(409),
      );
      assert.equal((await invites.myJoinRequests(await loser()))[0].status, "pending");

      // Isolamento entre instituições.
      const claimB = await codes.claimAccessCode(await ana(), { code: "UFA-0000000B" });
      assert.deepEqual(claimB.classes, [{ className: "Turma B", schoolName: "Instituição B" }]);
      await assert.rejects(codes.unlinkStudentAccount(staffB, s1), status(404));
      await assert.rejects(codes.unlinkStudentAccount(staffA, sB), status(404));
      await assert.rejects(codes.unlinkStudentAccount(await ana(), s1), status(403));
      const listA = await listStudents({ institutionId: instA });
      assert.equal(listA.find((s) => s.id === s1).linkedAccountEmail, "ana@example.test");
      assert.equal(listA.find((s) => s.id === sNoClass).linkedAccountEmail, null);
      assert(!(await listStudents({ institutionId: instB })).some((s) => s.id === s1));

      // Desvincular remove aprovações e troca o código.
      const unlinked = await codes.unlinkStudentAccount(staffA, s1);
      assert.equal(unlinked.unlinked, true);
      assert.match(unlinked.accessCode, /^UFA-[0-9A-F]{8}$/);
      assert.notEqual(unlinked.accessCode, "UFA-1A2B3C4D");
      await assert.rejects(codes.unlinkStudentAccount(staffA, s1), status(409));
      const after = await ana();
      assert.deepEqual(
        (await invites.myJoinRequests(after)).map((r) => r.className),
        ["Turma B"],
      );
      assert.deepEqual(
        (await myStudentProfiles(after)).map((p) => p.id),
        [sB],
      );
      assert.deepEqual(await invites.myActivities(after), []);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM memberships WHERE institution_id=$1 AND user_id=$2",
            [instA, after.userId],
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(codes.inspectAccessCode(await other(), { code: "UFA-1A2B3C4D" }), status(404));
      assert.equal(
        (await codes.claimAccessCode(await loser(), { code: unlinked.accessCode })).studentId,
        s1,
      );
      const converted = await invites.myJoinRequests(await loser());
      assert.deepEqual(
        converted.map((r) => [r.className, r.schoolName, r.status]).sort(),
        [
          ["1º A", "Escola Estadual X", "approved"],
          ["2º B", "Instituição A", "approved"],
        ],
      );
      assert.equal(converted.find((r) => r.id === pending.id).status, "approved");
      assert.deepEqual((await myStudentProfiles(await winner())).map((p) => p.id), [s4]);
      const actions = (await pool.query("SELECT action FROM audit_log")).rows.map((x) => x.action);
      assert(actions.includes("student_link.unlinked"));

      // Limite de tentativas por usuário (compartilhado com os convites).
      const tries = await attacker();
      for (let i = 0; i < 30; i++)
        await assert.rejects(
          codes.inspectAccessCode(tries, { code: `UFA-${String(i).padStart(8, "E")}` }),
          status(404),
        );
      await assert.rejects(codes.inspectAccessCode(tries, { code: "UFA-0000000B" }), status(429));
      await assert.rejects(codes.claimAccessCode(tries, { code: "UFA-0000000B" }), status(429));
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
