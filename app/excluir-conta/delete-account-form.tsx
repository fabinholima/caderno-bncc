'use client';
/* oxlint-disable next/no-html-link-for-pages -- No app publicado (vinext), o <Link> do Next não navega: o clique fica na mesma página ("RSC prefetch setup error"). Use <a> com navegação completa. */
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Me = { user?: { displayName?: string; email?: string | null } };
type State = 'loading' | 'signed-out' | 'ready' | 'deleted';

// Exclusão da conta pela web (link exigido pela Play Store). Usa a sessão do
// portal; quem não está logado entra no portal e depois abre esta página de novo.
export function DeleteAccountForm() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? process.env.NODE_ENV === 'production' ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:8788` : '');
  const [state, setState] = useState<State>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/auth/me`, { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) return setState('signed-out');
        setMe(((await response.json()) as { data: Me }).data);
        setState('ready');
      })
      .catch(() => active && setState('signed-out'));
    return () => { active = false; };
  }, [apiUrl]);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/account/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm, ...(password ? { password } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Não foi possível excluir a conta.');
      setPassword('');
      setState('deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir a conta.');
    } finally {
      setBusy(false);
    }
  }
  if (state === 'loading') return <p className="text-slate-500">Verificando sua sessão…</p>;
  if (state === 'deleted')
    return <p className="rounded-2xl bg-green-50 p-4 font-semibold text-green-800">Sua conta foi excluída e você saiu de todos os aparelhos.</p>;
  if (state === 'signed-out')
    return (
      <div className="space-y-3">
        <p>Para excluir a conta, entre com ela no portal e depois abra de novo <b>ufaprova.com.br/excluir-conta</b>.</p>
        <a href="/portal" className="inline-block rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Entrar no portal</a>
        <p className="text-sm text-slate-500">Alunos que entram só pelo aplicativo, com o código da escola, podem excluir a conta no próprio app: <b>Excluir minha conta</b>, no fim da tela do aluno. Se não conseguir entrar, fale conosco pela <a href="/contato" className="font-semibold text-blue-700">página de contato</a>.</p>
      </div>
    );
  const ready = confirm.trim().toUpperCase() === 'EXCLUIR' && !busy;
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (ready) void submit(); }}>
      <p>Conta: <b>{me?.user?.displayName}</b>{me?.user?.email ? ` (${me.user.email})` : ''}</p>
      <label className="block">
        <span className="text-sm font-semibold">Senha atual</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Em branco se você entra só com o Google" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Digite EXCLUIR para confirmar</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
      </label>
      {!!error && <p role="alert" className="font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={!ready} className="rounded-xl bg-red-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Excluindo…' : 'Excluir conta definitivamente'}</button>
    </form>
  );
}
