import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Usa o mesmo banco de teste das outras rotas de turma (já configurado na CI).
const databaseUrl = process.env.CLASS_CREATE_TEST_DATABASE_URL || process.env.CLASS_DELETE_TEST_DATABASE_URL;

test(
  'cria turma vinculada a uma escola do próprio professor',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({ connectionString: databaseUrl });
    const schema = `class_create_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    process.env.NODE_ENV = 'test';
    const { pool } = await import('./db.mjs');
    const { createClass, listClasses } = await import('./academic.mjs');

    try {
      await pool.query(`
        CREATE TABLE institutions(id uuid PRIMARY KEY);
        CREATE TABLE educator_schools(id uuid PRIMARY KEY,user_id uuid NOT NULL,name text NOT NULL);
        CREATE TABLE classes(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          institution_id uuid NOT NULL REFERENCES institutions(id),
          name text NOT NULL, grade text, school_year int,
          school_id uuid REFERENCES educator_schools(id), created_by uuid
        );
        CREATE TABLE class_enrollments(class_id uuid,student_id uuid);
        CREATE TABLE class_subjects(class_id uuid,teacher_id uuid,subject text);
        CREATE TABLE class_invites(class_id uuid,school_id uuid,active boolean);
      `);
      const institutionId = randomUUID();
      const teacher = randomUUID();
      const otherTeacher = randomUUID();
      const school = randomUUID();
      const otherSchool = randomUUID();
      await pool.query('INSERT INTO institutions VALUES($1)', [institutionId]);
      await pool.query('INSERT INTO educator_schools VALUES($1,$2,$3),($4,$5,$6)', [school, teacher, 'EE Clarinda', otherSchool, otherTeacher, 'Outra escola']);

      const created = await createClass({ institutionId, userId: teacher, input: { schoolId: school, name: '2º A', grade: 'Ensino Médio', schoolYear: 2026 } });
      assert.equal(created.schoolId, school);
      assert.equal(created.schoolName, 'EE Clarinda');
      const stored = await pool.query('SELECT school_id,created_by FROM classes WHERE id=$1', [created.id]);
      assert.deepEqual(stored.rows[0], { school_id: school, created_by: teacher });
      const [listed] = await listClasses({ institutionId });
      assert.equal(listed.schoolName, 'EE Clarinda');

      // Escola de outro professor ou turma sem escola: recusado.
      await assert.rejects(
        createClass({ institutionId, userId: teacher, input: { schoolId: otherSchool, name: '2º B', grade: 'EM', schoolYear: 2026 } }),
        { statusCode: 422 },
      );
      await assert.rejects(createClass({ institutionId, userId: teacher, input: { name: '2º C', grade: 'EM', schoolYear: 2026 } }), /Selecione a escola/);
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
