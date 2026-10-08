export function authOriginAllowed({ path, origin, mobileClient, allowedOrigins }) {
  // Native password login sends no Origin. Browser requests must still use an approved origin.
  if (!origin) return ['/api/auth/login', '/api/auth/google/mobile/start', '/api/auth/google/mobile/status'].includes(path) && mobileClient === 'mobile';
  return allowedOrigins.has(origin);
}
