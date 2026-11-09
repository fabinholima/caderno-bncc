'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { EducatorProfile } from '../../educator-profile';
import { useSettingsApiUrl } from '../settings-layout';

const outline =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60';

// Encerra as sessões em outros navegadores, celulares e no aplicativo.
function SessionSecurity({ apiUrl }: { apiUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logoutAll() {
    if (
      !window.confirm(
        'Sair de todos os dispositivos, inclusive deste? Será preciso entrar de novo em cada um.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/auth/logout-all`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error();
      window.location.assign('/portal');
    } catch {
      setError('Não foi possível encerrar as sessões. Tente novamente.');
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="session-security-title"
      className="mx-auto mt-6 max-w-[1500px] px-4 pb-8 sm:px-6 lg:px-8"
    >
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2
          id="session-security-title"
          className="text-base font-semibold text-slate-900"
        >
          Segurança da conta
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Perdeu um celular ou entrou num computador compartilhado? Encerre
          todas as sessões abertas com a sua conta.
        </p>
        <button
          type="button"
          className={`${outline} mt-3`}
          disabled={busy}
          onClick={logoutAll}
        >
          {busy ? 'Encerrando…' : 'Sair de todos os dispositivos'}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function ProfileSettingsPage() {
  const apiUrl = useSettingsApiUrl();
  return (
    <>
      <EducatorProfile
        apiUrl={apiUrl}
        section="profile"
        onNavigateSection={(view) => {
          if (view === 'schools')
            window.location.assign('/configuracoes/escolas');
        }}
      />
      <SessionSecurity apiUrl={apiUrl} />
    </>
  );
}
