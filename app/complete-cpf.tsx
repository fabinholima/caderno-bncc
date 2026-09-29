'use client';
import { type SubmitEvent, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export function CompleteCpf({ apiUrl }: { apiUrl: string }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const cpf = new FormData(event.currentTarget).get('cpf');
    try {
      const response = await apiFetch(`${apiUrl}/api/auth/complete-cpf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar.');
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    const response = await apiFetch(`${apiUrl}/api/auth/logout`, { method: 'POST' });
    if (response.ok) window.location.reload();
    else setMessage('Não foi possível sair. Tente novamente.');
  }
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-5"><section className="w-full max-w-md rounded-3xl border bg-white p-7">
    <h1 className="text-2xl font-bold">Complete seu cadastro</h1>
    <p className="my-4 text-sm text-slate-600">Agora usamos CPF para impedir contas duplicadas. Seus dados e questões existentes serão mantidos. O CPF não será armazenado em texto aberto.</p>
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="complete-cpf">CPF do titular</label>
      <input id="complete-cpf" name="cpf" required maxLength={14} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className="w-full rounded-lg border p-3" />
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-700 p-3 text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar e continuar'}</button>
    </form>
    {message && <output className="mt-3 block text-sm">{message}</output>}
    <button type="button" onClick={() => { void logout().catch(() => setMessage('Falha de conexão.')); }} className="mt-4 text-sm underline">Sair desta conta</button>
  </section></main>;
}
