import { NextResponse, type NextRequest } from 'next/server';
import { displayPreferencesScript } from '@/lib/display-preferences';

// Cabeçalhos de segurança do portal. Ficam no middleware porque o vinext não
// aplica `headers()` do next.config às páginas do App Router.
const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Prévias de PDF usam iframes com blob: da própria origem.
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=15552000',
  // A câmera é usada para fotos de perfil; os demais recursos ficam bloqueados.
  'Permissions-Policy':
    'camera=(self), microphone=(), geolocation=(), payment=()',
};

// O script fixo do tema (app/layout.tsx) entra pelo hash; os scripts do React
// recebem o nonce, que o vinext lê do cabeçalho Content-Security-Policy da
// requisição.
let themeScriptHash: Promise<string> | undefined;
async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// O portal chama a API pelo domínio próprio (NEXT_PUBLIC_API_URL, por exemplo
// https://api.ufaprova.com.br); sem ele no connect-src, o navegador bloqueia
// todas as chamadas e o portal fica "temporariamente indisponível".
function apiOrigin() {
  try {
    return process.env.NEXT_PUBLIC_API_URL
      ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
      : '';
  } catch {
    return '';
  }
}

export function contentSecurityPolicy(nonce: string, themeHash: string) {
  const api = apiOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'sha256-${themeHash}' 'strict-dynamic'`,
    // Estilos inline: atributos style do React e as fontes injetadas pelo vinext.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self'${api ? ` ${api}` : ''}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(
    nonce,
    await (themeScriptHash ??= sha256(displayPreferencesScript)),
  );
  // Em desenvolvimento o Vite injeta scripts próprios: a política só é relatada.
  const header =
    process.env.NODE_ENV === 'production'
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only';
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(header, policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, policy);
  for (const [name, value] of Object.entries(securityHeaders))
    response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: '/((?!_next/static).*)',
};
