// Logs estruturados (uma linha JSON por evento) e alertas por e-mail.
// Os logs nunca levam query string, corpo, cookies ou cabeçalhos: só o caminho,
// o status, a duração e o ID da requisição, que também volta ao cliente no
// cabeçalho x-request-id para cruzar um relato de erro com o log.
import { randomUUID } from 'node:crypto';

export function requestIdFrom(request) {
  const incoming = request.headers['x-request-id'];
  return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
    ? incoming
    : randomUUID();
}

export function log(level, message, fields = {}, output = process.stdout) {
  output.write(
    `${JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...fields })}\n`,
  );
}

/** Campos seguros de um erro: tipo, código do Postgres e pilha, sem dados enviados. */
export function errorFields(error) {
  return {
    error: error?.name || 'Error',
    code: error?.code,
    message: String(error?.message || '').slice(0, 300),
    stack: String(error?.stack || '')
      .split('\n')
      .slice(0, 8)
      .join('\n'),
  };
}

export function alertRecipients(env = process.env) {
  return String(env.ALERT_EMAIL_TO || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^[^\s@]+@[^\s@]+$/.test(value));
}

/** Envia um alerta pelo Resend; sem ALERT_EMAIL_TO ou sem Resend, só registra no log. */
export async function sendAlert(
  subject,
  text,
  { env = process.env, fetcher = fetch } = {},
) {
  const to = alertRecipients(env);
  if (!to.length || !env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    log('warn', 'alert.not_sent', {
      subject,
      reason: 'alert_mail_not_configured',
    });
    return false;
  }
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
        to,
        subject: `[UfaProva] ${subject}`,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    log('info', 'alert.sent', { subject });
    return true;
  } catch (error) {
    log('error', 'alert.failed', { subject, ...errorFields(error) });
    return false;
  }
}

/**
 * Conta respostas 5xx numa janela deslizante e alerta quando passam do limite.
 * Depois de um alerta, espera o intervalo de silêncio antes de mandar outro.
 */
export function createErrorAlerter({
  threshold = Number(process.env.ALERT_5XX_THRESHOLD) || 5,
  windowMs = 5 * 60_000,
  cooldownMs = 30 * 60_000,
  now = Date.now,
  send = sendAlert,
} = {}) {
  let recent = [];
  let silentUntil = 0;
  return function record({ status, method, path, requestId }) {
    if (status < 500) return false;
    const time = now();
    recent = recent.filter((item) => time - item.time < windowMs);
    recent.push({ time, status, method, path, requestId });
    if (recent.length < threshold || time < silentUntil) return false;
    silentUntil = time + cooldownMs;
    const lines = recent.map(
      (item) =>
        `${new Date(item.time).toISOString()} ${item.status} ${item.method} ${item.path} (${item.requestId})`,
    );
    void send(
      `${recent.length} erros 5xx na API em ${Math.round(windowMs / 60_000)} min`,
      `A API respondeu com erro interno ${recent.length} vezes nos últimos ${Math.round(windowMs / 60_000)} minutos.\n\n${lines.join('\n')}\n\nProcure os IDs acima nos logs da API (docker compose logs api).`,
    );
    recent = [];
    return true;
  };
}

/** Caminho para o log: sem query string e com IDs trocados por :id (agrupa e evita tokens). */
export function logPath(rawUrl = '') {
  return (
    String(rawUrl)
      .split('?')[0]
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .slice(0, 200) || '/'
  );
}
