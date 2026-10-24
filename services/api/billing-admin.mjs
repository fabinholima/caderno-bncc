import { pool, transaction } from './db.mjs';
import { requirePortalAdmin } from './portal-admin.mjs';
import { billingError } from './mercado-pago.mjs';

const MANAGED_PLANS = ['professor', 'escola'];

function admin(identity) {
  requirePortalAdmin(identity);
}

function price(value, label) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 100 || cents > 10_000_000)
    throw billingError(`${label} deve ficar entre R$ 1,00 e R$ 100.000,00.`);
  return cents;
}

export async function publicBillingPlans() {
  const result = await pool.query(
    `SELECT id,name,monthly_price_cents AS monthly,annual_price_cents AS annual
     FROM subscription_plans WHERE id = ANY($1::text[])
     ORDER BY CASE id WHEN 'professor' THEN 1 WHEN 'escola' THEN 2 ELSE 3 END`,
    [MANAGED_PLANS],
  );
  return result.rows;
}

export async function listBillingSettings(identity) {
  admin(identity);
  const [plans, coupons] = await Promise.all([
    publicBillingPlans(),
    pool.query(
      `SELECT coupon.id,coupon.code,coupon.discount_type,coupon.discount_value,
              coupon.plan_id,coupon.cycle_months,coupon.starts_at,coupon.ends_at,
              coupon.max_redemptions,coupon.active,coupon.created_at,
              count(contract.id) FILTER (WHERE contract.status <> 'cancelled')::int AS redemptions
       FROM billing_coupons coupon
       LEFT JOIN billing_contracts contract ON contract.coupon_id=coupon.id
       GROUP BY coupon.id ORDER BY coupon.created_at DESC`,
    ),
  ]);
  return { plans, coupons: coupons.rows };
}

export async function updateBillingPlan(identity, input) {
  admin(identity);
  if (!MANAGED_PLANS.includes(input?.planId))
    throw billingError('Selecione um plano válido.');
  const monthly = price(input.monthlyPriceCents, 'O preço mensal');
  const annual = price(input.annualPriceCents, 'O preço anual');
  return transaction(async (db) => {
    const result = await db.query(
      `UPDATE subscription_plans
       SET monthly_price_cents=$2,annual_price_cents=$3
       WHERE id=$1 RETURNING id,name,monthly_price_cents AS monthly,
         annual_price_cents AS annual`,
      [input.planId, monthly, annual],
    );
    if (!result.rowCount) throw billingError('Plano não encontrado.', 404);
    await db.query(
      `INSERT INTO audit_log(user_id,action,entity_type,entity_id,metadata)
       VALUES($1,'billing.plan.prices.updated','subscription_plan',$2,$3::jsonb)`,
      [identity.userId, input.planId, JSON.stringify({ monthly, annual })],
    );
    return result.rows[0];
  });
}

function couponInput(input) {
  const code = String(input?.code || '').trim().toUpperCase();
  const discountType = input?.discountType;
  const discountValue = Number(input?.discountValue);
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code))
    throw billingError('Use um código de 3 a 24 caracteres: letras, números ou hífen.');
  if (!['percent', 'fixed'].includes(discountType))
    throw billingError('Escolha um tipo de desconto válido.');
  if (!Number.isInteger(discountValue) || discountValue < 1 || (discountType === 'percent' && discountValue > 99))
    throw billingError('O valor do desconto é inválido.');
  const planId = input.planId || null;
  if (planId && !MANAGED_PLANS.includes(planId))
    throw billingError('O cupom precisa ser válido para um plano existente.');
  const cycleMonths = input.cycleMonths === '' || input.cycleMonths == null
    ? null : Number(input.cycleMonths);
  if (cycleMonths !== null && ![1, 12].includes(cycleMonths))
    throw billingError('Escolha uma periodicidade válida.');
  const maxRedemptions = input.maxRedemptions === '' || input.maxRedemptions == null
    ? null : Number(input.maxRedemptions);
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1_000_000))
    throw billingError('O limite de utilizações deve ser um número positivo.');
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (endsAt && !Number.isFinite(endsAt.getTime()))
    throw billingError('A data de encerramento do cupom é inválida.');
  return { code, discountType, discountValue, planId, cycleMonths, maxRedemptions, endsAt };
}

