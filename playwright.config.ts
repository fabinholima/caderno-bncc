import { defineConfig, devices } from '@playwright/test';

// Testes de tela do portal. Sobem a API e o portal locais (ou reaproveitam
// os que já estiverem rodando) contra um banco Postgres LOCAL descartável.
//
//   DATABASE_URL=postgresql://...@localhost:5432/caderno_test pnpm test:e2e
const apiPort = 8788;
const portalPort = 3000;
const databaseUrl = process.env.DATABASE_URL || 'postgresql://caderno:caderno_test@localhost:5432/caderno_test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${portalPort}`,
    storageState: 'e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node services/api/server.mjs',
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: databaseUrl,
        PORT: String(apiPort),
        CPF_HASH_SECRET: process.env.CPF_HASH_SECRET || 'e2e-local-secret-0123456789abcdef0123',
        CORS_ORIGIN: `http://localhost:${portalPort}`,
        AUTH_FRONTEND_URL: `http://localhost:${portalPort}`,
        AUTH_DEV_RESET_TOKENS: 'true',
      },
    },
    {
      command: 'pnpm dev',
      url: `http://localhost:${portalPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}` },
    },
  ],
});
