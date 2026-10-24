import { pool, transaction } from './db.mjs';
import {
  billingConfigured,
  billingError,
  checkoutSelection,
  checkoutUrl,
  verifySignature,
  mpRequest,
  accessUntil,
} from './mercado-pago.mjs';
import { publicBillingPlans, applyBillingCoupon, normalizeCouponCode } from './billing-admin.mjs';

function admin(identity) {
  if (identity.role !== 'admin' || identity.developmentBypass)
    throw billingError(
      'Entre com uma conta de administrador para gerenciar cobranças.',
      403,
    );
}

export async function billingStatus(identity) {
  const [contracts, plans] = await Promise.all([
    pool.query(
      `SELECT id,plan_id,months,amount_cents,base_amount_cents,discount_cents,
              coupon_code,status,checkout_url
       FROM billing_contracts WHERE institution_id=$1
       ORDER BY created_at DESC LIMIT 1`,
      [identity.institutionId],
    ),
    publicBillingPlans(),
  ]);
  const payments = await pool.query(
    `SELECT p.status,p.amount_cents,p.paid_at,p.access_until FROM billing_payments p JOIN billing_contracts c ON c.id=p.contract_id WHERE c.institution_id=$1 ORDER BY p.paid_at DESC NULLS LAST LIMIT 24`,
    [identity.institutionId],
  );
  return {
    enabled: billingConfigured() && !identity.developmentBypass,
    plans,
    contract: contracts.rows[0] || null,
    payments: payments.rows,
  };
}

export async function previewBillingCoupon(identity, input) {
  admin(identity);
  return transaction(async (db) => {
    const result = await db.query(
      `SELECT id,name,monthly_price_cents AS monthly,annual_price_cents AS annual
       FROM subscription_plans WHERE id = ANY($1::text[])`,
      [['professor', 'escola']],
    );
    const { plan, months, cents } = checkoutSelection(input, result.rows);
    const applied = await applyBillingCoupon(db, {
      code: input?.couponCode,
      planId: plan.id,
      months,
      cents,
      institutionId: identity.institutionId,
    });
    return {
      planId: plan.id,
      months,
      baseAmountCents: cents,
      amountCents: applied.amountCents,
      discountCents: applied.discountCents,
      couponCode: applied.coupon?.code || null,
    };
  });
}

