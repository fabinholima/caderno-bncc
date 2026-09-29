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
  const state = random(), browser = random(), verifier = random();
  await pool.query('DELETE FROM oauth_login_attempts WHERE expires_at<now()');
  const cpfHash = input.cpf ? cpfFingerprint(input.cpf) : null;
  await pool.query('INSERT INTO oauth_login_attempts(state_hash,browser_hash,verifier,cpf_hash) VALUES($1,$2,$3,$4)', [hash(state),hash(browser),verifier,cpfHash]);
  const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'openid email profile', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return { url: target.href, browser };
}

export async function finishGoogle(url, cookie, fetcher = fetch) {
  if (!googleConfigured()) throw failure('Login Google ainda não configurado.', 503);
  const state = url.searchParams.get('state');
  const browser = /(?:^|;\s*)caderno_oauth=([A-Za-z0-9_-]+)/.exec(cookie || '')?.[1];
  if (!state || state.length > 200 || !browser) throw failure('Tentativa de login inválida ou expirada.');
  const attempt = await pool.query(`DELETE FROM oauth_login_attempts WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING verifier,cpf_hash`, [hash(state),hash(browser)]);
  if (!attempt.rowCount) throw failure('Tentativa de login inválida ou expirada.');
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
  return loginWithGoogle(validateGoogleProfile(await response.json()), attempt.rows[0].cpf_hash);
}
