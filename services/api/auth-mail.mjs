import { randomUUID } from 'node:crypto';

export function developmentMail(env = process.env) {
  return env.NODE_ENV !== 'production' && env.AUTH_DEV_RESET_TOKENS === 'true';
}
export function mailConfigured(env = process.env) {
  try {
    const url = new URL(env.AUTH_FRONTEND_URL);
    return Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM && !/[\r\n]/.test(env.AUTH_EMAIL_FROM) &&
      !url.username && !url.password && (url.protocol === 'https:' ||
      (env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost')));
  } catch { return false; }
}
export function requireMail() {
  if (!mailConfigured() && !developmentMail())
    throw Object.assign(new Error('O serviço de e-mail está indisponível. Tente novamente mais tarde.'), { statusCode: 503 });
}
export function authMailLink(kind, token, env = process.env) {
  if (!['verify', 'reset'].includes(kind)) throw new Error('Tipo de e-mail inválido.');
  const url = new URL('/portal', env.AUTH_FRONTEND_URL);
  url.hash = new URLSearchParams({ [kind === 'verify' ? 'verify_token' : 'reset_token']: token }).toString();
  return url.href;
}
export async function sendAuthMail(kind, recipient, token, { fetcher = fetch, env = process.env } = {}) {
  if (developmentMail(env)) return;
  if (!mailConfigured(env)) throw Object.assign(new Error('O serviço de e-mail está indisponível.'), { statusCode: 503 });
  const link = authMailLink(kind, token, env);
  const verify = kind === 'verify';
  const subject = verify ? 'Confirme seu e-mail — UfaProva' : 'Redefina sua senha — UfaProva';
  const text = `${verify ? 'Confirme seu endereço de e-mail para acessar o UfaProva.' : 'Você solicitou uma nova senha para o UfaProva.'}\n\n${link}\n\nEste link expira em ${verify ? '24 horas' : '30 minutos'} e só pode ser usado uma vez. Se você não fez esta solicitação, ignore este e-mail.`;
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [recipient], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || typeof (await response.json()).id !== 'string') throw new Error('delivery_failed');
  } catch {
    // Do not expose provider responses, recipients, links or credentials in errors/logs.
    throw Object.assign(new Error('Não foi possível enviar o e-mail. Tente novamente mais tarde.'), { statusCode: 503 });
  }
}
