import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Isolamento entre professores da mesma instituição sobre as migrações reais:
// cada professor vê só as próprias turmas, alunos, avaliações, aplicações e
// cartões; quem leciona na turma (class_subjects) também a vê; coordenação e
// administração veem tudo; outra instituição nunca vê nada.
const databaseUrl = process.env.OWNERSHIP_TEST_DATABASE_URL;
const byText = (a, b) => a.localeCompare(b);
const databaseDir = path.resolve(
  new URL('../../database', import.meta.url).pathname,
);

test(
  'professores só acessam os próprios registros; coordenação vê a instituição',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const schema = 'ownership_' + randomUUID().replaceAll('-', '');
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
      const { assertOwnership, ownedRoute, teacherScope } =
        await import('./ownership.mjs');
      const academic = await import('./academic.mjs');
      const { listAssessments } = await import('./assessments.mjs');
      const { listScans } = await import('./scans.mjs');
      const one = async (sql, values) =>
        (await pool.query(sql, values)).rows[0];

      const institution = await one(
        `INSERT INTO institutions(name,slug) VALUES('Escola',$1) RETURNING id`,
        ['e' + schema],
      );
      const other = await one(
        `INSERT INTO institutions(name,slug) VALUES('Outra',$1) RETURNING id`,
        ['o' + schema],
      );
      const user = (name) =>
        one(
          `INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id`,
          [`${name}-${schema}@test.local`, name],
        );
      const [ana, bruno, carla, coord] = await Promise.all(
        ['ana', 'bruno', 'carla', 'coord'].map(user),
      );
      const staff = (account, role, institutionId = institution.id) => ({
        userId: account.id,
        institutionId,
        role,
        portalAdmin: false,
      });
      const anaId = staff(ana, 'teacher'),
        brunoId = staff(bruno, 'teacher'),
        carlaId = staff(carla, 'teacher');
      const coordId = staff(coord, 'coordinator'),
        outsider = staff(ana, 'admin', other.id);

      const klass = (name, owner) =>
        one(
          `INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES($1,$2,'1º ano',2026,$3) RETURNING id`,
          [institution.id, name, owner.id],
        );
      const classA = await klass('1A', ana),
        classB = await klass('1B', bruno);
      // Carla leciona Física na turma da Ana: passa a ver essa turma e seus alunos.
      await pool.query(
        `INSERT INTO class_subjects(class_id,teacher_id,subject) VALUES($1,$2,'Física')`,
        [classA.id, carla.id],
      );
      const student = async (name, klassRow, teacher) => {
        const row = await one(
          `INSERT INTO students(institution_id,name,registration,teacher_id) VALUES($1,$2,$3,$4) RETURNING id`,
          [institution.id, name, randomUUID(), teacher.id],
        );
        await pool.query(
          'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
          [klassRow.id, row.id],
        );
        return row;
      };
      const studentA = await student('Aluno A', classA, ana),
        studentB = await student('Aluno B', classB, bruno);
      const assessment = (owner) =>
        one(
          `INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Prova','Química','1º ano',$2) RETURNING id`,
          [institution.id, owner.id],
        );
      const assessmentA = await assessment(ana),
        assessmentB = await assessment(bruno);
      const application = (assessmentRow, klassRow, owner) =>
        one(
          `INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
          [institution.id, assessmentRow.id, klassRow.id, owner.id],
        );
      const applicationA = await application(assessmentA, classA, ana),
        applicationB = await application(assessmentB, classB, bruno);
      const scanB = await one(
        `INSERT INTO card_scans(institution_id,uploaded_by,mime_type,image_data,expected_application_id) VALUES($1,$2,'image/png','\\x00',$3) RETURNING id`,
        [institution.id, bruno.id, applicationB.id],
      );

      const ids = (rows) => rows.map((row) => row.id).sort(byText);
      const sorted = (...values) => values.map((row) => row.id).sort(byText);
      const list = async (identity) => {
        const ownerId = teacherScope(identity);
        return {
          classes: ids(
            await academic.listClasses({
              institutionId: identity.institutionId,
              ownerId,
            }),
          ),
          students: ids(
            await academic.listStudents({
              institutionId: identity.institutionId,
              ownerId,
            }),
          ),
          applications: ids(
            await academic.listApplications({
              institutionId: identity.institutionId,
              ownerId,
            }),
          ),
          assessments: ids(
            await listAssessments({
              institutionId: identity.institutionId,
              ownerId,
            }),
          ),
          scans: ids(
            await listScans({ institutionId: identity.institutionId, ownerId }),
          ),
        };
      };

      assert.deepEqual(await list(anaId), {
        classes: sorted(classA),
        students: sorted(studentA),
        applications: sorted(applicationA),
        assessments: sorted(assessmentA),
        scans: [],
      });
      assert.deepEqual(await list(brunoId), {
        classes: sorted(classB),
        students: sorted(studentB),
        applications: sorted(applicationB),
        assessments: sorted(assessmentB),
        scans: sorted(scanB),
      });
      const carlaView = await list(carlaId);
      assert.deepEqual(
        [carlaView.classes, carlaView.students, carlaView.applications],
        [sorted(classA), sorted(studentA), sorted(applicationA)],
      );
      assert.deepEqual(carlaView.assessments, []);
      assert.deepEqual(await list(coordId), {
        classes: sorted(classA, classB),
        students: sorted(studentA, studentB),
        applications: sorted(applicationA, applicationB),
        assessments: sorted(assessmentA, assessmentB),
        scans: sorted(scanB),
      });

      // Rotas com ID: 404 para registro alheio, sem revelar que ele existe.
      const denied = { statusCode: 404 };
      await assertOwnership(anaId, 'class', classA.id);
      await assert.rejects(assertOwnership(anaId, 'class', classB.id), denied);
      await assert.rejects(
        assertOwnership(anaId, 'student', studentB.id),
        denied,
      );
      await assert.rejects(
        assertOwnership(anaId, 'application', applicationB.id),
        denied,
      );
      await assert.rejects(
        assertOwnership(anaId, 'assessment', assessmentB.id),
        denied,
      );
      await assert.rejects(assertOwnership(anaId, 'scan', scanB.id), denied);
      await assertOwnership(brunoId, 'scan', scanB.id);
      await assertOwnership(carlaId, 'student', studentA.id);
      await assertOwnership(coordId, 'application', [
        applicationA.id,
        applicationB.id,
      ]);
      await assert.rejects(
        assertOwnership(outsider, 'class', classA.id),
        denied,
      );
      // IDs malformados seguem para a validação do handler.
      await assertOwnership(anaId, 'class', 'nao-e-uuid');

      assert.deepEqual(ownedRoute(`/api/classes/${classA.id}/roster`), {
        kind: 'class',
        id: classA.id,
      });
      assert.deepEqual(
        ownedRoute(
          `/api/assessment-applications/${applicationA.id}/report.csv`,
        ),
        { kind: 'application', id: applicationA.id },
      );
      assert.equal(ownedRoute('/api/class-join-requests/me'), null);
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
