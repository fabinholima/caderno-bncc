'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  School,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { ApiBody } from './model';

// Painel da Gestão Acadêmica com dados de GET /api/academic-dashboard.
// Professores veem só as próprias turmas; a gestão vê a instituição.

type Dashboard = {
  scope: 'institution' | 'teacher';
  students: number;
  teachers: number | null;
  activeClasses: number;
  closedClasses: number;
  activeEnrollments: number;
  academicYears: number;
  outcomes: Record<
    'promoted' | 'retained' | 'transferred' | 'graduated' | 'dropped' | 'pending',
    number
  >;
  pending: {
    scansInReview: number;
    scansProcessing: number;
    resultsUnpublished: number;
    enrollmentsWithoutOutcome: number;
  };
  years: Array<{
    year: number;
    status: string;
    classes: number;
    activeEnrollments: number;
    totalEnrollments: number;
  }>;
};

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span aria-hidden="true" className="text-blue-600 [&>svg]:size-4">
          {icon}
        </span>
        {label}
      </div>
      <p className="font-display mt-2 text-3xl font-bold tabular-nums text-[var(--navy)]">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function AcademicDashboardPanel({
  apiUrl,
  onOpenPanel,
}: {
  apiUrl: string;
  onOpenPanel: (panel: 'years' | 'correction' | 'results') => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/academic-dashboard`);
      const body = (await response.json()) as ApiBody<Dashboard>;
      if (!response.ok || !body.data)
        throw new Error(body.error || 'Não foi possível carregar o painel.');
      setData(body.data);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  if (!data)
    return (
      <section className="mt-5">
        {error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
          >
            {error}
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Carregando indicadores…
          </p>
        )}
      </section>
    );

  const pendingItems = [
    {
      count: data.pending.scansInReview,
      text: 'cartão(ões) aguardando revisão',
      panel: 'correction' as const,
    },
    {
      count: data.pending.scansProcessing,
      text: 'cartão(ões) na fila de leitura',
      panel: 'correction' as const,
    },
    {
      count: data.pending.resultsUnpublished,
      text: 'nota(s) prontas e ainda não publicadas',
      panel: 'results' as const,
    },
    {
      count: data.pending.enrollmentsWithoutOutcome,
      text: 'matrícula(s) sem situação acadêmica em ano já terminado',
      panel: 'years' as const,
    },
  ].filter((item) => item.count > 0);
  const maxEnrollments = Math.max(
    1,
    ...data.years.map((item) => item.totalEnrollments),
  );

  return (
    <section className="mt-5 grid gap-5" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {data.scope === 'teacher'
            ? 'Indicadores das suas turmas.'
            : 'Indicadores de toda a instituição.'}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Atualizar
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Users />} label="Alunos" value={data.students} />
        {data.teachers != null && (
          <Stat
            icon={<UserCheck />}
            label="Equipe com vínculo ativo"
            value={data.teachers}
            hint="Administração, coordenação e professores"
          />
        )}
        <Stat
          icon={<School />}
          label="Turmas ativas"
          value={data.activeClasses}
          hint={
            data.closedClasses
              ? `${data.closedClasses} encerrada(s) ou arquivada(s)`
              : undefined
          }
        />
        <Stat
          icon={<ClipboardCheck />}
          label="Matrículas ativas"
          value={data.activeEnrollments}
        />
        <Stat
          icon={<CalendarRange />}
          label="Anos letivos"
          value={data.academicYears}
        />
        <Stat
          icon={<GraduationCap />}
          label="Promovidos"
          value={data.outcomes.promoted}
        />
        <Stat icon={<Users />} label="Reprovados" value={data.outcomes.retained} />
        <Stat
          icon={<Users />}
          label="Transferidos"
          value={data.outcomes.transferred}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
            Pendências acadêmicas
          </h2>
          {pendingItems.length ? (
            <ul className="mt-3 grid gap-2">
              {pendingItems.map((item) => (
                <li key={item.text}>
                  <button
                    type="button"
                    onClick={() => onOpenPanel(item.panel)}
                    className="flex w-full items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-950 hover:bg-amber-100"
                  >
                    <span className="font-display text-xl font-bold tabular-nums">
                      {item.count}
                    </span>
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              Nenhuma pendência no momento.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <CalendarRange className="size-5 text-blue-600" aria-hidden="true" />
            Matrículas por ano letivo
          </h2>
          {data.years.length ? (
            <ul className="mt-4 grid gap-3">
              {data.years.map((item) => (
                <li key={item.year} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{item.year}</span>
                    <span className="text-slate-500">
                      {item.totalEnrollments} matrícula(s) · {item.classes}{' '}
                      turma(s)
                    </span>
                  </div>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${item.year}: ${item.activeEnrollments} ativas de ${item.totalEnrollments} matrículas`}
                  >
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${(item.totalEnrollments / maxEnrollments) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Nenhum ano letivo cadastrado.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
