#!/usr/bin/env node
// Planos de assinatura com o mesmo nome (ex.: "school" e "escola", ambos
// chamados "Escola") confundem os filtros da administração.
//
// Por padrão o script só LÊ o banco e mostra um relatório. Para alterar, é
// preciso passar --apply e confirmar o host do banco com --confirm-host=<host>.
// A alteração apenas renomeia os planos sem preço para "<nome> (plano antigo)";
// nenhum plano é apagado e nenhuma assinatura muda de plano.
//
//   node duplicate-plans.mjs   (na pasta services/api ou no Web Shell da API)
//   node duplicate-plans.mjs   (na pasta services/api ou no Web Shell da API) --apply --confirm-host=<host do banco>
//
// Faça um backup do banco antes de usar --apply.
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const confirmHost = process.argv.find((arg) => arg.startsWith('--confirm-host='))?.split('=')[1];
const apply = args.has('--apply');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL.');
  process.exit(1);
}
const host = new URL(connectionString).hostname;

async function findDuplicatePlans(client) {
  const { rows } = await client.query(`
    SELECT p.id, p.name, p.monthly_price_cents, p.annual_price_cents, p.monthly_assessments, p.max_students,
      (SELECT count(*)::int FROM institution_subscriptions s WHERE s.plan_id = p.id) AS subscriptions,
      (SELECT count(*)::int FROM billing_contracts c WHERE c.plan_id = p.id) AS contracts,
      (SELECT count(*)::int FROM billing_coupons c WHERE c.plan_id = p.id) AS coupons
    FROM subscription_plans p
    WHERE lower(p.name) IN (SELECT lower(name) FROM subscription_plans GROUP BY lower(name) HAVING count(*) > 1)
    ORDER BY lower(p.name), (p.monthly_price_cents IS NULL AND p.annual_price_cents IS NULL), p.id`);
  return rows;
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const plans = await findDuplicatePlans(client);
    console.log(`Banco: ${host}`);
    if (!plans.length) {
      console.log('Nenhum plano com nome repetido.');
      return;
    }
    console.table(plans.map((plan) => ({
      id: plan.id,
      nome: plan.name,
      'preço mensal': plan.monthly_price_cents ? (plan.monthly_price_cents / 100).toFixed(2) : '—',
      'avaliações/mês': plan.monthly_assessments,
      assinaturas: plan.subscriptions,
      contratos: plan.contracts,
      cupons: plan.coupons,
    })));
    const legacy = plans.filter((plan) => plan.monthly_price_cents == null && plan.annual_price_cents == null);
    if (!legacy.length) {
      console.log('Todos os planos repetidos têm preço; nada a renomear automaticamente.');
      return;
    }
    console.log(`Planos sem preço que seriam renomeados: ${legacy.map((plan) => `${plan.id} → "${plan.name} (plano antigo)"`).join(', ')}`);
    if (!apply) {
      console.log('Modo leitura: nada foi alterado. Use --apply --confirm-host=<host> para renomear.');
      return;
    }
    if (confirmHost !== host) {
      console.error(`Confirmação ausente ou diferente. Para alterar este banco, repita com --confirm-host=${host}`);
      process.exitCode = 1;
      return;
    }
    await client.query('BEGIN');
    for (const plan of legacy)
      await client.query(
        `UPDATE subscription_plans SET name = $2 WHERE id = $1 AND name NOT LIKE '%(plano antigo)'`,
        [plan.id, `${plan.name} (plano antigo)`],
      );
    await client.query('COMMIT');
    console.log('Planos renomeados. Nenhuma assinatura foi alterada.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

await main();