export async function createCheckout(identity, input) {
  admin(identity);
  if (!billingConfigured())
    throw billingError('Mercado Pago ainda não configurado.', 503);
  const couponCode = normalizeCouponCode(input?.couponCode);
  // Commit the reservation BEFORE calling the provider. An uncertain timeout must
  // not result in a second subscription on a subsequent click.
  const reservation = await transaction(async (db) => {
    await db.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE', [
      identity.institutionId,
    ]);
    const availablePlans = await db.query(
      `SELECT id,name,monthly_price_cents AS monthly,annual_price_cents AS annual
       FROM subscription_plans WHERE id = ANY($1::text[])`,
      [['professor', 'escola']],
    );
    const { plan, months, cents } = checkoutSelection(input, availablePlans.rows);
    const existing = await db.query(
      `SELECT * FROM billing_contracts WHERE institution_id=$1 AND status <> 'cancelled'`,
      [identity.institutionId],
    );
    if (existing.rowCount) {
      const contract = existing.rows[0];
      if (contract.status === 'pending' && contract.plan_id === plan.id &&
          contract.months === months && contract.coupon_code === couponCode &&
          contract.checkout_url)
        return { contract, plan, months, amountCents: contract.amount_cents };
      return { contract, plan, months, amountCents: contract.amount_cents };
    }
    const paid = await db.query(
      `SELECT 1 FROM billing_payments p JOIN billing_contracts c ON c.id=p.contract_id WHERE c.institution_id=$1 AND p.status='approved' AND p.access_until>now()`,
      [identity.institutionId],
    );
    if (paid.rowCount)
      throw billingError(
        'Aguarde o término do período pago antes de contratar outro plano.',
        409,
      );
    const applied = await applyBillingCoupon(db, {
      code: couponCode,
      planId: plan.id,
      months,
      cents,
      institutionId: identity.institutionId,
    });
    const created = await db.query(
      `INSERT INTO billing_contracts
        (institution_id,plan_id,months,amount_cents,base_amount_cents,
         discount_cents,coupon_id,coupon_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [identity.institutionId, plan.id, months, applied.amountCents, cents,
        applied.discountCents, applied.coupon?.id || null,
        applied.coupon?.code || null],
    );
    return { contract: created.rows[0], plan, months,
      amountCents: applied.amountCents, isNew: true };
  });
  const { contract, plan, months, amountCents } = reservation;
  if (!reservation.isNew) {
    if (contract.status === 'pending' && contract.plan_id === plan.id &&
        contract.months === months && contract.coupon_code === couponCode &&
        contract.checkout_url)
      return { url: checkoutUrl(contract.checkout_url) };
    throw billingError(
      'Já existe uma assinatura ou contratação em processamento. Consulte o status antes de tentar novamente.',
      409,
    );
  }
  const remote = await mpRequest('/preapproval', {
    method: 'POST',
    body: {
      reason: `UfaProva — ${plan.name} (${months === 12 ? 'anual' : 'mensal'})`,
      external_reference: contract.id,
      payer_email: identity.email,
      auto_recurring: {
        frequency: months,
        frequency_type: 'months',
        transaction_amount: amountCents / 100,
        currency_id: 'BRL',
      },
      back_url: process.env.MP_BACK_URL,
      status: 'pending',
    },
  });
  if (!remote.id)
    throw billingError('Resposta incompleta do Mercado Pago.', 502);
  // Persist the provider identifier even if the checkout URL needs investigation.
  await pool.query(
    `UPDATE billing_contracts SET provider_id=$2,status=CASE WHEN status='creating' THEN 'pending' ELSE status END,updated_at=now() WHERE id=$1`,
    [contract.id, String(remote.id)],
  );
  const url = checkoutUrl(remote.init_point);
  await pool.query('UPDATE billing_contracts SET checkout_url=$2 WHERE id=$1', [
    contract.id,
    url,
  ]);
  return { url };
}

export async function cancelBilling(identity) {
  admin(identity);
  return transaction(async (db) => {
    const result = await db.query(
      `SELECT * FROM billing_contracts WHERE institution_id=$1 AND status <> 'cancelled' FOR UPDATE`,
      [identity.institutionId],
    );
    if (!result.rowCount) return { cancelled: true };
    const c = result.rows[0];
    if (!c.provider_id)
      throw billingError(
        'Contratação sem confirmação. O administrador deve reconciliar a operação no Mercado Pago.',
        409,
      );
    const remote = await mpRequest(
      `/preapproval/${encodeURIComponent(c.provider_id)}`,
      { method: 'PUT', body: { status: 'cancelled' } },
    );
    if (remote.status !== 'cancelled')
      throw billingError('Cancelamento ainda não confirmado.', 502);
    await db.query(
      `UPDATE billing_contracts SET status='cancelled',updated_at=now() WHERE id=$1`,
      [c.id],
    );
    return { cancelled: true };
  });
}

export async function billingWebhook(request, url, body) {
  if (!billingConfigured()) throw billingError('Cobranças desativadas.', 503);
  const id = url.searchParams.get('data.id');
  if (!verifySignature(request.headers, id, process.env.MP_WEBHOOK_SECRET))
    throw billingError('Assinatura da notificação inválida.', 401);
  if (String(body.data?.id).toLowerCase() !== String(id).toLowerCase())
    throw billingError('Identificador divergente.', 400);
  if (!/^[a-zA-Z0-9_-]+$/.test(id))
    throw billingError('Identificador inválido.', 400);
  if (body.type === 'subscription_preapproval') {
    const remote = await mpRequest(`/preapproval/${encodeURIComponent(id)}`);
    // A preapproval authorization is NOT proof of payment.
    await pool.query(
      `UPDATE billing_contracts SET provider_id=$1,status=$2,updated_at=now() WHERE id::text=$3 AND (provider_id=$1 OR provider_id IS NULL) AND status <> 'cancelled'`,
      [String(remote.id), remote.status, remote.external_reference],
    );
  } else if (body.type === 'subscription_authorized_payment') {
    const invoice = await mpRequest(
      `/authorized_payments/${encodeURIComponent(id)}`,
    );
    if (!invoice.payment?.id) return { received: true };
    await reconcilePayment(
      String(invoice.payment.id),
      String(invoice.preapproval_id),
    );
  } else if (body.type === 'payment') {
    // Subsequent refunds/chargebacks must also invalidate an existing entitlement.
    const known = await pool.query(
      `SELECT c.provider_id FROM billing_payments p JOIN billing_contracts c ON c.id=p.contract_id WHERE p.provider_id=$1`,
      [id],
    );
    if (known.rowCount) await reconcilePayment(id, known.rows[0].provider_id);
  }
  return { received: true };
}

async function reconcilePayment(paymentId, preapprovalId) {
  return transaction(async (db) => {
    const found = await db.query(
      'SELECT * FROM billing_contracts WHERE provider_id=$1 FOR UPDATE',
      [preapprovalId],
    );
    if (!found.rowCount)
      throw billingError(
        'Assinatura ainda não reconciliada; repetir notificação.',
        503,
      );
    const c = found.rows[0];
    const p = await mpRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);
    if (
      String(p.id) !== paymentId ||
      p.currency_id !== 'BRL' ||
      Math.round(Number(p.transaction_amount) * 100) !== c.amount_cents
    )
      throw billingError('Pagamento incompatível com o contrato.', 422);
    // Invoice lookup establishes the subscription relation; known payments have
    // that relationship persisted. Fetching the payment uses the seller token.
    const approved =
      p.status === 'approved' && !Number(p.transaction_amount_refunded || 0);
    const paidAt = p.date_approved || null;
    const until = approved && paidAt ? accessUntil(paidAt, c.months) : null;
    await db.query(
      `INSERT INTO billing_payments(provider_id,contract_id,status,amount_cents,paid_at,access_until) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(provider_id) DO UPDATE SET status=excluded.status,paid_at=COALESCE(billing_payments.paid_at,excluded.paid_at),access_until=excluded.access_until,updated_at=now() WHERE billing_payments.contract_id=excluded.contract_id`,
      [
        paymentId,
        c.id,
        approved ? 'approved' : p.status === 'approved' ? 'refunded' : p.status,
        c.amount_cents,
        paidAt,
        until,
      ],
    );
    // Registra diferenças cumulativas uma única vez, inclusive estornos parciais.
    // observed_at é a data desta confirmação, não uma data bancária presumida.
    const refundCents = p.status === 'charged_back' ? c.amount_cents : Math.round(Number(p.transaction_amount_refunded || 0)*100);
    if (!Number.isSafeInteger(refundCents) || refundCents < 0 || refundCents > c.amount_cents) throw billingError('Valor de estorno inválido.',422);
    const previousRefund=await db.query('SELECT refund_cents FROM billing_payments WHERE provider_id=$1 FOR UPDATE',[paymentId]);
    const delta=refundCents-previousRefund.rows[0].refund_cents;
    if(delta>0) {
      await db.query('INSERT INTO billing_refund_events(payment_id,cumulative_cents,amount_cents) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[paymentId,refundCents,delta]);
      await db.query('UPDATE billing_payments SET refund_cents=$2 WHERE provider_id=$1',[paymentId,refundCents]);
    }
    const valid = await db.query(
      `SELECT p.*,c.plan_id FROM billing_payments p JOIN billing_contracts c ON c.id=p.contract_id WHERE c.institution_id=$1 AND p.status='approved' AND p.access_until>now() ORDER BY p.access_until DESC LIMIT 1`,
      [c.institution_id],
    );
    if (valid.rowCount) {
      const v = valid.rows[0];
      await db.query(
        `UPDATE institution_subscriptions SET plan_id=$2,status='active',period_started_at=$3,period_ends_at=$4,updated_at=now() WHERE institution_id=$1`,
        [c.institution_id, v.plan_id, v.paid_at, v.access_until],
      );
    } else {
      await db.query(
        `UPDATE institution_subscriptions SET status='past_due',updated_at=now() WHERE institution_id=$1 AND plan_id IN ('professor','escola')`,
        [c.institution_id],
      );
    }
  });
}
