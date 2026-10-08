import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMobileGoogleAuth } from './mobile-google-auth-core.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const id = '12345678-1234-4234-8234-123456789abc';
const proof = 'ab'.repeat(32);
const state = 'oauth-state';
const browser = 'browser-cookie';
const callback = new URL(`https://api.example/api/auth/google/callback?state=${state}&code=code`);
const cookie = `caderno_oauth=${browser}`;
function setup({ queries = [], txQueries = [], finish = async () => ({ token: 'server-session' }) } = {}) {
  const seen = [], txSeen = []; let googleCalls = 0;
  const pool = { query: async (sql, args) => { seen.push({ sql, args }); return queries.shift() || { rowCount: 0, rows: [] }; } };
  const client = { query: async (sql, args) => { txSeen.push({ sql, args }); return txQueries.shift() || { rowCount: 0, rows: [] }; } };
  const auth = createMobileGoogleAuth({ pool, transaction: fn => fn(client), googleConfigured: () => true,
    startGoogle: async () => { googleCalls++; return { url: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`, browser }; },
    finishGoogle: async (...args) => { googleCalls++; return finish(...args); } });
  return { auth, seen, txSeen, get googleCalls() { return googleCalls; } };
}
test('start validates the device challenge and exposes only a separate browser ticket', async () => {
  const previous = process.env.GOOGLE_REDIRECT_URI; process.env.GOOGLE_REDIRECT_URI = 'https://api.example/api/auth/google/callback';
  try {
    const h = setup({ queries: [{}, { rows: [{ expires_at: new Date(Date.now()+600000) }] }] });
    await assert.rejects(h.auth.start({ tokenHash: proof.slice(1) }), /inválida/);
    const result = await h.auth.start({ tokenHash: hash(proof) });
    const url = new URL(result.url); const ticket = url.searchParams.get('ticket');
    assert.equal(url.origin, 'https://api.example'); assert.equal(url.pathname, '/api/auth/google/mobile/browser');
    assert.equal(h.seen[1].args[1], hash(ticket)); assert.equal(h.seen[1].args[2], hash(proof));
    assert(!JSON.stringify(result).includes(proof)); assert(!JSON.stringify(result).includes(hash(proof)));
  } finally { if (previous === undefined) delete process.env.GOOGLE_REDIRECT_URI; else process.env.GOOGLE_REDIRECT_URI = previous; }
});
test('browser ticket can only start a pending, unused and unexpired attempt', async () => {
  const ticket = 'a'.repeat(43); const h = setup({ txQueries: [{ rowCount: 1, rows: [{ id }] }, {}] });
  const result = await h.auth.browser(ticket); assert.equal(result.browser, browser); assert.equal(h.txSeen[0].args[0], hash(ticket));
  assert.equal(h.txSeen[1].args[1], hash(state));
  const invalid = setup(); await assert.rejects(invalid.auth.browser(ticket), /expirada/); assert.equal(invalid.googleCalls, 0);
});
test('ordinary web callbacks are left unchanged', async () => {
  const h = setup(); assert.equal(await h.auth.callback(callback, cookie), null); assert.equal(h.googleCalls, 0);
});
test('wrong browser cookies cannot confirm or fail an attempt', async () => {
  const h = setup({ queries: [{ rowCount: 1, rows: [{ id }] }, { rowCount: 0 }] });
  await assert.rejects(h.auth.callback(callback, 'caderno_oauth=wrong'), /expirada/);
  assert.equal(h.googleCalls, 0); assert.equal(h.txSeen.length, 0); assert.equal(h.seen.length, 2);
});
test('completion stores only the device token hash and confirms status transactionally', async () => {
  const h = setup({ queries: [{ rowCount: 1, rows: [{ id }] }, { rowCount: 1 }], txQueries: [{ rowCount: 1, rows: [{ token_hash: hash(proof) }] }, { rowCount: 1 }, {}] });
  assert.deepEqual(await h.auth.callback(callback, cookie), { status: 'completed' });
  assert.deepEqual(h.txSeen[1].args, [hash('server-session'), hash(proof)]);
  assert.match(h.txSeen[2].sql, /status='completed'/); assert(!JSON.stringify([...h.seen,...h.txSeen]).includes(proof));
});
test('expired attempts never invoke Google or issue a new session', async () => {
  const h = setup({ queries: [{ rowCount: 1, rows: [{ id }] }, { rowCount: 1 }], txQueries: [{ rowCount: 0 }] });
  assert.equal((await h.auth.callback(callback, cookie)).status, 'failed'); assert.equal(h.googleCalls, 0);
});
test('Google account registration errors return instructions without issuing a session', async () => {
  const h = setup({ queries: [{ rowCount: 1, rows: [{ id }] }, { rowCount: 1 }, {}], txQueries: [{ rowCount: 1, rows: [{ token_hash: hash(proof) }] }], finish: async () => { throw Object.assign(new Error('registration required'), { statusCode: 428 }); } });
  assert.match((await h.auth.callback(callback, cookie)).message, /cadastro/); assert.equal(h.txSeen.length, 1);
});
test('only possession of the private device proof reveals completed status', async () => {
  const h = setup({ queries: [{ rowCount: 1, rows: [{ status: 'completed', message: null }] }] });
  assert.deepEqual(await h.auth.status({ id, token: proof }), { status: 'completed' }); assert.equal(h.seen[0].args[1], hash(proof));
  await assert.rejects(h.auth.status({ id, token: '00'.repeat(32) }), /expirada/);
  await assert.rejects(h.auth.status({ id: 'bad', token: proof }), /expirada/);
});
