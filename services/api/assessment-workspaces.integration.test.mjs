import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
const url = process.env.ASSESSMENT_WORKSPACE_TEST_DATABASE_URL;
test(
  'montagens: reabertura, duplicação, arquivo, favoritos e isolamento',
  { skip: !url },
  async () => {
    const schema = `workspace_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    let pool;
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      await admin.query(`SET search_path TO ${schema}`);
      await admin.query(
        'CREATE TABLE institutions(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE assessments(id uuid PRIMARY KEY,institution_id uuid,created_by uuid)',
      );
      await admin.query(
        await fs.readFile(
          new URL(
            '../../database/089_assessment_workspaces.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      process.env.DATABASE_URL = url;
      process.env.PGOPTIONS = `-c search_path=${schema}`;
      pool = (await import('./db.mjs')).pool;
      const {
        createWorkspace,
        saveWorkspace,
        getWorkspace,
        listWorkspaces,
        pinWorkspace,
        deleteWorkspace,
      } = await import('./assessment-workspaces.mjs');
      const institutionId = randomUUID(),
        userId = randomUUID(),
        other = randomUUID();
      await admin.query('INSERT INTO institutions VALUES($1)', [institutionId]);
      await admin.query('INSERT INTO users VALUES($1),($2)', [userId, other]);
      const owner = { institutionId, userId };
      const configuration = {
        title: 'Prova inicial',
        grade: '7º ano',
        header: {
          institutionName: 'Escola',
          teacherName: 'Professor',
          className: '',
          term: '',
          date: '',
          transcriptionPhrase: '',
          logoDataUrl: '',
        },
        sections: [],
        questionPoints: {},
        shuffleQuestions: false,
      };
      const first = await createWorkspace({
        ...owner,
        input: { configuration },
      });
      const edited = { ...first.configuration, title: 'Prova revisada' };
      assert.equal(
        (
          await saveWorkspace({
            ...owner,
            id: first.id,
            input: { configuration: edited, revision: 1 },
          })
        ).revision,
        2,
      );
      assert.deepEqual(
        (await getWorkspace({ ...owner, id: first.id })).configuration,
        edited,
      );
      await assert.rejects(
        saveWorkspace({
          ...owner,
          id: first.id,
          input: { configuration, revision: 1 },
        }),
        { statusCode: 409 },
      );
      await assert.rejects(
        getWorkspace({ ...owner, userId: other, id: first.id }),
        { statusCode: 404 },
      );
      const copy = await createWorkspace({
        ...owner,
        input: { configuration: edited },
      });
      assert.notEqual(copy.id, first.id);
      assert.equal(copy.assessmentId, null);
      for (let n = 0; n < 10; n++)
        await createWorkspace({ ...owner, input: { configuration } });
      await pinWorkspace({ ...owner, id: first.id, input: { pinned: true } });
      const page = await listWorkspaces(owner);
      assert.equal(page.length, 10);
      assert.equal(page[0].id, first.id);
      assert.equal((await listWorkspaces({ ...owner, offset: 10 })).length, 2);
      assert.equal(
        (await listWorkspaces({ ...owner, userId: other })).length,
        0,
      );
      assert.deepEqual(await deleteWorkspace({ ...owner, id: copy.id }), {
        id: copy.id,
        assessmentPreserved: false,
      });
      await assert.rejects(getWorkspace({ ...owner, id: copy.id }), {
        statusCode: 404,
      });
      await assert.rejects(
        deleteWorkspace({ ...owner, userId: other, id: first.id }),
        {
          statusCode: 404,
        },
      );
    } finally {
      if (pool) await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
