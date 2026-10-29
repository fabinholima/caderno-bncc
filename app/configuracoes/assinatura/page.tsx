'use client';

import { useEffect, useState } from 'react';
import { BarChart3, CreditCard, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { BillingManager } from '../../billing-manager';
import { useSettingsApiUrl, useSettingsRole } from '../settings-layout';

type Usage = {
  name: string;
  status: string;
  monthly_assessments: number;
  assessments_used: number;
  max_students: number;
  students_used: number;
  period_ends_at: string;
};

const statusLabels: Record<string, string> = {
  active: 'Ativa',
  trialing: 'Período de avaliação',
  past_due: 'Pagamento pendente',
  cancelled: 'Cancelada',
  paused: 'Pausada',
};

function UsageMeter({ label, used, limit, icon }: {
  label: string;
  used: number;
  limit: number;
  icon: 'assessments' | 'students';
}) {
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const Icon = icon === 'assessments' ? BarChart3 : Users;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon aria-hidden="true" className="size-4 text-blue-700" />{label}</p>
        <p className="text-sm tabular-nums text-slate-600">{used} / {limit}</p>
      </div>
      <progress aria-label={label} className={`mt-3 block h-2 w-full overflow-hidden rounded-full ${percentage >= 100 ? 'accent-rose-600' : percentage >= 80 ? 'accent-amber-500' : 'accent-blue-700'}`} value={Math.min(used, limit)} max={Math.max(limit, 1)} />
      {percentage >= 80 && <p className={`mt-2 text-xs ${percentage >= 100 ? 'font-semibold text-rose-700' : 'text-amber-700'}`}>{percentage >= 100 ? 'Limite do plano atingido.' : 'Você está perto do limite do plano.'}</p>}
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const apiUrl = useSettingsApiUrl();
  const role = useSettingsRole();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/subscription`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: Usage | null; error?: string };
        if (!response.ok) throw new Error(body.error || 'Não foi possível consultar o plano.');
        if (active) setUsage(body.data || null);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Falha ao consultar a assinatura.');
      });
    return () => { active = false; };
  }, [apiUrl]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Conta · cobrança</p>
        <h2 className="mt-1 text-2xl font-bold">Minha assinatura</h2>
        <p className="mt-2 text-sm text-slate-600">Consulte o plano da sua instituição, acompanhe os limites e veja os pagamentos.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

      {usage ? (
        <section aria-labelledby="current-plan-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-blue-800"><CreditCard aria-hidden="true" className="size-4" />Plano atual</p>
              <h3 id="current-plan-heading" className="mt-2 text-xl font-bold">{usage.name}</h3>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${usage.status === 'active' || usage.status === 'trialing' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              {statusLabels[usage.status] || usage.status}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <UsageMeter label="Avaliações neste mês" used={usage.assessments_used} limit={usage.monthly_assessments} icon="assessments" />
            <UsageMeter label="Alunos ativos" used={usage.students_used} limit={usage.max_students} icon="students" />
          </div>
          <p className="mt-4 text-sm text-slate-600">Período atual até <strong>{new Date(usage.period_ends_at).toLocaleDateString('pt-BR')}</strong>.</p>
        </section>
      ) : !error ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Carregando dados do plano…</section>
      ) : null}

      <BillingManager apiUrl={apiUrl} role={role === 'admin' ? 'admin' : role} />
    </div>
  );
}
