import { NextResponse } from 'next/server';

// Cabeçalhos de segurança do portal. Ficam no middleware porque o vinext não
// aplica `headers()` do next.config às páginas do App Router.
const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Prévias de PDF usam iframes com blob: da própria origem.
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=15552000',
  // A câmera é usada para fotos de perfil; os demais recursos ficam bloqueados.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
};

export function middleware() {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: '/((?!_next/static).*)',
};
