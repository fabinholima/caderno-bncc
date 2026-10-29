import { createHash, randomBytes } from 'node:crypto';
import { pool } from './db.mjs';
import { loginWithGoogle } from './auth.mjs';
import { cpfFingerprint } from './cpf.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const failure = (message, statusCode = 401) => Object.assign(new Error(message), { statusCode });

export function googleConfigured(env = process.env) {
  try {
    const callback = new URL(env.GOOGLE_REDIRECT_URI);
    const frontend = new URL(env.AUTH_FRONTEND_URL);
    const safe = (url) => !url.username && !url.password &&
      (url.protocol === 'https:' || (env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost'));
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && safe(callback) && safe(frontend));
  } catch { return false; }
}

export function validateGoogleProfile(profile) {
  if (!profile || typeof profile.sub !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(profile.sub) ||
      profile.email_verified !== true || typeof profile.email !== 'string' || profile.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw failure('Conta Google sem e-mail verificado.');
  return { sub: profile.sub, email: profile.email.toLowerCase(), name: typeof profile.name === 'string' ? profile.name.slice(0,160) : 'Professor' };
}

export async function startGoogle(input = {}) {
  if (!googleConfigured()) throw failure('Login Google ainda não configurado.', 503);
  const accountType = input.accountType === 'student' ? 'student' : 'educator';
  const state = random(), browser = random(), verifier = random();
  await pool.query('DELETE FROM oauth_login_attempts WHERE expires_at<now()');
  const cpfHash = input.cpf ? cpfFingerprint(input.cpf) : null;
  await pool.query('INSERT INTO oauth_login_attempts(state_hash,browser_hash,verifier,cpf_hash,account_type) VALUES($1,$2,$3,$4,$5)', [hash(state),hash(browser),verifier,cpfHash,accountType]);
  return { url: authorizationUrl(state, verifier), browser };
}

function authorizationUrl(state, verifier) {
  const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'openid email profile', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return target.href;
}

export async function startGoogleLink(userId) {
  if (!googleConfigured()) throw failure('Login Google ainda não configurado.', 503);
  if (typeof userId !== 'string' || !userId) throw failure('Entre na sua conta antes de vincular o Google.', 401);
  const state = random(), browser = random(), verifier = random();
  await pool.query('DELETE FROM oauth_login_attempts WHERE expires_at<now()');
  await pool.query(
    `INSERT INTO oauth_login_attempts(state_hash,browser_hash,verifier,account_type,purpose,user_id)
     VALUES($1,$2,$3,'educator','link',$4)`,
    [hash(state),hash(browser),verifier,userId],
  );
  return { url: authorizationUrl(state, verifier), browser };
}

export async function finishGoogle(url, cookie, fetcher = fetch) {
  if (!googleConfigured()) throw failure('Login Google ainda não configurado.', 503);
  const state = url.searchParams.get('state');
  // OAuth state is a 256-bit, one-use value stored only as a hash. Binding the
  // web callback to a cookie breaks the flow when the portal and API are on
  // different sites: browsers reject the cross-site Lax cookie set by fetch.
  // The native flow still binds its callback to the browser cookie in
  // mobile-google-auth-core before calling this function.
  if (!state || state.length > 200) throw failure('Tentativa de login inválida ou expirada.');
  const attempt = await pool.query(`DELETE FROM oauth_login_attempts WHERE state_hash=$1 AND expires_at>now() RETURNING verifier,cpf_hash,account_type,purpose,user_id`, [hash(state)]);
  if (!attempt.rowCount) throw failure('Tentativa de login inválida ou expirada.');
  const purpose = attempt.rows[0].purpose;
  try {
  const code = url.searchParams.get('code');
  if (url.searchParams.has('error') || !code || code.length > 4096) throw failure('Autorização Google não concluída.');
  // The authorization code is exchanged server-to-server with PKCE. Identity is
  // read exclusively from Google's UserInfo endpoint using that access token;
  // no unverified JWT claims or browser-supplied profile are accepted.
  const tokens = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code, code_verifier: attempt.rows[0].verifier, redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokens.ok) throw failure('Não foi possível confirmar o login Google.');
  const token = await tokens.json();
  if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer') throw failure('Resposta Google inválida.');
  const response = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw failure('Não foi possível consultar sua conta Google.');
  const profile = validateGoogleProfile(await response.json());
  if (purpose === 'link') return await linkGoogleAccount(profile, attempt.rows[0].user_id);
  return loginWithGoogle(profile, attempt.rows[0].cpf_hash,attempt.rows[0].account_type);
  } catch (error) {
    if (purpose === 'link') error.googleLink = true;
    throw error;
  }
}

async function linkGoogleAccount(profile, userId) {
  return pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`google:${profile.sub}`]);
      const result = await client.query('SELECT id,email,google_subject,active FROM users WHERE id=$1 FOR UPDATE', [userId]);
      const user = result.rows[0];
      if (!user || !user.active) throw failure('A conta que iniciou a vinculação não está disponível.', 403);
      if (user.email.toLowerCase() !== profile.email) throw failure('A conta Google precisa usar o mesmo e-mail da conta do portal.', 409);
      const owner = await client.query('SELECT id FROM users WHERE google_subject=$1 AND id<>$2', [profile.sub,userId]);
      if (owner.rowCount) throw failure('Esta conta Google já está vinculada a outro usuário.', 409);
      if (user.google_subject && user.google_subject !== profile.sub) throw failure('Esta conta do portal já está vinculada a outra conta Google.', 409);
      if (!user.google_subject) {
        await client.query('UPDATE users SET google_subject=$2 WHERE id=$1', [userId,profile.sub]);
        const membership = await client.query('SELECT institution_id FROM memberships WHERE user_id=$1 ORDER BY role=\'admin\' DESC LIMIT 1', [userId]);
        await client.query("INSERT INTO audit_log(institution_id,user_id,action) VALUES($1,$2,'auth.google.link')", [membership.rows[0]?.institution_id || null,userId]);
      }
      await client.query('COMMIT');
      return { linked: true };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw failure('Esta conta Google já está vinculada a outro usuário.', 409);
      throw error;
    } finally {
      client.release();
    }
  });
}
