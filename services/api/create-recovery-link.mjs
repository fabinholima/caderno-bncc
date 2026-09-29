// Executar apenas no servidor por um operador autorizado. Nunca expor como endpoint.
import { randomBytes, createHash } from 'node:crypto';
import { pool, transaction } from './db.mjs';

try {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail da conta existente.');
  const url = new URL('/portal', process.env.AUTH_FRONTEND_URL || 'http://localhost:3000');
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS para recuperação fora do computador local.');
  const token = randomBytes(32).toString('hex');
  await transaction(async db => {
    const result = await db.query('SELECT id FROM users WHERE lower(email)=$1 AND active FOR UPDATE', [email]);
    if (result.rowCount !== 1) throw new Error('Conta ativa não encontrada.');
    const id = result.rows[0].id;
    await db.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [id]);
    await db.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [id,createHash('sha256').update(token).digest('hex')]);
    await db.query("INSERT INTO audit_log(user_id,action,metadata) VALUES($1,'auth.recovery_link.created',$2)", [id,JSON.stringify({source:'local-operator',expiresInMinutes:30})]);
  });
  url.hash = new URLSearchParams({reset_token:token}).toString();
  console.log(url.href);
} finally {
  await pool.end();
}
