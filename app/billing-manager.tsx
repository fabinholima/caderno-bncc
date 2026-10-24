'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Billing = {
  enabled: boolean;
  plans: { id: string; name: string; monthly: number; annual: number }[];
  contract: {
    status: string;
    plan_id: string;
    months: number;
    amount_cents: number;
    base_amount_cents?: number | null;
    discount_cents?: number;
    coupon_code?: string | null;
  } | null;
  payments: {
    status: string;
    amount_cents: number;
    paid_at: string | null;
    access_until: string | null;
  }[];
};
type CouponPreview = {
  planId: string;
  months: number;
  baseAmountCents: number;
  amountCents: number;
  discountCents: number;
  couponCode: string | null;
};
const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels: Record<string, string> = {
  creating: 'Contratação em processamento',
  pending: 'Aguardando autorização',
  authorized: 'Renovação autorizada',
  paused: 'Renovação pausada',
  cancelled: 'Renovação cancelada',
  approved: 'Pago',
  rejected: 'Recusado',
  refunded: 'Estornado',
  charged_back: 'Contestado',
};

async function loadBilling(apiUrl: string) {
  const response = await apiFetch(`${apiUrl}/api/billing`);
  const body = await response.json() as { error?: string; data?: Billing };
  if (!response.ok || !body.data)
    throw new Error(body.error || 'Não foi possível consultar a assinatura.');
  return body.data;
}

