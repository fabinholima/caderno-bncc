const defaultApiOrigin = 'https://api.ufaprova.com.br';
const hopByHopHeaders = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding',
];

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const apiOrigin = (process.env.API_PROXY_TARGET || defaultApiOrigin).replace(/\/$/, '');
  const target = `${apiOrigin}/api/${path.map(encodeURIComponent).join('/')}${incoming.search}`;
  const headers = new Headers(request.headers);
  for (const name of hopByHopHeaders) headers.delete(name);
  headers.set('cache-control', 'no-store');

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    cache: 'no-store',
  });
  const responseHeaders = new Headers(upstream.headers);
  for (const name of hopByHopHeaders) responseHeaders.delete(name);
  const cookies = upstream.headers.getSetCookie?.() || [];
  responseHeaders.delete('set-cookie');
  for (const cookie of cookies) responseHeaders.append('set-cookie', cookie);
  if (!cookies.length && upstream.headers.get('set-cookie')) responseHeaders.set('set-cookie', upstream.headers.get('set-cookie')!);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
