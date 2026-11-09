// Limitador em memória compartilhado por login, convites de turma e código do aluno.
const authAttempts = new Map();
export function allowAuthAttempt(key, max = 30) {
  const now = Date.now();
  for (const [ip, value] of authAttempts)
    if (value.until <= now) authAttempts.delete(ip);
  const current = authAttempts.get(key) || {
    count: 0,
    until: now + 15 * 60_000,
  };
  if (!authAttempts.has(key) && authAttempts.size >= 10000) return false;
  authAttempts.set(key, current);
  return ++current.count <= max;
}
