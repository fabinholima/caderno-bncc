import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.ACADEMIC_APPLICATION_TEST_DATABASE_URL;

test(
  'reutiliza aplicação da mesma avaliação e turma, sem erro de chave duplicada',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({ connectionString: databaseUrl });
    const schema = `academic_app_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    process.env.NODE_ENV = 'test';
    const { pool } = await import('./db.mjs');
    const { createApplication } = await import('./academic.mjs');

    try {
      await pool.query(`
        CREATE TABLE assessments(id uuid PRIMARY KEY,institution_id uuid);
        CREATE TABLE classes(id uuid PRIMARY KEY,institution_id uuid,name text,grade text,school_year integer);
        CREATE TABLE assessment_versions(id uuid PRIMARY KEY,assessment_id uuid,code text);
        CREATE TABLE students(id uuid PRIMARY KEY,institution_id uuid,name text,registration text,active boolean DEFAULT true);
        CREATE TABLE class_enrollments(class_id uuid,student_id uuid,number integer,PRIMARY KEY(class_id,student_id));
        CREATE TABLE assessment_applications(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,assessment_id uuid,class_id uuid,
          scheduled_at timestamptz,status text DEFAULT 'scheduled',created_by uuid,
          UNIQUE(assessment_id,class_id)
        );
        CREATE TABLE application_students(id uuid PRIMARY KEY,application_id uuid,student_id uuid,assessment_version_id uuid,qr_payload text);
        CREATE TABLE render_jobs(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assessment_version_id uuid,template_version text,
          application_student_id uuid,status text DEFAULT 'queued',error_message text,completed_at timestamptz,
          output_manifest jsonb,created_at timestamptz DEFAULT now()
        );
      `);

      const institutionId = randomUUID();
      const assessmentId = randomUUID();
      const classId = randomUUID();
      const versionId = randomUUID();
      const studentId = randomUUID();
      const userId = randomUUID();
      await pool.query('INSERT INTO assessments(id,institution_id) VALUES($1,$2)', [assessmentId,institutionId]);
      await pool.query('INSERT INTO classes(id,institution_id,name,grade,school_year) VALUES($1,$2,$3,$4,$5)', [classId,institutionId,'2º Ano D','Ensino Médio',2026]);
      await pool.query('INSERT INTO assessment_versions(id,assessment_id,code) VALUES($1,$2,$3)', [versionId,assessmentId,'A']);
      await pool.query('INSERT INTO students(id,institution_id,name,registration) VALUES($1,$2,$3,$4)', [studentId,institutionId,'Estudante Teste','001']);
      await pool.query('INSERT INTO class_enrollments(class_id,student_id,number) VALUES($1,$2,1)', [classId,studentId]);

      const input = { assessmentId,classId,scheduledAt:'2026-10-28T16:00:00.000Z' };
      const first = await createApplication({ institutionId,userId,input });
      assert.equal(first.reused,false);
      assert.equal(first.assignments.length,1);
      await pool.query('UPDATE assessment_applications SET status=\'cancelled\' WHERE id=$1', [first.id]);
      await pool.query(`UPDATE render_jobs SET status='failed',error_message='Aplicação cancelada.' WHERE application_student_id=$1`, [first.assignments[0].id]);

      const retried = await createApplication({ institutionId,userId,input });
      assert.equal(retried.id,first.id);
      assert.equal(retried.reused,true);
      assert.equal(retried.status,'scheduled');
      assert.equal(retried.assignments.length,1);
      assert.equal(retried.assignments[0].status,'queued');
      assert.equal((await pool.query('SELECT count(*)::int total FROM assessment_applications')).rows[0].total,1);
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
