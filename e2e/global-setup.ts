import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';

export const e2eUser = { email: 'e2e@local.dev', password: 'SenhaForte#2026' };

// Cria a conta de teste e faz login uma única vez; os testes reaproveitam a
// sessão (a API limita tentativas de login por conta).
export default async function globalSetup(config: FullConfig) {
  execFileSync('node', ['services/api/e2e-seed.mjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://caderno:caderno_test@localhost:5432/caderno_test',
      E2E_EMAIL: e2eUser.email,
      E2E_PASSWORD: e2eUser.password,
    },
  });
  const { baseURL, storageState } = config.projects[0].use;
  mkdirSync('e2e/.auth', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/portal');
  await page.getByPlaceholder('E-mail').fill(e2eUser.email);
  await page.locator('input[type=password]').fill(e2eUser.password);
  await page.getByRole('button', { name: 'Entrar' }).last().click();
  await page.getByRole('heading', { name: /^Olá/ }).waitFor({ timeout: 30_000 });
  await page.context().storageState({ path: storageState as string });
  await browser.close();
}