export async function saveBillingCoupon(identity, input) {
  admin(identity);
  const coupon = couponInput(input);
  return transaction(async (db) => {
    let result;
    if (input.id) {
      result = await db.query(
        `UPDATE billing_coupons
         SET code=$2,discount_type=$3,discount_value=$4,plan_id=$5,
             cycle_months=$6,ends_at=$7,max_redemptions=$8,active=$9,updated_at=now()
         WHERE id=$1
         RETURNING id,code,discount_type,discount_value,plan_id,cycle_months,
           starts_at,ends_at,max_redemptions,active`,
        [input.id, coupon.code, coupon.discountType, coupon.discountValue,
          coupon.planId, coupon.cycleMonths, coupon.endsAt,
          coupon.maxRedemptions, input.active !== false],
      );
    } else {
      result = await db.query(
        `INSERT INTO billing_coupons
          (code,discount_type,discount_value,plan_id,cycle_months,ends_at,
           max_redemptions,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,code,discount_type,discount_value,plan_id,cycle_months,
           starts_at,ends_at,max_redemptions,active`,
        [coupon.code, coupon.discountType, coupon.discountValue, coupon.planId,
          coupon.cycleMonths, coupon.endsAt, coupon.maxRedemptions, identity.userId],
      );
    }
    if (!result.rowCount) throw billingError('Cupom não encontrado.', 404);
    await db.query(
      `INSERT INTO audit_log(user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'billing_coupon',$3,$4::jsonb)`,
      [identity.userId, input.id ? 'billing.coupon.updated' : 'billing.coupon.created',
        result.rows[0].id, JSON.stringify({ code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, active: input.active !== false })],
    );
    return result.rows[0];
  });
}

export function normalizeCouponCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code))
    throw billingError('Código de cupom inválido.');
  return code;
}

export async function applyBillingCoupon(db, { code, planId, months, cents, institutionId }) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { coupon: null, amountCents: cents, discountCents: 0 };
  const result = await db.query(
    `SELECT * FROM billing_coupons WHERE code=$1 FOR UPDATE`,
    [normalized],
  );
  if (!result.rowCount) throw billingError('Cupom não encontrado.');
  const coupon = result.rows[0];
  const now = Date.now();
  if (!coupon.active || new Date(coupon.starts_at).getTime() > now ||
      (coupon.ends_at && new Date(coupon.ends_at).getTime() < now))
    throw billingError('Este cupom está expirado ou desativado.');
  if (coupon.plan_id && coupon.plan_id !== planId)
    throw billingError('Este cupom não é válido para o plano escolhido.');
  if (coupon.cycle_months && coupon.cycle_months !== months)
    throw billingError('Este cupom não é válido para essa periodicidade.');
  const prior = await db.query(
    "SELECT 1 FROM billing_contracts WHERE coupon_id=$1 AND institution_id=$2 AND status <> 'cancelled' LIMIT 1",
    [coupon.id, institutionId],
  );
  if (prior.rowCount) throw billingError('Esta instituição já utilizou esse cupom.');
  if (coupon.max_redemptions) {
    const uses = await db.query(
      "SELECT count(*)::int AS total FROM billing_contracts WHERE coupon_id=$1 AND status <> 'cancelled'",
      [coupon.id],
    );
    if (uses.rows[0].total >= coupon.max_redemptions)
      throw billingError('O limite de utilizações deste cupom foi atingido.');
  }
  const discountCents = coupon.discount_type === 'percent'
    ? Math.round(cents * coupon.discount_value / 100)
    : coupon.discount_value;
  if (discountCents >= cents)
    throw billingError('O desconto do cupom precisa ser menor que o preço do plano.');
  return { coupon, amountCents: cents - discountCents, discountCents };
}
