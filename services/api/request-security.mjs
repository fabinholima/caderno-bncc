import { isIP } from 'node:net';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizeIp(raw) {
  const value = String(raw || '').trim();
  const ip = value.startsWith('::ffff:') ? value.slice(7) : value;
  return isIP(ip) ? ip : null;
}

// Atrás de proxies (Render, Cloudflare), o socket mostra o IP do proxy. Com
// TRUST_PROXY_HOPS=N, usamos a N-ésima entrada a partir da direita do
// X-Forwarded-For: as entradas à esquerda podem ser forjadas pelo cliente.
export function clientIp(request, hops = Number(process.env.TRUST_PROXY_HOPS || 0)) {
  const socketIp = normalizeIp(request.socket?.remoteAddress);
  if (!Number.isInteger(hops) || hops < 1) return socketIp;
  const forwarded = String(request.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalizeIp(forwarded[forwarded.length - hops]) || socketIp;
}

// Proteção contra CSRF: o cookie de sessão usa SameSite=None em produção, então
// toda alteração feita por navegador precisa vir de uma origem autorizada.
// Requisições sem Origin só passam quando não carregam o cookie de sessão
// (aplicativo, webhooks) ou se identificam como o aplicativo móvel.
export function mutationOriginAllowed({ method, origin, cookie, mobileClient, allowedOrigins }) {
  if (!mutatingMethods.has(method)) return true;
  if (origin) return allowedOrigins.has(origin);
  if (mobileClient === 'mobile') return true;
  return !/(?:^|;\s*)caderno_session=/.test(cookie || '');
}

// Defesa adicional contra CSRF: formulários HTML só enviam text/plain,
// urlencoded ou multipart. Alterações com corpo feitas pelo navegador (com
// cookie de sessão) precisam declarar JSON; o aplicativo e webhooks não são afetados.
export function jsonBodyAllowed({ method, headers }) {
  if (!mutatingMethods.has(method)) return true;
  const hasBody = Number(headers['content-length'] || 0) > 0 || Boolean(headers['transfer-encoding']);
  if (!hasBody || headers['x-client'] === 'mobile') return true;
  if (!/(?:^|;\s*)caderno_session=/.test(headers.cookie || '')) return true;
  return /^application\/json\s*(?:;|$)/i.test(String(headers['content-type'] || ''));
}

// Origens aceitas vêm só da configuração: CORS_ORIGIN (separadas por vírgula)
// mais a origem de AUTH_FRONTEND_URL, que precisa sempre conseguir chamar a API.
export function configuredOrigins(environment = process.env) {
  const origins = new Set(
    String(environment.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
  try {
    if (environment.AUTH_FRONTEND_URL) origins.add(new URL(environment.AUTH_FRONTEND_URL).origin);
  } catch {
    // URL inválida é apontada por scripts/check-production-env.mjs.
  }
  return origins;
}

export function apiSecurityHeaders({ production = process.env.NODE_ENV === 'production' } = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'content-security-policy': "frame-ancestors 'none'",
    ...(production ? { 'strict-transport-security': 'max-age=15552000' } : {}),
  };
}
