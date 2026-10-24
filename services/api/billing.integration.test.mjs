import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test(
  'billing lifecycle in isolated PostgreSQL schema (no real charges)',
  { skip: !process.env.BILLING_TEST_DATABASE_URL },
  async () => {
    const { default: pg } = await import('pg');
    const schema = `billing_test_${randomUUID().replaceAll('-', '')}`;
    const control = new pg.Pool({
      connectionString: process.env.BILLING_TEST_DATABASE_URL,
    });
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.BILLING_TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.href;
    process.env.MP_BILLING_ENABLED = 'true';
    process.env.MP_ACCESS_TOKEN = 'test-only';
    process.env.MP_WEBHOOK_SECRET = 'test-secret';
    process.env.MP_BACK_URL = 'https://example.com/portal';
    process.env.DEV_AUTH_BYPASS = 'false';
    const { pool } = await import('./db.mjs');
    const { createCheckout, billingStatus, cancelBilling, billingWebhook, previewBillingCoupon } =
      await import('./billing.mjs');
    const originalFetch = globalThis.fetch;
    let creates = 0;
    let paymentStatus = 'approved';
    let providerStatus = 'pending';
    let paymentAmount = 49.9;
    let expectedCheckoutAmount = 49.9;
    let refundedAmount = 0;
    let ref;
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname;
      let data;
      if (path === '/preapproval' && options.method === 'POST') {
        creates++;
        const body = JSON.parse(options.body);
        ref = body.external_reference;
        assert.equal(body.auto_recurring.transaction_amount, expectedCheckoutAmount);
        assert.equal(body.status, 'pending');
        data = {
          id: `sub${creates}`,
          init_point: `https://www.mercadopago.com.br/subscriptions/checkout?id=sub${creates}`,
        };
      } else if (path === '/preapproval/sub1') {
        if (options.method === 'PUT') providerStatus = 'cancelled';
        data = { id: 'sub1', external_reference: ref, status: providerStatus };
      } else if (path === '/authorized_payments/invoice1') {
        data = { preapproval_id: 'sub1', payment: { id: 'payment1' } };
      } else if (path === '/v1/payments/payment1') {
        data = {
          id: 'payment1',
          transaction_amount: paymentAmount,
          transaction_amount_refunded: refundedAmount,
          currency_id: 'BRL',
          status: paymentStatus,
          date_approved: new Date().toISOString(),
        };
      } else throw new Error(`Unexpected test request: ${path}`);
      return { ok: true, json: async () => data };
    };
    const notify = (type, id, valid = true) => {
      const sig = createHmac('sha256', valid ? 'test-secret' : 'wrong')
        .update(`id:${id};request-id:req;ts:123;`)
        .digest('hex');
      return billingWebhook(
        {
          headers: { 'x-signature': `ts=123,v1=${sig}`, 'x-request-id': 'req' },
        },
        new URL(`https://example.com/api/billing/webhook?data.id=${id}`),
        { type, data: { id } },
      );
    };
    try {
      await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE user_sessions(id uuid PRIMARY KEY); CREATE TABLE institutions(id uuid PRIMARY KEY);
      CREATE TABLE subscription_plans(id text PRIMARY KEY,name text,monthly_assessments int,max_students int,storage_mb int,concurrent_renders int);
      CREATE TABLE institution_subscriptions(institution_id uuid PRIMARY KEY,plan_id text,status text,period_started_at timestamptz,period_ends_at timestamptz,updated_at timestamptz);
      CREATE TABLE audit_log(id bigserial PRIMARY KEY,user_id uuid,action text,entity_type text,entity_id text,metadata jsonb);`);
      await pool.query(
        await readFile(
          new URL('../../database/041_mercado_pago.sql', import.meta.url),
          'utf8',
        ),
      );
      await pool.query(await readFile(new URL('../../database/047_admin_reporting.sql',import.meta.url),'utf8'));
      await pool.query(await readFile(new URL('../../database/095_billing_prices_and_coupons.sql',import.meta.url),'utf8'));
      const identity = {
        institutionId: randomUUID(),
        role: 'admin',
        email: 'buyer@example.com',
      };
      const other = { ...identity, institutionId: randomUUID() };
      await pool.query('INSERT INTO institutions(id) VALUES($1),($2)', [
        identity.institutionId,
        other.institutionId,
      ]);
      await pool.query(
        `INSERT INTO institution_subscriptions(institution_id,plan_id,status,period_started_at,period_ends_at) VALUES($1,'trial','trialing',now(),now()+interval '7 days')`,
        [identity.institutionId],
      );
      await assert.rejects(
        createCheckout({ ...identity, role: 'teacher' }, {}),
        /administrador/,
      );
      await assert.rejects(
        createCheckout({ ...identity, developmentBypass: true }, {}),
        /administrador/,
      );
      const link = await createCheckout(identity, {
        plan: 'professor',
        cycle: 'monthly',
        amount: 1,
      });
      assert.match(link.url, /mercadopago/);
      await createCheckout(identity, { plan: 'professor', cycle: 'monthly' });
      assert.equal(creates, 1);
      assert.equal((await billingStatus(other)).contract, null);
      await assert.rejects(
        notify('subscription_preapproval', 'sub1', false),
        /inválida/,
      );
      providerStatus = 'authorized';
      await notify('subscription_preapproval', 'sub1');
      assert.equal(
        (await pool.query('SELECT status FROM institution_subscriptions'))
          .rows[0].status,
        'trialing',
      );
      paymentAmount = 1;
      await assert.rejects(
        notify('subscription_authorized_payment', 'invoice1'),
        /incompatível/,
      );
      paymentAmount = 49.9;
      await notify('subscription_authorized_payment', 'invoice1');
      await notify('subscription_authorized_payment', 'invoice1');
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM billing_payments'))
          .rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            'SELECT status,plan_id FROM institution_subscriptions',
          )
        ).rows[0].plan_id,
        'professor',
      );
      await cancelBilling(other);
      assert.equal(providerStatus, 'authorized');
      await cancelBilling(identity);
      assert.equal(providerStatus, 'cancelled');
      assert.equal(
        (await pool.query('SELECT status FROM institution_subscriptions'))
          .rows[0].status,
        'active',
      );
      await assert.rejects(
        createCheckout(identity, { plan: 'escola', cycle: 'monthly' }),
        /período pago/,
      );
      refundedAmount = 10;
      await notify('payment', 'payment1');
      await notify('payment', 'payment1');
      refundedAmount = 20;
      await notify('payment', 'payment1');
      paymentStatus = 'refunded';
      refundedAmount = paymentAmount;
      await notify('payment', 'payment1');
      await notify('payment', 'payment1');
      assert.equal((await pool.query('SELECT count(*)::int n,sum(amount_cents)::int cents FROM billing_refund_events')).rows[0].n,3);
      assert.equal((await pool.query('SELECT sum(amount_cents)::int cents FROM billing_refund_events')).rows[0].cents,4990);
      assert.equal(
        (await pool.query('SELECT status FROM institution_subscriptions'))
          .rows[0].status,
        'past_due',
      );

      const couponBuyer = { ...identity, institutionId: randomUUID() };
      await pool.query('INSERT INTO institutions(id) VALUES($1)', [couponBuyer.institutionId]);
      await pool.query(`INSERT INTO institution_subscriptions(institution_id,plan_id,status,period_started_at,period_ends_at)
        VALUES($1,'trial','trialing',now(),now()+interval '7 days')`, [couponBuyer.institutionId]);
      await pool.query(`INSERT INTO billing_coupons(code,discount_type,discount_value,plan_id,cycle_months,max_redemptions)
        VALUES('TEST10','percent',10,'professor',1,1)`);
      const couponPreview = await previewBillingCoupon(couponBuyer, {
        plan: 'professor', cycle: 'monthly', couponCode: 'test10',
      });
      assert.equal(couponPreview.baseAmountCents, 4990);
      assert.equal(couponPreview.discountCents, 499);
      assert.equal(couponPreview.amountCents, 4491);
      expectedCheckoutAmount = 44.91;
      const discountedLink = await createCheckout(couponBuyer, {
        plan: 'professor', cycle: 'monthly', couponCode: 'TEST10',
      });
      assert.match(discountedLink.url, /mercadopago/);
      await assert.rejects(previewBillingCoupon(couponBuyer, {
        plan: 'professor', cycle: 'monthly', couponCode: 'TEST10',
      }), /já utilizou/);
      await assert.rejects(previewBillingCoupon(other, {
        plan: 'professor', cycle: 'monthly', couponCode: 'TEST10',
      }), /limite de utilizações/);
    } finally {
      globalThis.fetch = originalFetch;
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
