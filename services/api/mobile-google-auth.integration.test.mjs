import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createMobileGoogleAuth } from './mobile-google-auth-core.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('PostgreSQL migration and device-bound Google session lifecycle', {skip: !process.env.MOBILE_GOOGLE_TEST_DATABASE_URL}, async () => {
 const {Pool} = await import('pg');
 const admin = new Pool({connectionString: process.env.MOBILE_GOOGLE_TEST_DATABASE_URL});
 const schema = `oauth_test_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool = new Pool({connectionString:process.env.MOBILE_GOOGLE_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 const previous = process.env.GOOGLE_REDIRECT_URI;
 process.env.GOOGLE_REDIRECT_URI='https://api.example/api/auth/google/callback';
 try {
  const migration = await readFile(new URL('../../database/069_mobile_google_login.sql',import.meta.url),'utf8');
  await pool.query(migration); await pool.query(migration);
  await pool.query("ALTER TABLE mobile_google_login_attempts ADD COLUMN account_type text DEFAULT 'educator'");
  await pool.query('CREATE TABLE oauth_login_attempts(state_hash text,browser_hash text,expires_at timestamptz); CREATE TABLE user_sessions(id uuid PRIMARY KEY,token_hash text UNIQUE)');
  const state=randomUUID(), browser=randomUUID(), proof='ab'.repeat(32), issued='server-only-session';
  const auth=createMobileGoogleAuth({pool,googleConfigured:()=>true,
   transaction:async fn=>{const client=await pool.connect(); try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
   startGoogle:async()=>{await pool.query("INSERT INTO oauth_login_attempts VALUES($1,$2,now()+interval '10 minutes')",[hash(state),hash(browser)]);return{url:`https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,browser};},
   finishGoogle:async()=>{await pool.query('INSERT INTO user_sessions VALUES($1,$2)',[randomUUID(),hash(issued)]);return{token:issued};}
  });
  const attempt=await auth.start({tokenHash:hash(proof)});
  assert.deepEqual(await auth.status({id:attempt.id,token:proof}),{status:'pending'});
  await assert.rejects(auth.status({id:attempt.id,token:'00'.repeat(32)}));
  const ticket=new URL(attempt.url).searchParams.get('ticket');
  await auth.browser(ticket); await assert.rejects(auth.browser(ticket));
  const callback=new URL(`https://api.example/api/auth/google/callback?state=${state}&code=test`);
  await assert.rejects(auth.callback(callback,'caderno_oauth=wrong'));
  assert.deepEqual(await auth.status({id:attempt.id,token:proof}),{status:'pending'});
  assert.deepEqual(await auth.callback(callback,`caderno_oauth=${browser}`),{status:'completed'});
  assert.deepEqual(await auth.status({id:attempt.id,token:proof}),{status:'completed'});
  assert.deepEqual((await pool.query('SELECT token_hash FROM user_sessions')).rows,[{token_hash:hash(proof)}]);
  assert.equal(await auth.callback(callback,`caderno_oauth=${browser}`),null);
  await pool.query("UPDATE mobile_google_login_attempts SET expires_at=now()-interval '1 second'");
  await assert.rejects(auth.status({id:attempt.id,token:proof}));
 }finally{
  if(previous===undefined)delete process.env.GOOGLE_REDIRECT_URI;else process.env.GOOGLE_REDIRECT_URI=previous;
  await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
