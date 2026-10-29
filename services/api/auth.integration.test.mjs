import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('email, CPF and Google OAuth lifecycle in isolated database', { skip: !process.env.AUTH_TEST_DATABASE_URL }, async () => {
  const { default: pg } = await import('pg');
  const schema = `auth_test_${randomUUID().replaceAll('-','')}`;
  const control = new pg.Pool({ connectionString: process.env.AUTH_TEST_DATABASE_URL });
  await control.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.AUTH_TEST_DATABASE_URL);
  url.searchParams.set('options',`-c search_path=${schema}`);
  process.env.DATABASE_URL = url.href;
  process.env.CPF_HASH_SECRET = 'isolated-test-secret-never-use-in-production';
  process.env.DEV_AUTH_BYPASS = 'false';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8788/api/auth/google/callback';
  process.env.AUTH_FRONTEND_URL = 'http://localhost:3000';
  process.env.NODE_ENV = 'test';
  process.env.AUTH_DEV_RESET_TOKENS = 'true';
  const { pool } = await import('./db.mjs');
  const { register,login,authenticate,logout,loginWithGoogle,completeCpf,requestPasswordReset,resetPassword,verifyEmail,requestEmailVerification } = await import('./auth.mjs');
  const { cpfFingerprint } = await import('./cpf.mjs');
  const { startGoogle,startGoogleLink,finishGoogle } = await import('./google-auth.mjs');
  try {
    await pool.query(`CREATE TABLE institutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,slug text UNIQUE);
      CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,password_hash text,active boolean DEFAULT true,portal_admin boolean DEFAULT false,portal_editor boolean DEFAULT false,account_type text DEFAULT 'educator');
      CREATE TABLE portal_settings(id integer PRIMARY KEY,question_bank_id uuid REFERENCES institutions(id));
      CREATE TABLE memberships(institution_id uuid,user_id uuid,role text);
      CREATE TABLE user_sessions(id uuid DEFAULT gen_random_uuid(),user_id uuid,token_hash text,expires_at timestamptz,last_seen_at timestamptz,global_bank boolean DEFAULT false,last_ip inet,user_agent text);
      CREATE TABLE password_reset_tokens(user_id uuid,token_hash text,expires_at timestamptz,used_at timestamptz);
      CREATE TABLE institution_subscriptions(institution_id uuid,plan_id text,status text DEFAULT 'trialing',period_started_at timestamptz,period_ends_at timestamptz);
      CREATE TABLE audit_log(institution_id uuid,user_id uuid,action text,entity_type text,entity_id text);`);
    for (const path of ['../../database/042_google_auth.sql','../../database/043_unique_cpf.sql','../../database/044_educator_schools.sql','../../database/067_auth_email_verification.sql','../../database/100_google_account_linking.sql']) await pool.query(await readFile(new URL(path,import.meta.url),'utf8'));
    await pool.query("ALTER TABLE oauth_login_attempts ADD COLUMN account_type text DEFAULT 'educator'");
    await pool.query('ALTER TABLE educator_profiles ADD COLUMN selfie_data_url text');
    const account = { institutionName:'Test Space',displayName:'Test Teacher',email:'teacher@example.com',password:'TestPassword123!',cpf:'12345678909' };
    const registration = await register(account);
    assert.equal(registration.verificationRequired,true);
    assert.equal(registration.token,undefined);
    await assert.rejects(login(account), /Confirme/);
    assert.equal((await pool.query('SELECT count(*)::int n FROM user_sessions')).rows[0].n,0);
    assert.equal((await pool.query('SELECT token_hash FROM email_verification_tokens')).rows[0].token_hash.includes(registration.developmentToken),false);
    assert.deepEqual(await requestEmailVerification({email:'absent@example.com'}),{accepted:true});
    assert.deepEqual(await requestEmailVerification({email:account.email}),{accepted:true});
    await pool.query("UPDATE email_verification_tokens SET expires_at=now()-interval '1 second'");
    await assert.rejects(verifyEmail({token:registration.developmentToken}), /expirado/);
    await pool.query("UPDATE email_verification_tokens SET expires_at=now()+interval '24 hours'");
    await verifyEmail({token:registration.developmentToken});
    await assert.rejects(verifyEmail({token:registration.developmentToken}), /inválido/);
    const created = await login(account);
    // Legacy accounts are allowed without claiming their address was verified.
    await pool.query('UPDATE users SET email_verification_required=false,email_verified_at=NULL WHERE email=$1',[account.email]);
    assert.ok((await login(account)).token);
    await pool.query('UPDATE users SET email_verification_required=true,email_verified_at=now() WHERE email=$1',[account.email]);
    const identity = await authenticate({ headers: { cookie:`caderno_session=${created.token}` } });
    assert.equal(identity.cpfComplete,true);
    assert.equal(identity.profileComplete,false);
    const { saveEducatorProfile,getEducatorProfile,schoolHeader }=await import('./educator-profile.mjs');
    const school={name:'Escola Teste',schoolType:'estadual',address:'Rua de teste, 1',city:'Campo Grande',state:'MS'};
    const professional={professionalRole:'teacher',subjects:['Química'],grades:['1ª série'],school};
    const saved=await saveEducatorProfile(identity.userId,professional);
    assert.equal((await getEducatorProfile(identity.userId)).schools.length,1);
    assert.equal((await authenticate({headers:{cookie:`caderno_session=${created.token}`}})).profileComplete,true);
    const frozen=await schoolHeader(pool,identity.userId,saved.id);
    assert.equal(frozen.institutionName,'Escola Teste — Campo Grande/MS');
    await assert.rejects(schoolHeader(pool,randomUUID(),saved.id),/seu cadastro/);
    await assert.rejects(saveEducatorProfile(identity.userId,{...professional,school:{...school,id:randomUUID()}}),/não encontrada/);
    await saveEducatorProfile(identity.userId,{...professional,professionalRole:'coordinator',stages:['Ensino Médio'],school:{...school,id:saved.id,name:'Escola Atualizada'}});
    assert.equal((await getEducatorProfile(identity.userId)).schools.length,1);
    assert.equal(frozen.institutionName,'Escola Teste — Campo Grande/MS');
    assert.equal((await pool.query('SELECT count(*)::int n FROM memberships WHERE user_id=$1',[identity.userId])).rows[0].n,1);
    for (let n=2;n<=5;n++) await saveEducatorProfile(identity.userId,{...professional,school:{...school,name:`Escola ${n}`}});
    const additions=await Promise.allSettled([6,7].map(n=>saveEducatorProfile(identity.userId,{...professional,school:{...school,name:`Escola ${n}`}})));
    assert.equal(additions.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(additions.filter(r=>r.status==='rejected').length,1);
    assert.equal((await getEducatorProfile(identity.userId)).schools.length,6);
    await assert.rejects(saveEducatorProfile(identity.userId,professional),/Limite de 6 escolas/);
    await saveEducatorProfile(identity.userId,{...professional,school:{...school,id:saved.id,name:'Editada no limite'}});
    assert.equal((await getEducatorProfile(identity.userId)).schools.length,6);
    await assert.rejects(register({ ...account,email:'other@example.com' }), { code:'23505' });
    assert.equal((await pool.query('SELECT count(*)::int n FROM institutions')).rows[0].n,1);
    await assert.rejects(login({email:account.email,password:'wrong'}),/inválidos/);
    const signed = await login(account);
    assert.ok(signed.token);
    await logout(identity.sessionId);
    assert.equal(await authenticate({headers:{cookie:`caderno_session=${created.token}`}}),null);
    await assert.rejects(loginWithGoogle({sub:'blocked',email:account.email,name:'Test'},cpfFingerprint('52998224725')),/existente/);
    await assert.rejects(loginWithGoogle({sub:'new-user',email:'new@example.com',name:'New'}),/Complete/);
    const started = await startGoogle({cpf:'52998224725'});
    const authorization = new URL(started.url);
    assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
    const callback = new URL(process.env.GOOGLE_REDIRECT_URI);
    callback.search = new URLSearchParams({state:authorization.searchParams.get('state'),code:'test-code'}).toString();
    let calls=0;
    const fetcher=async (target,options) => {
      calls++;
      if(target.endsWith('/token')) {
        assert.ok(options.body.get('code_verifier'));
        return {ok:true,json:async()=>({access_token:'test-access',token_type:'Bearer'})};
      }
      return {ok:true,json:async()=>({sub:'google-test',email:'google@example.com',name:'Google Test',email_verified:true})};
    };
    await assert.rejects(finishGoogle(new URL(process.env.GOOGLE_REDIRECT_URI),'',fetcher),/expirada/);
    assert.equal(calls,0);
    // The browser cookie can be unavailable when the portal and API are
    // cross-site; the one-use OAuth state and PKCE still bind the callback.
    const google = await finishGoogle(callback,'',fetcher);
    assert.ok(google.token);
    await assert.rejects(finishGoogle(callback,`caderno_oauth=${started.browser}`,fetcher),/expirada/);
    await loginWithGoogle({sub:'google-test',email:'google@example.com',name:'Google Test'});
    assert.equal((await pool.query('SELECT count(*)::int n FROM institutions')).rows[0].n,2);
    const linkUser = (await pool.query("INSERT INTO users(email,display_name,active,account_type,email_verified_at) VALUES('linked@example.com','Linked User',true,'educator',now()) RETURNING id")).rows[0];
    const linkStarted = await startGoogleLink(linkUser.id);
    const linkCallback = new URL(process.env.GOOGLE_REDIRECT_URI);
    linkCallback.search = new URLSearchParams({state:new URL(linkStarted.url).searchParams.get('state'),code:'link-test-code'}).toString();
    const linkFetcher = async (target) => target.endsWith('/token')
      ? {ok:true,json:async()=>({access_token:'link-test-access',token_type:'Bearer'})}
      : {ok:true,json:async()=>({sub:'linked-google-sub',email:'linked@example.com',name:'Linked User',email_verified:true})};
    assert.deepEqual(await finishGoogle(linkCallback,'',linkFetcher),{linked:true});
    assert.equal((await pool.query('SELECT google_subject FROM users WHERE id=$1',[linkUser.id])).rows[0].google_subject,'linked-google-sub');
    await assert.rejects(completeCpf(identity,{cpf:'52998224725'}),/já cadastrado/);
    await pool.query('UPDATE users SET active=false WHERE google_subject=$1',['google-test']);
    await assert.rejects(loginWithGoogle({sub:'google-test',email:'google@example.com',name:'Google Test'}),/indisponível/);
    await pool.query(`CREATE TABLE subscription_plans(id text PRIMARY KEY,name text,monthly_assessments int,max_students int,storage_mb int,concurrent_renders int);
      ALTER TABLE institution_subscriptions ADD UNIQUE(institution_id);
      ALTER TABLE audit_log ADD COLUMN metadata jsonb;`);
    await pool.query(await readFile(new URL('../../database/045_portal_admin.sql',import.meta.url),'utf8'));
    const { switchBank }=await import('./portal-admin.mjs');
    const request={headers:{cookie:`caderno_session=${signed.token}`}};
    const ordinary=await authenticate(request);
    assert.equal(ordinary.portalAdmin,false);
    await assert.rejects(switchBank(ordinary,{globalBank:true}),/exclusivo/);
    await pool.query('UPDATE users SET portal_admin=true WHERE id=$1',[identity.userId]);
    const adminLogin = await login({email:account.email,password:account.password});
    assert.equal((await authenticate({headers:{cookie:`caderno_session=${adminLogin.token}`}})).portalRole,'admin');
    const admin=await authenticate(request);
    const {setPortalEditor}=await import('./portal-access.mjs');
    await assert.rejects(setPortalEditor(ordinary,{email:'google@example.com',editor:true}),/exclusivo/);
    await pool.query("UPDATE users SET active=true WHERE email='google@example.com'");
    await setPortalEditor(admin,{email:'google@example.com',editor:true});
    assert.equal((await pool.query("SELECT portal_editor FROM users WHERE email='google@example.com'")).rows[0].portal_editor,true);
    await setPortalEditor(admin,{email:'google@example.com',editor:false});
    assert.equal((await pool.query("SELECT portal_editor FROM users WHERE email='google@example.com'")).rows[0].portal_editor,false);
    await switchBank(admin,{globalBank:true});
    const global=await authenticate(request);
    assert.equal(global.globalBank,false);
    assert.equal(global.institutionId,ordinary.institutionId);
    assert.ok(global.questionBankId);
    assert.equal(global.role,'admin');
    await switchBank(global,{globalBank:false});
    assert.equal((await authenticate(request)).institutionId,ordinary.institutionId);
    await switchBank(admin,{globalBank:true});
    await pool.query('UPDATE users SET portal_admin=false WHERE id=$1',[identity.userId]);
    assert.equal((await authenticate(request)).globalBank,false);
    await pool.query('UPDATE users SET portal_editor=true WHERE id=$1',[identity.userId]);
    assert.equal((await authenticate(request)).portalRole,'editor');
    assert.equal((await authenticate(request)).institutionId,ordinary.institutionId);
    await pool.query('UPDATE users SET portal_editor=false WHERE id=$1',[identity.userId]);
    assert.equal((await authenticate(request)).portalRole,'teacher');
    process.env.AUTH_DEV_RESET_TOKENS='true';
    assert.deepEqual(await requestPasswordReset({email:'absent@example.com'}),{accepted:true});
    const recovery = await requestPasswordReset({email:account.email});
    assert.deepEqual(await requestPasswordReset({email:account.email}),{accepted:true});
    await pool.query("UPDATE password_reset_tokens SET expires_at=now()-interval '1 second'");
    await assert.rejects(resetPassword({token:recovery.developmentToken,password:'NewTestPassword123!'}),/expirado/);
    await pool.query("UPDATE password_reset_tokens SET expires_at=now()+interval '30 minutes'");
    await resetPassword({token:recovery.developmentToken,password:'NewTestPassword123!'});
    assert.equal(await authenticate(request),null);
    await assert.rejects(resetPassword({token:recovery.developmentToken,password:'AnotherPassword123!'}),/inválido/);
    await assert.rejects(login({email:account.email,password:account.password}));
    assert.ok((await login({email:account.email,password:'NewTestPassword123!'})).token);
    // Native signup saves account, professional profile and school atomically.
    const testCpf = base => {
      let digits=base;
      for(let size=9;size<11;size++) {
        const sum=[...digits].reduce((total,n,index)=>total+Number(n)*(size+1-index),0);
        const remainder=sum%11;digits+=remainder<2?'0':String(11-remainder);
      }
      return digits;
    };
    for(const [index,professionalRole] of ['teacher','coordinator'].entries()) {
      const input={...account,email:`native-${professionalRole}@example.test`,cpf:testCpf(`84231697${index}`),educatorProfile:{professionalRole,subjects:professionalRole==='teacher'?['Matemática']:[],grades:professionalRole==='teacher'?['6º ano']:[],stages:professionalRole==='coordinator'?['Ensino Médio']:[],school}};
      const registration=await register(input);
      assert.equal(registration.verificationRequired,true);assert.equal(registration.token,undefined);
      await assert.rejects(login(input),/Confirme/);
      await verifyEmail({token:registration.developmentToken});
      const session=await login(input);const native=await authenticate({headers:{authorization:`Bearer ${session.token}`}});
      assert.equal(native.profileComplete,true);assert.equal(native.cpfComplete,true);assert.equal(native.portalAdmin,false);assert.equal(native.portalEditor,false);
      const profile=await getEducatorProfile(native.userId);assert.equal(profile.profile.professionalRole,professionalRole);assert.equal(profile.schools.length,1);assert.equal(profile.schools[0].name,school.name);
      assert.equal((await pool.query('SELECT count(*)::int n FROM memberships WHERE user_id=$1',[native.userId])).rows[0].n,1);
    }
    const failedEmail='invalid-native-school@example.test';
    const beforeFailed=(await pool.query('SELECT count(*)::int n FROM institutions')).rows[0].n;
    await assert.rejects(register({...account,email:failedEmail,cpf:testCpf('842316979'),educatorProfile:{...professional,school:{...school,id:randomUUID()}}}),/não encontrada/);
    assert.equal((await pool.query('SELECT count(*)::int n FROM institutions')).rows[0].n,beforeFailed);
    assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE email=$1',[failedEmail])).rows[0].n,0);
    // Delivery failures roll back both the account and its proof token.
    const originalFetch = globalThis.fetch;
    process.env.AUTH_DEV_RESET_TOKENS='false';
    process.env.RESEND_API_KEY='test-provider-key';
    process.env.AUTH_EMAIL_FROM='sender@example.com';
    globalThis.fetch=async()=>({ok:false});
    try {
      const before=(await pool.query('SELECT count(*)::int n FROM institutions')).rows[0].n;
      const schoolCount=(await pool.query('SELECT count(*)::int n FROM educator_schools')).rows[0].n;
      await assert.rejects(register({...account,email:'delivery-failure@example.com',cpf:'11144477735',educatorProfile:professional}), /enviar/);
      assert.equal((await pool.query('SELECT count(*)::int n FROM institutions')).rows[0].n,before);
      assert.equal((await pool.query('SELECT count(*)::int n FROM educator_schools')).rows[0].n,schoolCount);
      assert.equal((await pool.query("SELECT count(*)::int n FROM users WHERE email='delivery-failure@example.com'")).rows[0].n,0);
      await pool.query("UPDATE password_reset_tokens SET created_at=now()-interval '2 minutes'");
      const tokenCount=(await pool.query('SELECT count(*)::int n FROM password_reset_tokens')).rows[0].n;
      await assert.rejects(requestPasswordReset({email:account.email}), /enviar/);
      assert.equal((await pool.query('SELECT count(*)::int n FROM password_reset_tokens')).rows[0].n,tokenCount);
    } finally { globalThis.fetch=originalFetch; }

  } finally {
    await pool.end();
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end();
  }
});