export function BillingManager({
  apiUrl,
  role,
}: {
  apiUrl: string;
  role: string;
}) {
  const [data, setData] = useState<Billing | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  async function refresh() {
    try {
      setData(await loadBilling(apiUrl));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha na conexão.');
    }
  }
  useEffect(() => {
    let active = true;
    loadBilling(apiUrl).then((value) => {
      if (active) setData(value);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : 'Falha na conexão.');
    });
    return () => { active = false; };
  }, [apiUrl]);
  async function validateCoupon(plan: string) {
    setBusy(true);
    setMessage('');
    setCouponPreview(null);
    try {
      const response = await apiFetch(`${apiUrl}/api/billing/coupon/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, cycle, couponCode }),
      });
      const body = await response.json() as { error?: string; data?: CouponPreview };
      if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível validar o cupom.');
      setCouponPreview(body.data);
      setMessage(`Cupom ${body.data.couponCode} aplicado: desconto de ${money(body.data.discountCents)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao validar o cupom.');
    } finally { setBusy(false); }
  }
  async function action(kind: 'checkout' | 'cancel', plan?: string) {
    const appliedCoupon = kind === 'checkout' && couponPreview && couponPreview.planId === plan &&
      couponPreview.months === (cycle === 'annual' ? 12 : 1) ? couponPreview : null;
    if (
      kind === 'cancel' &&
      !window.confirm(
        'Cancelar as próximas cobranças? O acesso já pago será mantido até o fim do período. Isso não solicita reembolso.',
      )
    )
      return;
    if (
      kind === 'checkout' &&
      !window.confirm(
        `Continuar para contratar ${plan === 'professor' ? 'Professor' : 'Escola'} com renovação ${cycle === 'annual' ? 'anual' : 'mensal'}${appliedCoupon ? ` por ${money(appliedCoupon.amountCents)} (cupom ${appliedCoupon.couponCode})` : ''} no Mercado Pago?`,
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(`${apiUrl}/api/billing/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, cycle, couponCode: appliedCoupon?.couponCode || undefined }),
      });
      const body = await response.json() as { error?: string; data?: { url?: string; cancelled?: boolean } };
      if (!response.ok)
        throw new Error(body.error || 'Operação não confirmada.');
      if (body.data?.url) {
        window.location.assign(body.data.url);
        return;
      }
      setMessage(
        'Renovação cancelada. O período já pago permanece disponível.',
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-5 rounded-2xl border bg-white p-5"
      aria-labelledby="billing-heading"
    >
      <h2 id="billing-heading" className="font-display text-xl font-bold">
        Minha assinatura · Mercado Pago
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Pagamento em ambiente seguro do Mercado Pago. O plano é liberado após
        confirmação, não apenas ao retornar do checkout.
      </p>
      {message && (
        <output className="mt-3 block rounded-lg bg-blue-50 p-3 text-sm">
          {message}
        </output>
      )}
      {!data ? (
        <p className="mt-3">Assinatura ainda não carregada.</p>
      ) : (
        <>
          {!data.enabled && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
              Cobranças desativadas. É necessário configurar o Mercado Pago e
              entrar com autenticação real.
            </p>
          )}
          {data.contract && (
            <p className="mt-3 text-sm">
              {data.contract.plan_id} ·{' '}
              {labels[data.contract.status] || data.contract.status} ·{' '}
              {money(data.contract.amount_cents)} /{' '}
              {data.contract.months === 12 ? 'ano' : 'mês'}
              {data.contract.coupon_code && data.contract.discount_cents ? ` · cupom ${data.contract.coupon_code} (${money(data.contract.discount_cents)} de desconto)` : ''}
            </p>
          )}
          {role === 'admin' ? (
            <>
              <label className="mt-4 block text-sm">
                Periodicidade
                <select
                  className="ml-3 rounded-lg border p-2"
                  value={cycle}
                  onChange={(e) =>
                    { setCycle(e.target.value as 'monthly' | 'annual'); setCouponPreview(null); }
                  }
                >
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual (cobrança única por ano)</option>
                </select>
              </label>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-medium" htmlFor="subscription-coupon">Cupom de desconto</label>
                <input id="subscription-coupon" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponPreview(null); }} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" placeholder="Digite o código" maxLength={24} />
                <p className="mt-2 text-xs text-slate-500">Depois, selecione “Validar cupom neste plano” no cartão da assinatura.</p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {data.plans.map((plan) => (
                  <article key={plan.id} className="rounded-xl border p-4">
                    <h3 className="font-bold">{plan.name}</h3>
                    <p className="my-2 text-xl">
                      {money(plan[cycle])}
                      <span className="text-sm text-slate-500">
                        {' '}
                        / {cycle === 'annual' ? 'ano' : 'mês'}
                      </span>
                    </p>
                    <button
                      className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-40"
                      disabled={
                        busy ||
                        !data.enabled ||
                        Boolean(
                          data.contract &&
                          !['pending', 'cancelled'].includes(
                            data.contract.status,
                          ),
                        )
                      }
                      onClick={() => action('checkout', plan.id)}
                    >
                      Continuar no Mercado Pago
                    </button>
                    {couponCode.trim() && <button type="button" className="ml-2 mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void validateCoupon(plan.id)}>Validar cupom neste plano</button>}
                    {couponPreview?.planId === plan.id && couponPreview.months === (cycle === 'annual' ? 12 : 1) && <p className="mt-2 text-sm text-emerald-700">Com cupom: <b>{money(couponPreview.amountCents)}</b> · desconto de {money(couponPreview.discountCents)}</p>}
                  </article>
                ))}
              </div>
              {data.contract && data.contract.status !== 'cancelled' && (
                <button
                  className="mt-4 rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
                  disabled={busy || !data.enabled}
                  onClick={() => action('cancel')}
                >
                  Cancelar renovação / contratação pendente
                </button>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm">
              Somente o administrador pode contratar ou cancelar.
            </p>
          )}
          <button
            className="ml-3 mt-4 text-sm underline"
            disabled={busy}
            onClick={refresh}
          >
            Atualizar status
          </button>
          <h3 className="mt-5 font-semibold">Últimos pagamentos</h3>
          {!data.payments.length ? (
            <p className="mt-2 text-sm text-slate-500">
              Nenhum pagamento confirmado nesta instituição.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {data.payments.map((p, i) => (
                <li key={i}>
                  {p.paid_at
                    ? new Date(p.paid_at).toLocaleDateString('pt-BR')
                    : 'Sem data de pagamento'}{' '}
                  · {money(p.amount_cents)} · {labels[p.status] || p.status}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
