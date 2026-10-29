import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.CLASS_DELETE_TEST_DATABASE_URL;

test(
  'exclui turma e matrículas sem apagar alunos e bloqueia turma com aplicação',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({ connectionString: databaseUrl });
    const schema = `class_delete_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    process.env.NODE_ENV = 'test';
    const { pool } = await import('./db.mjs');
    const { deleteClass } = await import('./academic.mjs');

    try {
      await pool.query(`
        CREATE TABLE institutions(id uuid PRIMARY KEY);
        CREATE TABLE classes(
          id uuid PRIMARY KEY,
          institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          name text NOT NULL
        );
        CREATE TABLE students(id uuid PRIMARY KEY,institution_id uuid NOT NULL);
        CREATE TABLE class_enrollments(
          class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
          student_id uuid NOT NULL REFERENCES students(id),
          PRIMARY KEY(class_id,student_id)
        );
        CREATE TABLE assessment_applications(
          id uuid PRIMARY KEY,
          class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT
        );
      `);

      const institutionId = randomUUID();
      const classId = randomUUID();
      const studentId = randomUUID();
      await pool.query('INSERT INTO institutions VALUES($1)', [institutionId]);
      await pool.query('INSERT INTO classes(id,institution_id,name) VALUES($1,$2,$3)', [classId,institutionId,'2º Ano D']);
      await pool.query('INSERT INTO students(id,institution_id) VALUES($1,$2)', [studentId,institutionId]);
      await pool.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)', [classId,studentId]);

      assert.deepEqual(
        await deleteClass({ institutionId, classId }),
        { id: classId, deleted: true },
      );
      assert.equal((await pool.query('SELECT 1 FROM classes WHERE id=$1',[classId])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM class_enrollments WHERE class_id=$1',[classId])).rowCount,0);
      assert.equal((await pool.query('SELECT 1 FROM students WHERE id=$1',[studentId])).rowCount,1);
      await assert.rejects(deleteClass({ institutionId, classId }), { statusCode: 404 });

      const protectedClassId = randomUUID();
      await pool.query('INSERT INTO classes(id,institution_id,name) VALUES($1,$2,$3)', [protectedClassId,institutionId,'2º Ano E']);
      await pool.query('INSERT INTO assessment_applications(id,class_id) VALUES($1,$2)', [randomUUID(),protectedClassId]);
      await assert.rejects(deleteClass({ institutionId, classId: protectedClassId }), { statusCode: 409 });
      assert.equal((await pool.query('SELECT 1 FROM classes WHERE id=$1',[protectedClassId])).rowCount,1);
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
