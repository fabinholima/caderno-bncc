'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

type Subscription = {
  name: string;
  status: string;
  monthly_assessments: number;
  assessments_used: number;
  max_students: number;
  students_used: number;
  storage_mb: number;
  concurrent_renders: number;
  period_ends_at: string;
};

export function SettingsManager({
  apiUrl,
  role,
}: {
  apiUrl: string;
  role: string;
}) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    apiFetch(`${apiUrl}/api/subscription`)
      .then((response) => response.json())
      .then((body) => setSubscription(body.data || null))
      .catch(() => setMessage('Não foi possível consultar o plano.'));
  }, [apiUrl]);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await apiFetch(`${apiUrl}/api/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: data.get('email'),
        role: data.get('role'),
      }),
    });
    const body = (await response.json()) as {
      error?: string;
      data?: { developmentToken?: string };
    };
    if (!response.ok) return setMessage(body.error || 'Convite não criado.');
    form.reset();
    setMessage(
      body.data?.developmentToken
        ? `Convite criado. Token local: ${body.data.developmentToken}`
        : 'Convite enviado por e-mail.',
    );
  }
  return (
    <main className="mx-auto max-w-[1100px] px-5 py-7 sm:px-8 sm:py-9">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-600">
        Administração
      </p>
      <h1 className="font-display mt-1 text-3xl font-bold">Configurações</h1>
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="text-blue-600" />
            <h2 className="font-display text-xl font-bold">Plano e consumo</h2>
          </div>
          {subscription ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <b>{subscription.name}</b> · {subscription.status}
              </p>
              <Usage
                label="Avaliações no mês"
                used={subscription.assessments_used}
                limit={subscription.monthly_assessments}
              />
              <Usage
                label="Alunos ativos"
                used={subscription.students_used}
                limit={subscription.max_students}
              />
              <p>Armazenamento: {subscription.storage_mb} MB</p>
              <p>Composições simultâneas: {subscription.concurrent_renders}</p>
              <p className="text-slate-500">
                Período até{' '}
                {new Date(subscription.period_ends_at).toLocaleDateString(
                  'pt-BR',
                )}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Carregando plano...</p>
          )}
        </section>
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <UserPlus className="text-blue-600" />
            <h2 className="font-display text-xl font-bold">
              Convidar professor
            </h2>
          </div>
          {['admin', 'coordinator'].includes(role) ? (
            <form className="mt-4 space-y-3" onSubmit={invite}>
              <Input
                type="email"
                name="email"
                required
                placeholder="professor@escola.com"
              />
              <select
                name="role"
                className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
              >
                <option value="teacher">Professor</option>
                <option value="coordinator">Coordenador</option>
                {role === 'admin' && (
                  <option value="admin">Administrador</option>
                )}
              </select>
              <Button type="submit" className="w-full">
                Criar convite
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Apenas administradores e coordenadores podem convidar usuários.
            </p>
          )}
        </section>
      </div>
      <section className="mt-5 rounded-2xl border bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-emerald-600" />
          <h2 className="font-display text-xl font-bold">Segurança</h2>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Sessões expiram em 30 dias, senhas usam scrypt com salt individual e
          ações administrativas são separadas por instituição.
        </p>
      </section>
    </main>
  );
}

function Usage({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between">
        <span>{label}</span>
        <b>
          {used}/{limit}
        </b>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-blue-600"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
