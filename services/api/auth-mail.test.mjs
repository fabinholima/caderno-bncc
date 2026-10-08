import test from 'node:test';
import assert from 'node:assert/strict';
import { authMailLink, developmentMail, mailConfigured, sendAuthMail } from './auth-mail.mjs';

const env = { NODE_ENV: 'production', AUTH_FRONTEND_URL: 'https://app.example.com', RESEND_API_KEY: 'private-test-key', AUTH_EMAIL_FROM: 'UfaProva <conta@example.com>' };
test('mail requires server credentials and trusted HTTPS frontend', () => {
  assert.equal(mailConfigured(env),true);
  for (const change of [{RESEND_API_KEY:''},{AUTH_EMAIL_FROM:''},{AUTH_FRONTEND_URL:'http://app.example.com'},{AUTH_FRONTEND_URL:'https://user:pass@app.example.com'},{AUTH_EMAIL_FROM:'sender\r\nInjected'}]) assert.equal(mailConfigured({...env,...change}),false);
  assert.equal(developmentMail({...env,AUTH_DEV_RESET_TOKENS:'true'}),false);
});
test('tokens stay in fragment; reset and verification links are distinct', () => {
  for (const kind of ['verify','reset']) {
    const url = new URL(authMailLink(kind,'private-token',env));
    assert.equal(url.pathname,'/portal');
    assert.equal(url.search,'');
    assert.equal(new URLSearchParams(url.hash.slice(1)).get(`${kind}_token`),'private-token');
  }
  assert.throws(()=>authMailLink('unknown','token',env));
});
test('provider receives private server auth and correct message', async () => {
  let calls=0;
  await sendAuthMail('verify','recipient@example.com','private-token',{env,fetcher:async (url,options)=>{
    calls++;
    assert.equal(url,'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization,'Bearer private-test-key');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.to,['recipient@example.com']);
    assert.match(body.text,/#verify_token=private-token/);
    assert.match(body.text,/24 horas/);
    assert.ok(options.signal);
    return {ok:true,json:async()=>({id:'email-id'})};
  }});
  assert.equal(calls,1);
});
test('delivery errors are generic and local demo never sends', async () => {
  for (const fetcher of [async()=>({ok:false}),async()=>{throw new Error('private-token private-test-key');},async()=>({ok:true,json:async()=>({})})]) {
    await assert.rejects(sendAuthMail('reset','recipient@example.com','private-token',{env,fetcher}),error=>error.statusCode===503 && !/private|recipient/.test(error.message));
  }
  await sendAuthMail('reset','recipient@example.com','token',{env:{NODE_ENV:'test',AUTH_DEV_RESET_TOKENS:'true'},fetcher:async()=>assert.fail('No external delivery in local demo')});
});
