import { createHash } from 'node:crypto';
import { pool } from './db.mjs';

// Limitador de login, convites de turma e código do aluno. Fica no PostgreSQL
// para valer entre instâncias e reinícios; cada chave tem uma janela de 15
// minutos que recomeça quando expira. Não há limite de chaves distintas: um
// atacante não consegue bloquear o login de todos enchendo a tabela.
export async function allowAuthAttempt(key, max = 30, db = pool) {
  const keyHash = createHash('sha256').update(String(key)).digest('hex');
  const result = await db.query(
    `INSERT INTO auth_rate_limits(key_hash,attempts,window_ends_at)
     VALUES($1,1,now()+interval '15 minutes')
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts=CASE WHEN auth_rate_limits.window_ends_at<=now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
       window_ends_at=CASE WHEN auth_rate_limits.window_ends_at<=now() THEN now()+interval '15 minutes' ELSE auth_rate_limits.window_ends_at END
     RETURNING attempts`,
    [keyHash],
  );
  // Limpeza ocasional das janelas vencidas, sem tarefa agendada.
  if (Math.random() < 0.01)
    await db.query(
      "DELETE FROM auth_rate_limits WHERE window_ends_at<now()-interval '1 hour'",
    );
  return result.rows[0].attempts <= max;
}
