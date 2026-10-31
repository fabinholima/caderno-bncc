import { expect, test, type Page } from '@playwright/test';

// Navega pelo menu lateral do portal (abre o grupo "Preparar" quando preciso).
async function openSection(page: Page, name: string) {
  const sidebar = page.locator('aside');
  const target = sidebar.getByRole('button', { name: new RegExp(`^${name}`) });
  if (!(await target.isVisible())) {
    await sidebar.getByRole('button', { name: 'Expandir ferramentas de preparação' }).click();
  }
  await target.click();
}

test.describe('página pública', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('apresenta a UfaProva e leva ao portal', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/UfaProva/);
    await expect(page.locator('a[href="/portal"]').first()).toBeVisible();
  });
});

test.describe('portal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: /^Olá/ })).toBeVisible();
  });

  test('o primeiro item do teclado pula para o conteúdo', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();
  });

  test('modo escuro e tamanho da fonte ficam salvos', async ({ page }) => {
    const html = page.locator('html');
    await page.getByRole('button', { name: 'Aumentar o tamanho da fonte' }).click();
    await expect(html).toHaveAttribute('data-font-scale', '1');
    const darkMode = page.getByRole('button', { name: 'Modo escuro' });
    await darkMode.click();
    await expect(darkMode).toHaveAttribute('aria-pressed', 'true');
    await expect(html).toHaveClass(/\bdark\b/);

    await page.reload();
    await expect(page.getByRole('heading', { name: /^Olá/ })).toBeVisible();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute('data-font-scale', '1');
  });

  test('banco de questões abre pelo menu', async ({ page }) => {
    await openSection(page, 'Questões');
    await expect(page.getByRole('heading', { name: 'Banco de questões' })).toBeVisible();
  });

  test('planejamento começa com as seções recolhidas', async ({ page }) => {
    await openSection(page, 'Planejamento');
    await expect(page.getByRole('heading', { name: 'Estrutura BNCC' })).toBeVisible();
    const toggle = page.getByRole('button', { name: /Conteúdo curricular/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#planejamento-content')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#planejamento-content')).toBeVisible();
  });

  test('cria uma turma pela janela "Nova turma"', async ({ page }) => {
    const className = `E2E ${Date.now().toString(36)}`;
    await openSection(page, 'Turmas e alunos');
    await page.getByRole('button', { name: 'Nova turma' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nova turma' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Nome da turma').fill(className);
    await dialog.getByLabel('Etapa de ensino').fill('9º ano');
    await dialog.getByRole('button', { name: 'Criar turma' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: className })).toBeVisible();
  });

  test('administração mostra assinantes e receitas', async ({ page }) => {
    await openSection(page, 'Assinantes');
    await expect(page.getByRole('heading', { name: 'Assinantes', level: 1 })).toBeVisible();
    await openSection(page, 'Receitas');
    await expect(page.getByRole('heading', { name: 'Receitas', level: 1 })).toBeVisible();
  });
});
