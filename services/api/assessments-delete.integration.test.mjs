import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';

const url = process.env.ASSESSMENT_DELETE_TEST_DATABASE_URL;

test(
  'exclusão remove prova sem vínculos e preserva provas com aplicações ou respostas',
  { skip: !url },
  async () => {
    const schema = `assessment_delete_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    let pool;
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      await admin.query(`SET search_path TO ${schema}`);
      await admin.query(`
        CREATE TABLE institutions(id uuid PRIMARY KEY);
        CREATE TABLE users(id uuid PRIMARY KEY);
        CREATE TABLE assessments(
          id uuid PRIMARY KEY,
          institution_id uuid NOT NULL REFERENCES institutions(id),
          created_by uuid NOT NULL REFERENCES users(id)
        );
        CREATE TABLE assessment_versions(
          id uuid PRIMARY KEY,
          assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE
        );
        CREATE TABLE assessment_submissions(
          id uuid PRIMARY KEY,
          assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE
        );
        CREATE TABLE assessment_applications(
          id uuid PRIMARY KEY,
          assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE
        );
      `);
      await admin.query(
        await fs.readFile(
          new URL('../../database/089_assessment_workspaces.sql', import.meta.url),
          'utf8',
        ),
      );
      process.env.DATABASE_URL = url;
      process.env.PGOPTIONS = `-c search_path=${schema}`;
      pool = (await import('./db.mjs')).pool;
      const { deleteAssessment } = await import('./assessments.mjs');
      const institutionId = randomUUID();
      const userId = randomUUID();
      const otherUserId = randomUUID();
      await admin.query('INSERT INTO institutions VALUES ($1)', [institutionId]);
      await admin.query('INSERT INTO users VALUES ($1), ($2)', [userId, otherUserId]);

      const deletableId = randomUUID();
      await admin.query('INSERT INTO assessments VALUES ($1, $2, $3)', [
        deletableId,
        institutionId,
        userId,
      ]);
      await admin.query(
        `INSERT INTO assessment_workspaces(institution_id, created_by, configuration, assessment_id)
         VALUES ($1, $2, '{}'::jsonb, $3)`,
        [institutionId, userId, deletableId],
      );
      assert.deepEqual(
        await deleteAssessment({ institutionId, userId, assessmentId: deletableId }),
        { id: deletableId, deleted: true },
      );
      assert.equal(
        (await admin.query('SELECT 1 FROM assessments WHERE id = $1', [deletableId])).rowCount,
        0,
      );
      assert.equal(
        (await admin.query('SELECT 1 FROM assessment_workspaces WHERE assessment_id = $1', [deletableId])).rowCount,
        0,
      );

      const submittedId = randomUUID();
      const versionId = randomUUID();
      await admin.query('INSERT INTO assessments VALUES ($1, $2, $3)', [
        submittedId,
        institutionId,
        userId,
      ]);
      await admin.query('INSERT INTO assessment_versions VALUES ($1, $2)', [
        versionId,
        submittedId,
      ]);
      await admin.query('INSERT INTO assessment_submissions VALUES ($1, $2)', [
        randomUUID(),
        versionId,
      ]);
      await assert.rejects(
        deleteAssessment({ institutionId, userId, assessmentId: submittedId }),
        { statusCode: 409 },
      );

      const appliedId = randomUUID();
      await admin.query('INSERT INTO assessments VALUES ($1, $2, $3)', [
        appliedId,
        institutionId,
        userId,
      ]);
      await admin.query('INSERT INTO assessment_applications VALUES ($1, $2)', [
        randomUUID(),
        appliedId,
      ]);
      await assert.rejects(
        deleteAssessment({ institutionId, userId, assessmentId: appliedId }),
        { statusCode: 409 },
      );
      await assert.rejects(
        deleteAssessment({
          institutionId,
          userId: otherUserId,
          assessmentId: appliedId,
        }),
        { statusCode: 404 },
      );
    } finally {
      if (pool) await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
