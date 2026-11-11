import { expect, test } from '@playwright/test';

// Gestão Acadêmica: painel de indicadores e ciclo de vida do ano letivo,
// contra a API e o banco locais (sem dados simulados no frontend).
test.describe('gestão acadêmica', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: /^Olá/ })).toBeVisible();
    await page.locator('aside').getByRole('button', { name: /^Turmas e alunos/ }).click();
  });

  test('painel mostra indicadores reais e as pendências', async ({ page }) => {
    await page.getByRole('tab', { name: 'Painel' }).click();
    await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
    await expect(page.getByText('Matrículas ativas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pendências acadêmicas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Matrículas por ano letivo' })).toBeVisible();
  });

  test('cadastra, ativa, arquiva, reabre e exclui um ano letivo', async ({ page }) => {
    await page.getByRole('tab', { name: 'Anos letivos' }).click();
    const year = String(2090 + Math.floor(Math.random() * 9));
    await page.getByLabel('Ano', { exact: true }).first().fill(year);
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByText(`Ano letivo ${year} cadastrado em planejamento.`)).toBeVisible();

    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: year }) });
    await expect(card.getByText('Planejamento')).toBeVisible();
    await card.getByRole('button', { name: 'Ativar' }).click();
    await expect(card.getByText('Ativo', { exact: true })).toBeVisible();

    // Filtro por situação esconde o ano ativo.
    await page.locator('#years-filter-status').selectOption('archived');
    await expect(card).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpar filtros' }).click();

    page.once('dialog', (dialog) => dialog.accept('Teste automatizado'));
    await card.getByRole('button', { name: 'Arquivar' }).click();
    await expect(card.getByText('Arquivado', { exact: true })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept('Reabertura de teste'));
    await card.getByRole('button', { name: 'Reabrir' }).click();
    await expect(card.getByText('Ativo', { exact: true })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText(`Ano letivo ${year} excluído.`)).toBeVisible();
    await expect(card).toHaveCount(0);
  });
});
