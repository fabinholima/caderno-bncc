'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

type StudentEssay = {
  id: string;
  title: string;
  theme: string;
  className: string;
  appliedOn: string;
  dueAt: string | null;
  status: 'open' | 'closed';
};

const formatDate = (value: string) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString('pt-BR');

// Propostas de redação que o professor liberou para a turma do aluno.
export function StudentEssays({ apiUrl }: { apiUrl: string }) {
  const [essays, setEssays] = useState<StudentEssay[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/student/essays`)
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: StudentEssay[];
          error?: string;
        };
        if (!response.ok)
          throw Error(body.error || 'Não foi possível carregar as redações.');
        if (active) setEssays(body.data || []);
      })
      .catch(
        (error) =>
          active &&
          setMessage(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      active = false;
    };
  }, [apiUrl]);
  async function open(essay: StudentEssay) {
    setBusy(essay.id);
    setMessage('');
    // Abre a aba antes do download para o navegador não bloquear o pop-up.
    const tab = window.open('', '_blank');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/student/essays/${essay.id}/proposal.pdf`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw Error(body.error || 'Não foi possível abrir a proposta.');
      }
      const url = URL.createObjectURL(await response.blob());
      (tab ?? window).location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (error) {
      tab?.close();
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <h2 className="mt-6 font-semibold">Propostas de redação</h2>
      {message && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {message}
        </p>
      )}
      {!essays.length && !message && (
        <p className="mt-2 text-sm">Nenhuma proposta de redação disponível.</p>
      )}
      {essays.map((essay) => (
        <article key={essay.id} className="mt-3 rounded-xl border p-3">
          <b>{essay.title}</b>
          <p className="text-sm">{essay.theme}</p>
          <p className="text-sm text-slate-600">
            {essay.className} · aplicada em {formatDate(essay.appliedOn)}
            {essay.dueAt ? ` · entrega até ${formatDate(essay.dueAt)}` : ''}
            {essay.status === 'closed' ? ' · encerrada' : ''}
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            disabled={busy === essay.id}
            onClick={() => open(essay)}
          >
            {busy === essay.id ? 'Gerando PDF…' : 'Abrir proposta e folha'}
          </Button>
        </article>
      ))}
    </>
  );
}
