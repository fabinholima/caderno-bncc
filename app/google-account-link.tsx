'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

export function GoogleAccountLink({ apiUrl, email }: { apiUrl: string; email: string }) {
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
            Vincule o Google que usa <b>{email}</b>. Depois, poderá entrar com sua senha ou com esse Google.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void startLink()} className="shrink-0 gap-2">
          <Link2 size={16} aria-hidden="true" />
          {busy ? 'Conectando…' : 'Vincular Google'}
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
