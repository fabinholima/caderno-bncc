import { createHash, randomBytes } from 'node:crypto';
import { pool, transaction } from './db.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const createCode = () => randomBytes(32).toString('base64url');
const createToken = () => randomBytes(32).toString('base64url');

export async function createGoogleSessionExchange(sessionId) {
  const code = createCode();
  await pool.query('DELETE FROM google_session_exchange_codes WHERE expires_at <= now()');
  await pool.query('INSERT INTO google_session_exchange_codes(code_hash,session_id) VALUES($1,$2)', [hash(code),sessionId]);
  return code;
}

export async function claimGoogleSessionExchange(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(code)) {
    throw Object.assign(new Error('Código de sessão inválido ou expirado.'), { statusCode: 401 });
  }
  const token = createToken();
  return transaction(async (client) => {
    const exchange = await client.query(
      'DELETE FROM google_session_exchange_codes WHERE code_hash=$1 AND expires_at>now() RETURNING session_id',
      [hash(code)],
    );
    if (!exchange.rowCount) throw Object.assign(new Error('Código de sessão inválido ou expirado.'), { statusCode: 401 });
    const updated = await client.query(
      `UPDATE user_sessions s SET token_hash=$2,last_seen_at=now()
       FROM users u WHERE s.id=$1 AND s.user_id=u.id AND u.active AND s.expires_at>now()
       RETURNING s.id`,
      [exchange.rows[0].session_id,hash(token)],
    );
    if (!updated.rowCount) throw Object.assign(new Error('A sessão Google expirou. Entre novamente.'), { statusCode: 401 });
    return token;
  });
}
