'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CalendarPlus,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { formString } from '@/lib/form-data';
import type { ApiBody } from './model';

type AcademicYear = {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  status: 'planning' | 'active' | 'closing' | 'closed' | 'archived';
  closedAt: string | null;
  classCount: number;
  activeEnrollmentCount: number;
};

const statusLabel: Record<AcademicYear['status'], [string, string]> = {
  planning: ['Planejamento', 'bg-slate-100 text-slate-700'],
  active: ['Ativo', 'bg-emerald-100 text-emerald-800'],
  closing: ['Em encerramento', 'bg-amber-100 text-amber-800'],
  closed: ['Encerrado', 'bg-blue-100 text-blue-800'],
  archived: ['Arquivado', 'bg-slate-200 text-slate-700'],
};

const formatDate = (value: string | null) =>
  value ? value.split('-').reverse().join('/') : '—';

/**
 * Anos letivos da instituição. A administração e a coordenação cadastram,
 * editam o período, ativam, excluem (só ano vazio) e arquivam (sem matrículas
 * ativas); só o administrador reabre um ano arquivado. As regras são
 * validadas no servidor (services/api/academic-years.mjs).
 */
export function AcademicYearsPanel({
  apiUrl,
  canManage,
  canReopen,
}: {
  apiUrl: string;
  canManage: boolean;
  canReopen: boolean;
}) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AcademicYear['status']>(
    '',
  );

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await apiFetch(`${apiUrl}/api/academic-years${path}`, {
        ...init,
        headers: init?.body
          ? { 'content-type': 'application/json' }
          : undefined,
      });
      const body = (await response.json()) as ApiBody<T>;
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível concluir a ação.');
      return body.data as T;
    },
    [apiUrl],
  );

  const load = useCallback(async () => {
    try {
      setYears(await request<AcademicYear[]>(''));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const run = async (
    id: string,
    action: () => Promise<unknown>,
    done: string,
  ) => {
    setBusy(id);
    setMessage('');
    try {
      await action();
      setMessage(done);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };

  const create = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const year = Number(formString(data, 'year'));
    const startDate = formString(data, 'startDate') || null;
    const endDate = formString(data, 'endDate') || null;
    return run(
      'new',
      async () => {
        await request('', {
          method: 'POST',
          body: JSON.stringify({ year, startDate, endDate }),
        });
        form.reset();
      },
      `Ano letivo ${year} cadastrado em planejamento.`,
    );
  };

  const saveEdit = (form: HTMLFormElement, item: AcademicYear) => {
    const data = new FormData(form);
    return run(
      item.id,
      async () => {
        await request(`/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            startDate: formString(data, 'startDate') || null,
            endDate: formString(data, 'endDate') || null,
          }),
        });
        setEditing(null);
      },
      `Período de ${item.year} atualizado.`,
    );
  };

  const remove = (item: AcademicYear) => {
    if (
      !window.confirm(
        `Excluir o ano letivo ${item.year}? Só é possível quando ele não tem turmas nem matrículas.`,
      )
    )
      return;
    void run(
      item.id,
      () => request(`/${item.id}`, { method: 'DELETE' }),
      `Ano letivo ${item.year} excluído.`,
    );
  };

  const archive = (item: AcademicYear) => {
    const reason = window.prompt(
      `Arquivar o ano letivo ${item.year}? As turmas deixam de ser operacionais e não aceitam novas matrículas; provas, notas e históricos continuam disponíveis para consulta.\n\nMotivo (opcional):`,
      '',
    );
    if (reason === null) return;
    void run(
      item.id,
      () =>
        request(`/${item.id}/archive`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        }),
      `Ano letivo ${item.year} arquivado.`,
    );
  };

  const reopen = (item: AcademicYear) => {
    const reason = window.prompt(
      `Reabrir excepcionalmente o ano letivo ${item.year}? Informe o motivo (fica registrado na auditoria):`,
      '',
    );
    if (reason === null) return;
    void run(
      item.id,
      () =>
        request(`/${item.id}/reopen`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }),
      `Ano letivo ${item.year} reaberto.`,
    );
  };

  const activate = (item: AcademicYear) =>
    void run(
      item.id,
      () =>
        request(`/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
        }),
      `Ano letivo ${item.year} ativado.`,
    );

  const visibleYears = years.filter(
    (item) =>
      (!yearFilter || String(item.year).includes(yearFilter)) &&
      (!statusFilter || item.status === statusFilter),
  );
  const nextYear =
    (years.reduce((max, item) => Math.max(max, item.year), 0) ||
      new Date().getFullYear() - 1) + 1;

  return (
    <section className="mt-5 grid gap-5">
      {message && (
        <output className="block rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </output>
      )}
      {canManage ? (
        <form
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void create(event.currentTarget);
          }}
        >
          <h2 className="font-display flex items-center gap-2 text-lg font-bold sm:col-span-4">
            <CalendarPlus className="size-5 text-blue-600" aria-hidden="true" />
            Cadastrar ano letivo
          </h2>
          <label
            htmlFor="new-year-year"
            className="grid gap-1 text-sm font-medium"
          >
            Ano
            <Input
              id="new-year-year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              required
              defaultValue={nextYear}
              key={nextYear}
            />
          </label>
          <label
            htmlFor="new-year-startDate"
            className="grid gap-1 text-sm font-medium"
          >
            Início das aulas
            <Input id="new-year-startDate" name="startDate" type="date" />
          </label>
          <label
            htmlFor="new-year-endDate"
            className="grid gap-1 text-sm font-medium"
          >
            Término das aulas
            <Input id="new-year-endDate" name="endDate" type="date" />
          </label>
          <Button type="submit" disabled={busy === 'new'}>
            {busy === 'new' ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <CalendarPlus aria-hidden="true" />
            )}
            Cadastrar
          </Button>
          <p className="text-xs text-slate-500 sm:col-span-4">
            O ano começa em planejamento. Turmas criadas para um ano ainda não
            cadastrado geram o ano automaticamente, já ativo.
          </p>
        </form>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Somente a administração ou a coordenação cadastra e arquiva anos
          letivos.
        </p>
      )}

      {years.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="years-filter-year" className="grid gap-1 text-sm font-medium">
            Ano
            <Input
              id="years-filter-year"
              inputMode="numeric"
              placeholder="Ex.: 2026"
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value.trim())}
              className="w-32"
            />
          </label>
          <label htmlFor="years-filter-status" className="grid gap-1 text-sm font-medium">
            Situação
            <select
              id="years-filter-status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Todas</option>
              {Object.entries(statusLabel).map(([value, [text]]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          {(yearFilter || statusFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setYearFilter('');
                setStatusFilter('');
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-3">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Carregando anos letivos…
          </p>
        )}
        {!loading && !years.length && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Nenhum ano letivo cadastrado ainda.
          </p>
        )}
        {!loading && years.length > 0 && !visibleYears.length && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Nenhum ano letivo com esses filtros.
          </p>
        )}
        {visibleYears.map((item) => {
          const [label, tone] = statusLabel[item.status];
          const open = ['planning', 'active'].includes(item.status);
          const closed = ['closing', 'closed', 'archived'].includes(
            item.status,
          );
          const isBusy = busy === item.id;
          return (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-2xl font-bold text-[var(--navy)]">
                    {item.year}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}
                  >
                    {label}
                  </span>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'planning' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => activate(item)}
                      >
                        <CheckCircle2 aria-hidden="true" />
                        Ativar
                      </Button>
                    )}
                    {open && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() =>
                          setEditing(editing?.id === item.id ? null : item)
                        }
                      >
                        <Pencil aria-hidden="true" />
                        Período
                      </Button>
                    )}
                    {item.status !== 'archived' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        title={
                          item.activeEnrollmentCount
                            ? 'Retire ou promova os alunos das turmas antes de arquivar.'
                            : undefined
                        }
                        onClick={() => archive(item)}
                      >
                        <Archive aria-hidden="true" />
                        Arquivar
                      </Button>
                    )}
                    {closed && canReopen && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => reopen(item)}
                      >
                        <RotateCcw aria-hidden="true" />
                        Reabrir
                      </Button>
                    )}
                    {item.classCount === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-700"
                        disabled={isBusy}
                        onClick={() => remove(item)}
                      >
                        <Trash2 aria-hidden="true" />
                        Excluir
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Início</dt>
                  <dd className="font-medium">{formatDate(item.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Término</dt>
                  <dd className="font-medium">{formatDate(item.endDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Turmas</dt>
                  <dd className="font-medium">{item.classCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Matrículas ativas</dt>
                  <dd className="font-medium">{item.activeEnrollmentCount}</dd>
                </div>
              </dl>
              {editing?.id === item.id && (
                <form
                  className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit(event.currentTarget, item);
                  }}
                >
                  <label
                    htmlFor={`${item.id}-startDate`}
                    className="grid gap-1 text-sm font-medium"
                  >
                    Início das aulas
                    <Input
                      id={`${item.id}-startDate`}
                      name="startDate"
                      type="date"
                      defaultValue={item.startDate ?? ''}
                    />
                  </label>
                  <label
                    htmlFor={`${item.id}-endDate`}
                    className="grid gap-1 text-sm font-medium"
                  >
                    Término das aulas
                    <Input
                      id={`${item.id}-endDate`}
                      name="endDate"
                      type="date"
                      defaultValue={item.endDate ?? ''}
                    />
                  </label>
                  <Button type="submit" disabled={isBusy}>
                    Salvar período
                  </Button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
