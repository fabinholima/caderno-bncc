import { createHmac, timingSafeEqual } from 'node:crypto';

export const billingPlans = [
  { id: 'professor', name: 'Professor', monthly: 2990, annual: 29900 },
  { id: 'escola', name: 'Escola', monthly: 14990, annual: 149900 },
];
export const billingError = (message, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });

export function billingConfigured(env = process.env) {
  try {
    return (
      env.MP_BILLING_ENABLED === 'true' &&
      Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET) &&
      new URL(env.MP_BACK_URL).protocol === 'https:' &&
      env.DEV_AUTH_BYPASS !== 'true'
    );
  } catch {
    return false;
  }
}

export function checkoutSelection(input) {
  const plan = billingPlans.find((p) => p.id === input?.plan);
  if (!plan || !['monthly', 'annual'].includes(input?.cycle))
    throw billingError('Plano ou periodicidade inválidos.');
  return {
    plan,
    months: input.cycle === 'annual' ? 12 : 1,
    cents: plan[input.cycle],
  };
}

export function verifySignature(headers, id, secret) {
  const fields = Object.fromEntries(
    String(headers['x-signature'] || '')
      .split(',')
      .map((part) => part.trim().split('=')),
  );
  const requestId = headers['x-request-id'];
  if (
    !secret ||
    !id ||
    !requestId ||
    !/^\d+$/.test(fields.ts || '') ||
    !/^[a-f0-9]{64}$/i.test(fields.v1 || '')
  )
    return false;
  const manifest = `id:${String(id).toLowerCase()};request-id:${requestId};ts:${fields.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(fields.v1, 'hex'));
}

export function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'www.mercadopago.com.br' &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Fail closed if provider returns an unexpected destination. */
  }
  throw billingError('Endereço de pagamento inválido.', 502);
}

export function accessUntil(date, months) {
  const end = new Date(date);
  if (!Number.isFinite(end.getTime()))
    throw billingError('Data de pagamento inválida.', 502);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end.toISOString();
}

export async function mpRequest(
  path,
  { method = 'GET', body } = {},
  fetcher = fetch,
) {
  if (!billingConfigured())
    throw billingError('Mercado Pago ainda não configurado.', 503);
  let response;
  try {
    response = await fetcher(`https://api.mercadopago.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw billingError(
      'Mercado Pago indisponível. Tente consultar o status mais tarde.',
      502,
    );
  }
  if (!response.ok)
    throw billingError(
      'O Mercado Pago não confirmou a operação. Consulte o administrador.',
      502,
    );
  return response.json();
}
