// Tabela de rotas: cada rota declara método, caminho (texto exato ou RegExp com
// grupos para os IDs), o handler e as exigências extras (limite de tentativas,
// origem). O servidor procura a rota e aplica as exigências antes do handler.

/** @typedef {{ method: string, path: string | RegExp, handler: Function, status?: number, rateLimit?: (identity: any) => string, rateLimitError?: string, originOrMobile?: boolean, maxBytes?: number }} Route */

export function findRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    if (typeof route.path === 'string') {
      if (route.path === pathname) return { route, params: [] };
      continue;
    }
    const match = route.path.exec(pathname);
    if (match) return { route, params: match.slice(1) };
  }
  return null;
}
