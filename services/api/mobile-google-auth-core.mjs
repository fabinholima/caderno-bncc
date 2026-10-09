import { createHash, randomBytes, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const failure = (message, statusCode = 401) => Object.assign(new Error(message), { statusCode });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const expired = () => failure('Tentativa de entrada com Google inválida ou expirada.');

export function createMobileGoogleAuth(deps) {
  const { pool, transaction, startGoogle, finishGoogle, googleConfigured } = deps;
  return {
    async start(input) {
      if (!googleConfigured()) throw failure('Login Google ainda não configurado.', 503);
      if (typeof input?.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(input.tokenHash))
        throw failure('Tentativa de entrada com Google inválida.', 400);
      const ticket = randomBytes(32).toString('base64url'), id = randomUUID();
      await pool.query('DELETE FROM mobile_google_login_attempts WHERE expires_at <= now()');
      const result = await pool.query(
        'INSERT INTO mobile_google_login_attempts(id,ticket_hash,token_hash,account_type) VALUES($1,$2,$3,$4) RETURNING expires_at',
        [id, hash(ticket), input.tokenHash, input.accountType === 'student' ? 'student' : 'educator'],
      );
      // Build only from the configured OAuth callback, never a client redirect URL.
      const target = new URL('/api/auth/google/mobile/browser', process.env.GOOGLE_REDIRECT_URI);
      target.searchParams.set('ticket', ticket);
      return { id, url: target.href, expiresAt: new Date(result.rows[0].expires_at).toISOString() };
    },
    async browser(ticket) {
      if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw expired();
      return transaction(async client => {
        const attempt = await client.query(
          `SELECT id,account_type FROM mobile_google_login_attempts WHERE ticket_hash=$1 AND status='pending'
           AND state_hash IS NULL AND expires_at>now() FOR UPDATE`, [hash(ticket)],
        );
        if (!attempt.rowCount) throw expired();
        const result = await startGoogle({accountType:attempt.rows[0].account_type});
        const state = new URL(result.url).searchParams.get('state');
        if (!state) throw failure('Não foi possível iniciar a entrada com Google.', 503);
        await client.query('UPDATE mobile_google_login_attempts SET state_hash=$2 WHERE id=$1', [attempt.rows[0].id, hash(state)]);
        return result;
      });
    },
    async callback(url, cookie) {
      const state = url.searchParams.get('state');
      if (!state || state.length>200) return null;
      const found = await pool.query(
        `SELECT id FROM mobile_google_login_attempts WHERE state_hash=$1 AND status='pending'`, [hash(state)],
      );
      if (!found.rowCount) return null;
      const id = found.rows[0].id;
      // Validate the browser binding before attempting (or marking failed) a mobile login.
      const browser = /(?:^|;\s*)caderno_oauth=([A-Za-z0-9_-]+)/.exec(cookie || '')?.[1];
      if (!browser) throw expired();
      const bound = await pool.query(
        `SELECT 1 FROM oauth_login_attempts WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now()`,
        [hash(state), hash(browser)],
      );
      if (!bound.rowCount) throw expired();
      try {
        return await transaction(async client => {
          const attempt = await client.query(
            `SELECT token_hash FROM mobile_google_login_attempts WHERE id=$1 AND status='pending'
             AND expires_at>now() FOR UPDATE`, [id],
          );
          if (!attempt.rowCount) throw expired();
          const result = await finishGoogle(url, cookie);
          // Google auth creates a normal session; replace its hash with the proof generated
          // on the device. No raw app token is stored in the DB or placed in a browser URL.
          const session = await client.query('UPDATE user_sessions SET token_hash=$2 WHERE token_hash=$1 RETURNING id',
            [hash(result.token), attempt.rows[0].token_hash]);
          if (!session.rowCount) throw failure('Não foi possível confirmar a sessão Google.', 503);
          await client.query("UPDATE mobile_google_login_attempts SET status='completed' WHERE id=$1", [id]);
          return { status: 'completed' };
        });
      } catch (error) {
        const message = error.statusCode === 428 ? 'Complete seu cadastro com Google no portal UFA Prova antes de entrar no aplicativo.'
          : error.statusCode === 409 ? 'Este e-mail possui uma conta com senha. Entre com a senha dessa conta.'
          : 'A entrada com Google não foi concluída. Tente novamente.';
        await pool.query("UPDATE mobile_google_login_attempts SET status='failed',message=$2 WHERE id=$1 AND status='pending'", [id,message]);
        return { status: 'failed', message };
      }
    },
    async status(input) {
      if (typeof input?.id !== 'string' || !uuid.test(input.id) ||
          typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token)) throw expired();
      const result = await pool.query(
        'SELECT status,message FROM mobile_google_login_attempts WHERE id=$1 AND token_hash=$2 AND expires_at>now()',
        [input.id, hash(input.token)],
      );
      if (!result.rowCount) throw expired();
      return { status: result.rows[0].status, ...(result.rows[0].message ? { message: result.rows[0].message } : {}) };
    },
  };
}

