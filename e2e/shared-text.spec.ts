import { expect, test, type Page } from '@playwright/test';

async function openQuestionBank(page: Page) {
  await page.goto('/portal');
  const sidebar = page.locator('aside');
  const target = sidebar.getByRole('button', { name: /^Questões/ });
  if (!(await target.isVisible()))
    await sidebar
      .getByRole('button', { name: 'Expandir ferramentas de preparação' })
      .click();
  await target.click();
  await expect(
    page.getByRole('heading', { name: 'Banco de questões' }),
  ).toBeVisible();
}

async function startSharedTextEditor(
  page: Page,
  { fillStatement = false } = {},
) {
  await openQuestionBank(page);
  await page.getByRole('button', { name: 'Nova questão' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Nova questão' }),
  ).toBeVisible();
  await dialog
    .getByRole('checkbox', { name: /faz parte de um grupo com texto-base/ })
    .check();
  await dialog.getByRole('button', { name: '+ Criar novo texto-base' }).click();
  await dialog.getByPlaceholder('Ex.: De próprio punho').fill('Texto de teste');
  await dialog.getByText('Conteúdo do texto-base').waitFor();
  const content = dialog
    .locator('fieldset, div')
    .filter({ hasText: 'Conteúdo do texto-base' })
    .locator('textarea')
    .first();
  await content.fill('Primeira linha do texto.\nSegunda linha do texto.');
  if (fillStatement)
    // Enunciado: a próxima caixa de texto da etapa, depois do texto-base.
    await dialog
      .locator('#question-content textarea')
      .nth(1)
      .fill('Comando da questão de teste, com texto suficiente.');
  return dialog;
}

test('Fechar do cadastro funciona com o editor de texto-base aberto', async ({
  page,
}) => {
  const dialog = await startSharedTextEditor(page);
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Cancelar do cadastro funciona com o editor de texto-base aberto', async ({
  page,
}) => {
  const dialog = await startSharedTextEditor(page);
  await dialog
    .getByRole('button', { name: 'Cancelar', exact: true })
    .last()
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Cancelar do texto-base fecha só o editor do texto', async ({ page }) => {
  const dialog = await startSharedTextEditor(page);
  await dialog
    .getByRole('button', { name: 'Cancelar', exact: true })
    .first()
    .click();
  await expect(
    dialog.getByRole('button', { name: '+ Criar novo texto-base' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Fechar com o rascunho sendo salvo espera o salvamento e fecha', async ({
  page,
}) => {
  // Salvamento lento: o clique em Fechar chega com o rascunho "ocupado".
  await page.route('**/api/questions/drafts/*', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  const dialog = await startSharedTextEditor(page, { fillStatement: true });
  await expect(dialog.getByText('Salvando rascunho…')).toBeVisible({
    timeout: 10_000,
  });
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
});

test('Fechar com falha no rascunho pergunta e fecha', async ({ page }) => {
  await page.route('**/api/questions/drafts/*', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Limite de 50 rascunhos. Retome e conclua os anteriores.',
          }),
        })
      : route.continue(),
  );
  const dialog = await startSharedTextEditor(page, { fillStatement: true });
  await expect(dialog.getByText('Limite de 50 rascunhos')).toBeVisible({
    timeout: 10_000,
  });
  let message = '';
  page.once('dialog', (confirm) => {
    message = confirm.message();
    void confirm.accept();
  });
  await dialog
    .getByRole('button', { name: 'Cancelar', exact: true })
    .last()
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(message).toMatch(/Limite de 50 rascunhos/);
});
