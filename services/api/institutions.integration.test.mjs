import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Instituição ativa por sessão e aceite de convite sobre as migrações reais.
const databaseUrl = process.env.INSTITUTIONS_TEST_DATABASE_URL;
const databaseDir = path.resolve(
  new URL('../../database', import.meta.url).pathname,
);

test(
  'convite aceito vira instituição ativa e o seletor só troca para instituições da conta',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const schema = 'institutions_' + randomUUID().replaceAll('-', '');
    const control = new pg.Pool({ connectionString: databaseUrl });
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_BYPASS = 'false';
    delete process.env.RESEND_API_KEY;
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
      const auth = await import('./auth.mjs');
      const one = async (sql, values) =>
        (await pool.query(sql, values)).rows[0];
      const institution = (name) =>
        one('INSERT INTO institutions(name,slug) VALUES($1,$2) RETURNING id', [
          name,
          name + schema,
        ]);
      const home = await institution('Escola Alfa'),
        school = await institution('Escola Beta'),
        foreign = await institution('Escola Gama');
      const user = (email) =>
        one(
          'INSERT INTO users(email,display_name) VALUES($1,$1) RETURNING id,email',
          [email],
        );
      const owner = await user(`dona-${schema}@test.local`),
        teacher = await user(`prof-${schema}@test.local`);
      await pool.query(
        "INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'admin'),($3,$4,'admin')",
        [school.id, owner.id, home.id, teacher.id],
      );

      const { token, sessionId } = await auth.createSession(pool, teacher.id);
      const who = () =>
        auth.authenticate({ headers: { authorization: `Bearer ${token}` } });
      let identity = await who();
      assert.equal(identity.institutionId, home.id);
      assert.equal(identity.sessionId, sessionId);

      // A dona da Escola Beta convida a professora; sem Resend em teste, o token volta na resposta.
      const ownerIdentity = {
        userId: owner.id,
        institutionId: school.id,
        role: 'admin',
        portalAdmin: false,
      };
      const invitation = await auth.createInvitation(ownerIdentity, {
        email: teacher.email,
        role: 'teacher',
      });
      assert.equal(invitation.emailSent, false);
      await assert.rejects(
        auth.acceptInvitation(
          { ...identity, email: `outra-${schema}@test.local` },
          { token: invitation.developmentToken },
        ),
        /inválido/,
      );
      assert.deepEqual(
        await auth.acceptInvitation(identity, {
          token: invitation.developmentToken,
        }),
        { accepted: true, institutionId: school.id, role: 'teacher' },
      );
      await assert.rejects(
        auth.acceptInvitation(identity, { token: invitation.developmentToken }),
        /inválido/,
      );

      identity = await who();
      assert.equal(identity.institutionId, school.id);
      assert.equal(identity.role, 'teacher');
      assert.deepEqual(
        (await auth.listMyInstitutions(identity)).map((row) => [
          row.name,
          row.role,
        ]),
        [
          ['Escola Alfa', 'admin'],
          ['Escola Beta', 'teacher'],
        ],
      );

      await auth.switchInstitution(identity, { institutionId: home.id });
      identity = await who();
      assert.deepEqual(
        [identity.institutionId, identity.role],
        [home.id, 'admin'],
      );
      await assert.rejects(
        auth.switchInstitution(identity, { institutionId: foreign.id }),
        { statusCode: 404 },
      );
      assert.equal((await who()).institutionId, home.id);
      // Outra sessão da mesma conta não é afetada pela troca.
      await auth.switchInstitution(identity, { institutionId: school.id });
      assert.equal((await who()).institutionId, school.id);
      const second = await auth.createSession(pool, teacher.id);
      assert.equal(
        (
          await auth.authenticate({
            headers: { authorization: `Bearer ${second.token}` },
          })
        ).institutionId,
        home.id,
      );
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
