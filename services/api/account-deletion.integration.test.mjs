import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
test(
  'users delete their own account: personal data and access go, school records stay',
  { skip: !process.env.CLASS_INVITES_TEST_DATABASE_URL },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({
        connectionString: process.env.CLASS_INVITES_TEST_DATABASE_URL,
      }),
      schema = 'account_deletion_' + randomUUID().replaceAll('-', '');
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.CLASS_INVITES_TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.DEV_AUTH_BYPASS = 'false';
    const { pool } = await import('./db.mjs');
    const { hashPassword } = await import('./auth.mjs');
    const { deleteOwnAccount } = await import('./account-deletion.mjs');
    const { manageSubscriber } = await import('./admin-dashboard.mjs');
    try {
      await pool.query(`CREATE TABLE institutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text);
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text NOT NULL,password_hash text,active boolean DEFAULT true,
   portal_admin boolean DEFAULT false,deleted_at timestamptz,google_subject text UNIQUE,cpf_hash text UNIQUE,email_verified_at timestamptz,
   account_type text NOT NULL DEFAULT 'educator');
 CREATE TABLE memberships(institution_id uuid REFERENCES institutions(id),user_id uuid REFERENCES users(id),role text,PRIMARY KEY(institution_id,user_id));
 CREATE TABLE class_memberships(class_id uuid,user_id uuid REFERENCES users(id),access_role text);
 CREATE TABLE educator_profiles(user_id uuid PRIMARY KEY REFERENCES users(id),phone text,selfie_data_url text);
 CREATE TABLE push_devices(token text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id));
 CREATE TABLE user_sessions(id uuid DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),token_hash text);
 CREATE TABLE password_reset_tokens(user_id uuid REFERENCES users(id),token_hash text);
 CREATE TABLE email_verification_tokens(user_id uuid REFERENCES users(id),token_hash text);
 CREATE TABLE students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,name text,selfie_data_url text NOT NULL DEFAULT '');
 CREATE TABLE student_account_links(institution_id uuid,user_id uuid REFERENCES users(id),student_id uuid UNIQUE REFERENCES students(id),PRIMARY KEY(institution_id,user_id));
 CREATE TABLE billing_contracts(institution_id uuid,status text);
 CREATE TABLE audit_log(institution_id uuid,user_id uuid REFERENCES users(id),action text,entity_type text,entity_id text,metadata jsonb);
 `);
      for (const name of ['104_student_code_login.sql', '118_self_account_deletion.sql'])
        await pool.query(await readFile(new URL('../../database/' + name, import.meta.url), 'utf8'));
      const password = await hashPassword('senha-do-professor');
      const user = async (email, extra = {}) =>
        (
          await pool.query(
            `INSERT INTO users(email,display_name,password_hash,google_subject,cpf_hash,account_type,portal_admin)
             VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [email, extra.name || email, extra.google ? null : password, extra.google || null,
             extra.cpf || null, extra.student ? 'student' : 'educator', Boolean(extra.portalAdmin)],
          )
        ).rows[0].id;
      const school = async (name) =>
        (await pool.query('INSERT INTO institutions(name) VALUES($1) RETURNING id', [name])).rows[0].id;
      const member = (institution, userId, role) =>
        pool.query('INSERT INTO memberships VALUES($1,$2,$3)', [institution, userId, role]);
      const del = (userId, input) => deleteOwnAccount({ userId }, input);
      const rejects = (promise, status, pattern) =>
        assert.rejects(promise, (e) => e.statusCode === status && pattern.test(e.message));

      // Confirmação e senha.
      const escolaA = await school('Escola A');
      const ana = await user('ana@example.com', { cpf: 'cpf-ana' });
      const beto = await user('beto@example.com');
      await member(escolaA, ana, 'admin');
      await member(escolaA, beto, 'teacher');
      await rejects(del(ana, { confirm: 'sim', password: 'senha-do-professor' }), 422, /EXCLUIR/);
      await rejects(del(ana, { confirm: 'EXCLUIR', password: 'errada' }), 422, /Senha incorreta/);
      // Única administradora com outra pessoa na escola: precisa passar a administração.
      await rejects(del(ana, { confirm: 'EXCLUIR', password: 'senha-do-professor' }), 409, /único administrador de "Escola A"/);
      await pool.query("UPDATE memberships SET role='admin' WHERE user_id=$1", [beto]);
      await pool.query('INSERT INTO educator_profiles VALUES($1,$2,$3)', [ana, '67 99999-0000', 'data:image/jpeg;base64,AAA']);
      await pool.query('INSERT INTO user_sessions(user_id,token_hash) VALUES($1,$2)', [ana, 'h1']);
      await pool.query('INSERT INTO push_devices(token,user_id) VALUES($1,$2)', ['ExponentPushToken[ana]', ana]);
      await pool.query('INSERT INTO password_reset_tokens VALUES($1,$2)', [ana, 'h2']);
      await pool.query('INSERT INTO email_verification_tokens VALUES($1,$2)', [ana, 'h3']);
      await pool.query('INSERT INTO class_memberships VALUES($1,$2,$3)', [randomUUID(), ana, 'owner']);
      assert.deepEqual(await del(ana, { confirm: ' excluir ', password: 'senha-do-professor' }), { deleted: true });
      const gone = (await pool.query('SELECT * FROM users WHERE id=$1', [ana])).rows[0];
      assert.equal(gone.email, null);
      assert.equal(gone.display_name, 'Conta excluída');
      assert.equal(gone.password_hash, null);
      assert.equal(gone.cpf_hash, null);
      assert.equal(gone.active, false);
      assert.ok(gone.deleted_at && gone.anonymized_at);
      for (const table of ['user_sessions', 'push_devices', 'password_reset_tokens', 'email_verification_tokens', 'class_memberships', 'memberships', 'educator_profiles'])
        assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE user_id=$1`, [ana])).rowCount, 0, table);
      assert.equal((await pool.query("SELECT 1 FROM memberships WHERE user_id=$1 AND role='admin'", [beto])).rowCount, 1);
      assert.equal((await pool.query("SELECT 1 FROM audit_log WHERE user_id=$1 AND action='account.self_deleted'", [ana])).rowCount, 1);
      // O e-mail e o CPF ficam livres para um cadastro novo; a conta não volta.
      await user('ana@example.com', { cpf: 'cpf-ana' });
      await rejects(del(ana, { confirm: 'EXCLUIR', password: 'senha-do-professor' }), 404, /não encontrada/);
      const admin = await user('admin@example.com', { portalAdmin: true });
      for (const action of ['restore', 'unblock'])
        await rejects(manageSubscriber({ userId: admin, portalAdmin: true, sessionId: randomUUID() }, { userId: ana, action }), 422, /não pode ser restaurada/);
      await rejects(del(admin, { confirm: 'EXCLUIR', password: 'senha-do-professor' }), 409, /Administradores do portal/);

      // Escola só da pessoa: sai, a não ser que tenha assinatura ativa.
      const escolaB = await school('Escola B');
      const caio = await user(null, { google: 'google-caio', name: 'Caio' }).catch(() => null);
      assert.equal(caio, null, 'professor sem e-mail continua proibido');
      const dani = await user('dani@example.com', { google: 'google-dani' });
      await member(escolaB, dani, 'admin');
      await pool.query("INSERT INTO billing_contracts VALUES($1,'active')", [escolaB]);
      await rejects(del(dani, { confirm: 'EXCLUIR' }), 409, /cancele a assinatura/);
      await pool.query("UPDATE billing_contracts SET status='cancelled'", []);
      // Conta só com Google não tem senha: basta confirmar.
      await del(dani, { confirm: 'EXCLUIR' });
      assert.equal((await pool.query('SELECT google_subject FROM users WHERE id=$1', [dani])).rows[0].google_subject, null);

      // Aluno sem e-mail: o cadastro fica com a escola, sem a ligação e sem a foto.
      const eva = await user(null, { student: true, name: 'Eva' });
      const evaRecord = (
        await pool.query("INSERT INTO students(institution_id,name,selfie_data_url) VALUES($1,'Eva','data:image/jpeg;base64,BBB') RETURNING id", [escolaA])
      ).rows[0].id;
      await pool.query('INSERT INTO student_account_links VALUES($1,$2,$3)', [escolaA, eva, evaRecord]);
      await del(eva, { confirm: 'EXCLUIR', password: 'senha-do-professor' });
      assert.equal((await pool.query('SELECT 1 FROM student_account_links WHERE user_id=$1', [eva])).rowCount, 0);
      assert.deepEqual(
        (await pool.query('SELECT name,selfie_data_url FROM students WHERE id=$1', [evaRecord])).rows[0],
        { name: 'Eva', selfie_data_url: '' },
      );
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
