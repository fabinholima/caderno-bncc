'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const inviteKey = 'ufaprova:convite';

/**
 * Guarda o token do link de convite (#convite=…) até a pessoa entrar na conta.
 * Fica no sessionStorage para sobreviver ao login e ao retorno do Google.
 */
export function captureInvitationToken() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('convite');
  if (!token) return;
  try {
    window.sessionStorage.setItem(inviteKey, token);
  } catch {
    // Sem armazenamento: o link continua na barra de endereço até o aceite.
    return;
  }
  params.delete('convite');
  const hash = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`,
  );
}

function storedInvitation() {
  try {
    return (
      window.sessionStorage.getItem(inviteKey) ||
      new URLSearchParams(window.location.hash.slice(1)).get('convite') ||
      ''
    );
  } catch {
    return '';
  }
}

function forgetInvitation() {
  try {
    window.sessionStorage.removeItem(inviteKey);
  } catch {
    // nada a limpar
  }
}

export function PendingInvitation({ apiUrl }: { apiUrl: string }) {
  const [token, setToken] = useState(() =>
    typeof window === 'undefined' ? '' : storedInvitation(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!token) return null;
  async function accept() {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/invitations/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível aceitar o convite.');
      forgetInvitation();
      window.location.reload();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Falha de conexão.',
      );
      setBusy(false);
    }
  }
  function dismiss() {
    forgetInvitation();
    setToken('');
  }
  return (
    <section
      aria-label="Convite para a equipe"
      className="mx-5 mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800 sm:mx-8"
    >
      <p className="font-semibold">Você recebeu um convite para uma equipe.</p>
      <p className="mt-1 text-slate-600">
        O convite precisa ter sido enviado para o e-mail desta conta. Ao
        aceitar, a instituição passa a aparecer no seletor do topo da página.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={accept}
          className="rounded-lg bg-blue-700 px-3 py-2 font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Aceitando…' : 'Aceitar convite'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={dismiss}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium"
        >
          Agora não
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export type InstitutionOption = { id: string; name: string; role: string };

/** Nome da instituição ativa; vira um seletor quando a conta participa de mais de uma. */
export function InstitutionSwitcher({
  apiUrl,
  current,
  institutions,
}: {
  apiUrl: string;
  current: { id: string; name: string };
  institutions?: InstitutionOption[];
}) {
  const [busy, setBusy] = useState(false);
  if (!institutions || institutions.length < 2)
    return <p className="text-xs font-semibold">{current.name}</p>;
  async function change(institutionId: string) {
    setBusy(true);
    const response = await apiFetch(`${apiUrl}/api/auth/institution`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ institutionId }),
    }).catch(() => null);
    if (response?.ok) window.location.reload();
    else {
      window.alert('Não foi possível trocar de instituição.');
      setBusy(false);
    }
  }
  return (
    <select
      aria-label="Instituição ativa"
      value={current.id}
      disabled={busy}
      onChange={(event) => change(event.target.value)}
      className="max-w-[220px] truncate rounded-md border border-slate-200 bg-white py-0.5 text-xs font-semibold"
    >
      {institutions.map((institution) => (
        <option key={institution.id} value={institution.id}>
          {institution.name}
        </option>
      ))}
    </select>
  );
}
