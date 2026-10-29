'use client';

import { useState } from 'react';
import { CheckCircle2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

export function GoogleAccountLink({ apiUrl, email, linked }: { apiUrl: string; email: string; linked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startLink() {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/auth/google/link/start`, { method: 'POST' });
      const body = await response.json() as { data?: { url: string }; error?: string };
      if (!response.ok || !body.data?.url) throw new Error(body.error || 'Não foi possível iniciar a vinculação.');
      window.location.assign(body.data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar a vinculação Google.');
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">Conta Google</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {linked
              ? <>O Google com o e-mail <b>{email}</b> está vinculado. Você pode entrar no portal com sua senha ou com esse Google.</>
              : <>Vincule o Google que usa <b>{email}</b>. Depois, poderá entrar com sua senha ou com esse Google.</>}
          </p>
        </div>
        <Button type="button" variant="outline" disabled={busy || linked} onClick={() => void startLink()} className={`shrink-0 gap-2 ${linked ? 'border-emerald-200 bg-emerald-50 text-emerald-800 opacity-100' : ''}`}>
          {linked ? <CheckCircle2 size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          {linked ? 'Google vinculado' : busy ? 'Conectando…' : 'Vincular Google'}
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
