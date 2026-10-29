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
          assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'scheduled'
        );
        CREATE TABLE application_students(
          id uuid PRIMARY KEY,
          application_id uuid NOT NULL REFERENCES assessment_applications(id) ON DELETE CASCADE,
          assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE RESTRICT
        );
        CREATE TABLE render_jobs(
          id uuid PRIMARY KEY,
          assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
          application_student_id uuid REFERENCES application_students(id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'queued'
        );
        CREATE TABLE card_scans(
          id uuid PRIMARY KEY,
          expected_application_id uuid REFERENCES assessment_applications(id) ON DELETE RESTRICT,
          application_student_id uuid REFERENCES application_students(id) ON DELETE SET NULL
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
      const applicationId = randomUUID();
      const appliedVersionId = randomUUID();
      const assignmentId = randomUUID();
      await admin.query('INSERT INTO assessment_versions VALUES ($1, $2)', [
        appliedVersionId,
        appliedId,
      ]);
      await admin.query(
        'INSERT INTO assessment_applications(id, assessment_id) VALUES ($1, $2)',
        [applicationId, appliedId],
      );
      await admin.query(
        'INSERT INTO application_students(id, application_id, assessment_version_id) VALUES ($1, $2, $3)',
        [assignmentId, applicationId, appliedVersionId],
      );
      await admin.query(
        'INSERT INTO render_jobs(id, assessment_version_id, application_student_id, status) VALUES ($1, $2, $3, $4)',
        [randomUUID(), appliedVersionId, assignmentId, 'queued'],
      );
      await assert.rejects(
        deleteAssessment({ institutionId, userId, assessmentId: appliedId }),
        { statusCode: 409 },
      );
      assert.deepEqual(
        await deleteAssessment({
          institutionId,
          userId,
          assessmentId: appliedId,
          unlinkUnsentApplications: true,
        }),
        { id: appliedId, deleted: true },
      );
      assert.equal(
        (await admin.query('SELECT 1 FROM assessment_applications WHERE id = $1', [applicationId])).rowCount,
        0,
      );
      assert.equal(
        (await admin.query('SELECT 1 FROM assessments WHERE id = $1', [appliedId])).rowCount,
        0,
      );

      const printedId = randomUUID();
      const printedVersionId = randomUUID();
      const printedApplicationId = randomUUID();
      const printedAssignmentId = randomUUID();
      await admin.query('INSERT INTO assessments VALUES ($1, $2, $3)', [
        printedId,
        institutionId,
        userId,
      ]);
      await admin.query('INSERT INTO assessment_versions VALUES ($1, $2)', [
        printedVersionId,
        printedId,
      ]);
      await admin.query(
        'INSERT INTO assessment_applications(id, assessment_id) VALUES ($1, $2)',
        [printedApplicationId, printedId],
      );
      await admin.query(
        'INSERT INTO application_students(id, application_id, assessment_version_id) VALUES ($1, $2, $3)',
        [printedAssignmentId, printedApplicationId, printedVersionId],
      );
      await admin.query(
        'INSERT INTO render_jobs(id, assessment_version_id, application_student_id, status) VALUES ($1, $2, $3, $4)',
        [randomUUID(), printedVersionId, printedAssignmentId, 'completed'],
      );
      await assert.rejects(
        deleteAssessment({
          institutionId,
          userId,
          assessmentId: printedId,
          unlinkUnsentApplications: true,
        }),
        { statusCode: 409 },
      );
      assert.equal(
        (await admin.query('SELECT 1 FROM assessments WHERE id = $1', [printedId])).rowCount,
        1,
      );

      const scannedId = randomUUID();
      const scannedVersionId = randomUUID();
      const scannedApplicationId = randomUUID();
      const scannedAssignmentId = randomUUID();
      await admin.query('INSERT INTO assessments VALUES ($1, $2, $3)', [
        scannedId,
        institutionId,
        userId,
      ]);
      await admin.query('INSERT INTO assessment_versions VALUES ($1, $2)', [
        scannedVersionId,
        scannedId,
      ]);
      await admin.query(
        'INSERT INTO assessment_applications(id, assessment_id) VALUES ($1, $2)',
        [scannedApplicationId, scannedId],
      );
      await admin.query(
        'INSERT INTO application_students(id, application_id, assessment_version_id) VALUES ($1, $2, $3)',
        [scannedAssignmentId, scannedApplicationId, scannedVersionId],
      );
      await admin.query(
        'INSERT INTO card_scans(id, expected_application_id, application_student_id) VALUES ($1, $2, $3)',
        [randomUUID(), scannedApplicationId, scannedAssignmentId],
      );
      await assert.rejects(
        deleteAssessment({
          institutionId,
          userId,
          assessmentId: scannedId,
          unlinkUnsentApplications: true,
        }),
        { statusCode: 409 },
      );
      assert.equal(
        (await admin.query('SELECT 1 FROM assessments WHERE id = $1', [scannedId])).rowCount,
        1,
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
