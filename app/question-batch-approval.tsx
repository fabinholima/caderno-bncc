'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
type Question = { id: string; code: string; status: string; revision?: number };
type Selection = {
  busy: boolean;
  selected: Question[];
  eligible: Question[];
  toggle: (q: Question) => void;
  toggleAll: () => void;
};
const Context = createContext<Selection | null>(null);
type Result = {
  completed: number;
  status: 'review' | 'approved';
  rejected: number;
  results: Array<{
    id: string;
    completed: boolean;
    code?: string;
    error?: string;
  }>;
};
export function QuestionBatchApproval({
  questions,
  apiUrl,
  enabled,
  onChanged,
  children,
}: {
  questions: Question[];
  apiUrl: string;
  enabled: boolean;
  onChanged: () => Promise<void>;
  children: ReactNode;
}) {
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const eligible = questions.filter(
    (q) =>
      ['Rascunho', 'Precisa de ajustes', 'Em revisão'].includes(q.status) &&
      Number.isInteger(q.revision) &&
      Number(q.revision) > 0,
  );
  const selected = eligible.filter((q) => choices[q.id] === q.revision);
  const pendingReview = selected.filter((q) => q.status !== 'Em revisão');
  function toggle(q: Question) {
    setChoices((current) => {
      const next = Object.fromEntries(
        selected.map((item) => [item.id, item.revision!]),
      );
      if (current[q.id] === q.revision) delete next[q.id];
      else if (Object.keys(next).length < 100) next[q.id] = q.revision!;
      return next;
    });
  }
  function toggleAll() {
    setChoices(
      selected.length === Math.min(eligible.length, 100)
        ? {}
        : Object.fromEntries(
            eligible.slice(0, 100).map((q) => [q.id, q.revision!]),
          ),
    );
  }
  async function applyStatus(status: 'review' | 'approved') {
    const targets = status === 'review' ? pendingReview : selected;
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/questions/status/${status === 'review' ? 'bulk-review' : 'bulk-approve'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: targets.map((q) => ({
              id: q.id,
              revision: q.revision,
            })),
            reason,
          }),
        },
      );
      const body = (await response.json()) as {
        data?: {
          approved?: number;
          updated?: number;
          rejected: number;
          results: Array<{
            id: string;
            approved?: boolean;
            updated?: boolean;
            code?: string;
            error?: string;
          }>;
        };
        error?: string;
      };
      if (!response.ok || !body.data)
        throw new Error(
          body.error || 'Não foi possível atualizar a situação das questões.',
        );
      setResult({
        completed: body.data.approved ?? body.data.updated ?? 0,
        rejected: body.data.rejected,
        status,
        results: body.data.results.map((item) => ({
          ...item,
          completed: Boolean(item.approved ?? item.updated),
          code:
            item.code ||
            selected.find((question) => question.id === item.id)?.code,
        })),
      });
      setChoices(
        status === 'review'
          ? Object.fromEntries(selected.map((q) => [q.id, q.revision!]))
          : {},
      );
      setReason('');
      try {
        await onChanged();
      } catch {
        setMessage(
          'A operação foi concluída, mas não foi possível atualizar a lista. Recarregue a página.',
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Falha na alteração de situação em lote.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return children;
  return (
    <Context.Provider value={{ busy, selected, eligible, toggle, toggleAll }}>
      {(selected.length > 0 || result || message) && <div className="sticky top-0 z-10 border-b border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="text-sm text-slate-800">Situação em lote</strong>
          <span className="text-xs text-slate-600">
            {selected.length} selecionadas · {pendingReview.length} para enviar
            à revisão · até 100 por lote
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !pendingReview.length}
            onClick={() => void applyStatus('review')}
          >
            Enviar selecionadas para revisão
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !selected.length || pendingReview.length > 0}
            onClick={() => void applyStatus('approved')}
          >
            {busy ? 'Atualizando…' : 'Aprovar selecionadas'}
          </Button>
          {!!selected.length && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setChoices({})}
            >
              Limpar seleção
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Selecione os rascunhos e envie para revisão. Depois confira as
          questões e clique em Aprovar selecionadas. Questões aprovadas ou
          arquivadas não são selecionáveis.
        </p>
        {!!selected.length && (
          <label className="mt-3 block max-w-xl text-xs text-slate-600">
            Observação para o histórico (opcional)
            <textarea
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm"
              value={reason}
              maxLength={1000}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {result && (
          <div className="mt-3 text-sm" aria-live="polite">
            <p>
              {result.completed}{' '}
              {result.status === 'review'
                ? 'enviadas para revisão'
                : 'aprovadas'}
              ; {result.rejected} não atualizadas.
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer">
                Ver resultado por questão
              </summary>
              <ul className="mt-2 space-y-1">
                {result.results.map((r) => (
                  <li key={r.id}>
                    {r.code ||
                      questions.find((q) => q.id === r.id)?.code ||
                      r.id}
                    :{' '}
                    {r.completed
                      ? result.status === 'review'
                        ? 'Em revisão'
                        : 'Aprovada'
                      : r.error}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
        {message && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {message}
          </p>
        )}
      </div>}
      {children}
    </Context.Provider>
  );
}
export function QuestionApprovalCheckbox({
  question,
}: {
  question?: Question;
}) {
  const selection = useContext(Context);
  if (!selection) return null;
  const eligible = question
    ? selection.eligible.some((q) => q.id === question.id)
    : selection.eligible.length > 0;
  const checked = question
    ? selection.selected.some((q) => q.id === question.id)
    : selection.selected.length > 0 &&
      selection.selected.length === Math.min(selection.eligible.length, 100);
  return (
    <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
      <input
        type="checkbox"
        ref={(node) => {
          if (node)
            node.indeterminate =
              !question && selection.selected.length > 0 && !checked;
        }}
        className="size-4 accent-blue-600"
        checked={checked}
        disabled={
          selection.busy ||
          !eligible ||
          Boolean(question && !checked && selection.selected.length >= 100)
        }
        aria-label={
          question
            ? `Selecionar ${question.code} para alterar situação`
            : 'Selecionar até 100 questões visíveis para revisão ou aprovação'
        }
        title={
          !eligible
            ? 'Questões aprovadas, arquivadas ou sem revisão carregada não são selecionáveis'
            : undefined
        }
        onChange={() =>
          question ? selection.toggle(question) : selection.toggleAll()
        }
      />
    </label>
  );
}
