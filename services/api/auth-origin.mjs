export function authOriginAllowed({ path, origin, mobileClient, allowedOrigins }) {
  // Native password login sends no Origin. Browser requests must still use an approved origin.
  if (!origin) return path === '/api/auth/login' && mobileClient === 'mobile';
  return allowedOrigins.has(origin);
}
