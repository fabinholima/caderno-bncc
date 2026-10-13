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
  approved: number;
  rejected: number;
  results: Array<{
    id: string;
    approved: boolean;
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
      q.status === 'Em revisão' &&
      Number.isInteger(q.revision) &&
      Number(q.revision) > 0,
  );
  const selected = eligible.filter((q) => choices[q.id] === q.revision);
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
  async function approve() {
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/questions/status/bulk-approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: selected.map((q) => ({
              id: q.id,
              revision: q.revision,
            })),
            reason,
          }),
        },
      );
      const body = (await response.json()) as { data?: Result; error?: string };
      if (!response.ok || !body.data)
        throw new Error(body.error || 'Não foi possível aprovar as questões.');
      setResult({
        ...body.data,
        results: body.data.results.map((item) => ({
          ...item,
          code:
            item.code ||
            selected.find((question) => question.id === item.id)?.code,
        })),
      });
      setChoices({});
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
        error instanceof Error ? error.message : 'Falha na aprovação em lote.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return children;
  return (
    <Context.Provider value={{ busy, selected, eligible, toggle, toggleAll }}>
      <div className="border-b border-blue-100 bg-blue-50/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="text-sm text-slate-800">Aprovação em lote</strong>
          <span className="text-xs text-slate-600">
            {selected.length} selecionadas · somente questões visíveis em
            revisão · até 100 por lote
          </span>
          <Button
            type="button"
            size="sm"
            disabled={busy || !selected.length}
            onClick={() => void approve()}
          >
            {busy ? 'Aprovando…' : 'Aprovar selecionadas'}
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
              {result.approved} aprovadas; {result.rejected} não aprovadas.
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
                    : {r.approved ? 'Aprovada' : r.error}
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
      </div>
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
            ? `Selecionar ${question.code} para aprovação`
            : 'Selecionar até 100 questões visíveis em revisão'
        }
        title={
          !eligible
            ? 'Somente questões em revisão podem ser aprovadas'
            : undefined
        }
        onChange={() =>
          question ? selection.toggle(question) : selection.toggleAll()
        }
      />
    </label>
  );
}
