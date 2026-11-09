import { randomUUID } from 'node:crypto';

export function developmentMail(env = process.env) {
  return env.NODE_ENV !== 'production' && env.AUTH_DEV_RESET_TOKENS === 'true';
}
export function mailConfigured(env = process.env) {
  try {
    const url = new URL(env.AUTH_FRONTEND_URL);
    return Boolean(
      env.RESEND_API_KEY &&
      env.AUTH_EMAIL_FROM &&
      !/[\r\n]/.test(env.AUTH_EMAIL_FROM) &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' ||
        (env.NODE_ENV !== 'production' &&
          url.protocol === 'http:' &&
          url.hostname === 'localhost')),
    );
  } catch {
    return false;
  }
}
export function requireMail() {
  if (!mailConfigured() && !developmentMail())
    throw Object.assign(
      new Error(
        'O serviço de e-mail está indisponível. Tente novamente mais tarde.',
      ),
      { statusCode: 503 },
    );
}
export function authMailLink(kind, token, env = process.env) {
  const param = {
    verify: 'verify_token',
    reset: 'reset_token',
    invite: 'convite',
  }[kind];
  if (!param) throw new Error('Tipo de e-mail inválido.');
  const url = new URL('/portal', env.AUTH_FRONTEND_URL);
  url.hash = new URLSearchParams({ [param]: token }).toString();
  return url.href;
}
export async function sendAuthMail(
  kind,
  recipient,
  token,
  { fetcher = fetch, env = process.env } = {},
) {
  if (developmentMail(env)) return;
  if (!mailConfigured(env))
    throw Object.assign(new Error('O serviço de e-mail está indisponível.'), {
      statusCode: 503,
    });
  const link = authMailLink(kind, token, env);
  const { subject, intro, expires } = {
    verify: {
      subject: 'Confirme seu e-mail — UfaProva',
      intro: 'Confirme seu endereço de e-mail para acessar o UfaProva.',
      expires: '24 horas',
    },
    reset: {
      subject: 'Redefina sua senha — UfaProva',
      intro: 'Você solicitou uma nova senha para o UfaProva.',
      expires: '30 minutos',
    },
    invite: {
      subject: 'Convite para a equipe — UfaProva',
      intro:
        'Você foi convidado para a equipe de uma instituição no UfaProva. Entre ou crie sua conta com este e-mail e aceite o convite.',
      expires: '7 dias',
    },
  }[kind];
  const text = `${intro}\n\n${link}\n\nEste link expira em ${expires} e só pode ser usado uma vez. Se você não fez esta solicitação, ignore este e-mail.`;
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        from: env.AUTH_EMAIL_FROM,
        to: [recipient],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || typeof (await response.json()).id !== 'string')
      throw new Error('delivery_failed');
  } catch {
    // Do not expose provider responses, recipients, links or credentials in errors/logs.
    throw Object.assign(
      new Error(
        'Não foi possível enviar o e-mail. Tente novamente mais tarde.',
      ),
      { statusCode: 503 },
    );
  }
}
