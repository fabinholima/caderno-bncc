export function authOriginAllowed({ path, origin, mobileClient, allowedOrigins }) {
  // Native password login sends no Origin. Browser requests must still use an approved origin.
  if (!origin) return ['/api/auth/login', '/api/auth/register', '/api/auth/student/register', '/api/auth/student/first-access/inspect', '/api/auth/student/first-access', '/api/auth/student/code-login', '/api/auth/resend-verification', '/api/auth/forgot-password', '/api/auth/verify-email', '/api/auth/logout', '/api/auth/google/mobile/start', '/api/auth/google/mobile/status'].includes(path) && mobileClient === 'mobile';
  return allowedOrigins.has(origin);
}
