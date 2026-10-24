'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { BadgePercent, Check, Pencil, Plus, Save, Ticket, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Plan = { id: string; name: string; monthly: number; annual: number };
type Coupon = {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  plan_id: string | null;
  cycle_months: number | null;
  starts_at: string;
  ends_at: string | null;
  max_redemptions: number | null;
  redemptions: number;
  active: boolean;
};
type Values = { plans: Plan[]; coupons: Coupon[] };

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
});
const reaisToCents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);
const centsToReais = (value: number) => (value / 100).toFixed(2).replace('.', ',');
const dateFieldValue = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  : '';

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível salvar as configurações.');
  return body.data;
}

export function SubscriptionAdmin({ apiUrl }: { apiUrl: string }) {
  const [data, setData] = useState<Values | null>(null);
  const [monthly, setMonthly] = useState<Record<string, string>>({});
  const [annual, setAnnual] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    const value = await apiFetch(`${apiUrl}/api/admin/billing-settings`).then(readData<Values>);
    setData(value);
    setMonthly(Object.fromEntries(value.plans.map((plan) => [plan.id, centsToReais(plan.monthly)])));
    setAnnual(Object.fromEntries(value.plans.map((plan) => [plan.id, centsToReais(plan.annual)])));
  }
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/admin/billing-settings`).then(readData<Values>).then((value) => {
      if (!active) return;
      setData(value);
      setMonthly(Object.fromEntries(value.plans.map((plan) => [plan.id, centsToReais(plan.monthly)])));
      setAnnual(Object.fromEntries(value.plans.map((plan) => [plan.id, centsToReais(plan.annual)])));
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Falha ao carregar planos.'); });
    return () => { active = false; };
  }, [apiUrl]);

  async function savePlan(plan: Plan) {
    setBusy(true); setError(''); setMessage('');
    try {
      await apiFetch(`${apiUrl}/api/admin/billing-settings`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId: plan.id,
          monthlyPriceCents: reaisToCents(monthly[plan.id] || ''),
          annualPriceCents: reaisToCents(annual[plan.id] || '') }),
      }).then(readData<Plan>);
      await refresh();
      setMessage(`Valores do plano ${plan.name} atualizados. Novas contratações usarão os preços salvos.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao atualizar o plano.'); }
    finally { setBusy(false); }
  }

  async function saveCoupon(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = (form.get('discountType') as string) as 'percent' | 'fixed';
    const rawValue = (form.get('discountValue') as string | null) || '';
    const discountValue = type === 'fixed' ? reaisToCents(rawValue) : Number(rawValue);
    const ends = (form.get('endsAt') as string | null) || '';
    setBusy(true); setError(''); setMessage('');
    try {
      await apiFetch(`${apiUrl}/api/admin/billing-coupons`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: editing?.id, code: form.get('code'), discountType: type,
          discountValue, planId: form.get('planId') || null,
          cycleMonths: form.get('cycleMonths') || null,
          maxRedemptions: form.get('maxRedemptions') || null,
          endsAt: ends ? new Date(`${ends}T23:59:59-03:00`).toISOString() : null,
          active: editing?.active ?? true }),
      }).then(readData<Coupon>);
      formElement.reset();
      setEditing(null);
      await refresh();
      setMessage('Cupom salvo. O desconto será aplicado às cobranças do período escolhido durante a assinatura.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao salvar o cupom.'); }
    finally { setBusy(false); }
  }

  function editCoupon(coupon: Coupon) {
    setEditing(coupon);
  }

  async function toggleCoupon(coupon: Coupon) {
    setBusy(true); setError(''); setMessage('');
    try {
      await apiFetch(`${apiUrl}/api/admin/billing-coupons`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: coupon.id, code: coupon.code,
          discountType: coupon.discount_type, discountValue: coupon.discount_value,
          planId: coupon.plan_id, cycleMonths: coupon.cycle_months,
          maxRedemptions: coupon.max_redemptions, endsAt: coupon.ends_at,
          active: !coupon.active }),
      }).then(readData<Coupon>);
      await refresh();
      setMessage(coupon.active ? 'Cupom desativado.' : 'Cupom ativado.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao atualizar o cupom.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-5 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="subscription-admin-heading">
    <header className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><BadgePercent aria-hidden="true"/></span>
      <div><h2 id="subscription-admin-heading" className="font-display text-xl font-bold">Preços e cupons</h2><p className="mt-1 text-sm text-slate-600">Gerencie os valores exibidos e os descontos para novas assinaturas.</p></div>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <output className="block rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</output>}
    {!data ? <p className="text-sm text-slate-500">Carregando configurações…</p> : <>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.plans.map((plan) => <article key={plan.id} className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold">Plano {plan.name}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label htmlFor={`monthly-${plan.id}`} className="text-sm">Preço mensal (R$)</label><Input id={`monthly-${plan.id}`} className="mt-1" inputMode="decimal" value={monthly[plan.id] || ''} onChange={(e) => setMonthly((old) => ({ ...old, [plan.id]: e.target.value }))}/></div>
            <div><label htmlFor={`annual-${plan.id}`} className="text-sm">Preço anual (R$)</label><Input id={`annual-${plan.id}`} className="mt-1" inputMode="decimal" value={annual[plan.id] || ''} onChange={(e) => setAnnual((old) => ({ ...old, [plan.id]: e.target.value }))}/></div>
          </div>
          <Button className="mt-3" disabled={busy} onClick={() => { void savePlan(plan); }}><Save aria-hidden="true"/>Salvar valores</Button>
        </article>)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <form key={editing?.id || 'new-coupon'} id="billing-coupon-form" onSubmit={(event) => { void saveCoupon(event); }} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Ticket aria-hidden="true" className="size-4 text-blue-700"/>{editing ? `Editar ${editing.code}` : 'Criar cupom'}</h3>
          <div><label htmlFor="coupon-code" className="block text-sm">Código</label><Input id="coupon-code" className="mt-1 uppercase" name="code" required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9-]{2,23}" placeholder="EXEMPLO10" defaultValue={editing?.code || ''}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="coupon-type" className="text-sm">Desconto</label><select id="coupon-type" name="discountType" defaultValue={editing?.discount_type || 'percent'} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="percent">Percentual</option><option value="fixed">Valor em reais</option></select></div>
            <div><label htmlFor="coupon-value" className="text-sm">Valor</label><Input id="coupon-value" className="mt-1" name="discountValue" required type="number" min="1" step="any" defaultValue={editing ? (editing.discount_type === 'fixed' ? centsToReais(editing.discount_value) : editing.discount_value) : ''} placeholder="10"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="coupon-plan" className="text-sm">Plano</label><select id="coupon-plan" name="planId" defaultValue={editing?.plan_id || ''} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Todos</option><option value="professor">Professor</option><option value="escola">Escola</option></select></div>
            <div><label htmlFor="coupon-cycle" className="text-sm">Periodicidade</label><select id="coupon-cycle" name="cycleMonths" defaultValue={editing?.cycle_months ? String(editing.cycle_months) : ''} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Mensal e anual</option><option value="1">Mensal</option><option value="12">Anual</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="coupon-ends" className="text-sm">Validade até</label><Input id="coupon-ends" className="mt-1" name="endsAt" type="date" defaultValue={dateFieldValue(editing?.ends_at || null)}/></div>
            <div><label htmlFor="coupon-limit" className="text-sm">Limite de usos</label><Input id="coupon-limit" className="mt-1" name="maxRedemptions" type="number" min="1" step="1" defaultValue={editing?.max_redemptions || ''} placeholder="Sem limite"/></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}><Plus aria-hidden="true"/>{editing ? 'Salvar cupom' : 'Criar cupom'}</Button>{editing && <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}><X aria-hidden="true"/>Cancelar edição</Button>}</div>
          <p className="text-xs leading-relaxed text-slate-500">O desconto escolhido reduz cada cobrança recorrente da assinatura enquanto ela permanecer ativa. Preços e cupons novos não alteram contratos existentes.</p>
        </form>
        <section aria-labelledby="coupon-list-title">
          <h3 id="coupon-list-title" className="font-semibold">Cupons cadastrados</h3>
          {!data.coupons.length ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum cupom cadastrado.</p> : <div className="mt-3 space-y-3">{data.coupons.map((coupon) => <article key={coupon.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold"><Ticket aria-hidden="true" className="size-4 text-blue-700"/>{coupon.code}<span className={`rounded-full px-2 py-0.5 text-xs ${coupon.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{coupon.active ? 'Ativo' : 'Inativo'}</span></p><p className="mt-1 text-sm text-slate-600">{coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : money(coupon.discount_value)} · {coupon.plan_id || 'Todos os planos'} · {coupon.cycle_months === 1 ? 'Mensal' : coupon.cycle_months === 12 ? 'Anual' : 'Mensal e anual'}</p><p className="mt-1 text-xs text-slate-500">Usos: {coupon.redemptions}{coupon.max_redemptions ? ` de ${coupon.max_redemptions}` : ''}{coupon.ends_at ? ` · até ${new Date(coupon.ends_at).toLocaleDateString('pt-BR')}` : ''}</p></div><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => editCoupon(coupon)}><Pencil aria-hidden="true"/>Editar</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { void toggleCoupon(coupon); }}>{coupon.active ? <X aria-hidden="true"/> : <Check aria-hidden="true"/>}{coupon.active ? 'Desativar' : 'Ativar'}</Button></div></div>
          </article>)}</div>}
        </section>
      </div>
    </>}
  </section>;
}
