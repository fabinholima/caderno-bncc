'use client';
import { useEffect, useState } from 'react';
import { GraduationCap, LoaderCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api-client';
import type { ApiBody } from './model';

// Linha do tempo acadêmica: um cartão por matrícula (ano letivo, série,
// turma, escola), com as provas e o desempenho. Vem de
// GET /api/students/:id/timeline (equipe) ou GET /api/student/history (aluno,
// só notas publicadas).

export type TimelineEntry = {
  id: string;
  year: number;
  institutionName: string;
  schoolName: string | null;
  className: string;
  gradeLevel: string;
  status: 'active' | 'completed' | 'transferred' | 'dropped' | 'cancelled';
  academicOutcome: string;
  entryDate: string;
  exitDate: string | null;
  averagePercent: number | null;
  assessments: Array<{
    resultId: string | null;
    title: string;
    subject: string;
    scheduledAt: string | null;
    percent: number | null;
    correctCount: number | null;
    validCount: number | null;
    published: boolean;
  }>;
};

const enrollmentStatus: Record<TimelineEntry['status'], [string, string]> = {
  active: ['Matrícula ativa', 'bg-emerald-100 text-emerald-800'],
  completed: ['Concluída', 'bg-blue-100 text-blue-800'],
  transferred: ['Transferido', 'bg-amber-100 text-amber-800'],
  dropped: ['Abandono', 'bg-rose-100 text-rose-800'],
  cancelled: ['Cancelada', 'bg-slate-200 text-slate-700'],
};

export const outcomeLabel: Record<string, string> = {
  pending: 'Aguardando decisão',
  promoted: 'Promovido',
  retained: 'Reprovado',
  transferred: 'Transferido',
  dropped: 'Abandonou',
  recovery: 'Em recuperação',
  graduated: 'Concluinte',
  cancelled: 'Matrícula cancelada',
};

const formatDate = (value: string | null) =>
  value ? value.split('-').reverse().join('/') : '';

export function StudentHistoryTimeline({
  entries,
  staffView = false,
}: {
  entries: TimelineEntry[];
  // Equipe vê também notas ainda não publicadas (marcadas como tal).
  staffView?: boolean;
}) {
  if (!entries.length)
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Ainda não há matrículas registradas no histórico.
      </p>
    );
  return (
    <ol className="relative grid gap-4 border-l-2 border-blue-100 pl-5">
      {entries.map((entry) => {
        const [statusText, statusTone] = enrollmentStatus[entry.status];
        return (
          <li key={entry.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[29px] top-4 grid size-4 place-items-center rounded-full border-2 border-white bg-blue-600"
            />
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-[var(--navy)]">
                  {entry.year} · {entry.gradeLevel}
                </h3>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-0.5 ${statusTone}`}>
                    {statusText}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
                    {outcomeLabel[entry.academicOutcome] ??
                      entry.academicOutcome}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Turma {entry.className} ·{' '}
                {entry.schoolName || entry.institutionName}
              </p>
              <p className="text-xs text-slate-500">
                Entrada em {formatDate(entry.entryDate)}
                {entry.exitDate ? ` · saída em ${formatDate(entry.exitDate)}` : ''}
              </p>
              {entry.assessments.length ? (
                <>
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">
                      {entry.assessments.length} prova(s)
                    </span>
                    {entry.averagePercent != null &&
                      ` · média de aproveitamento ${entry.averagePercent.toLocaleString('pt-BR')}%`}
                  </p>
                  <ul className="mt-2 grid gap-1.5">
                    {entry.assessments.map((item, index) => (
                      <li
                        key={item.resultId ?? `${item.title}-${index}`}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {item.title}
                          </span>
                          <span className="text-xs text-slate-500">
                            {item.subject}
                            {staffView && item.percent != null && !item.published
                              ? ' · nota não publicada'
                              : ''}
                          </span>
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums">
                          {item.percent == null ? (
                            <span className="text-xs font-normal text-slate-500">
                              Sem nota
                            </span>
                          ) : (
                            <>
                              {item.percent.toLocaleString('pt-BR')}%
                              {item.validCount ? (
                                <span className="block text-xs font-normal text-slate-500">
                                  {item.correctCount}/{item.validCount} acertos
                                </span>
                              ) : null}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Nenhuma prova registrada nesta matrícula.
                </p>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

/** Janela com o histórico de um aluno, para a equipe. */
export function StudentHistoryDialog({
  apiUrl,
  student,
  onClose,
}: {
  apiUrl: string;
  student: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    id: string;
    entries?: TimelineEntry[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!student) return;
    let live = true;
    apiFetch(`${apiUrl}/api/students/${student.id}/timeline`)
      .then(async (response) => {
        const body = (await response.json()) as ApiBody<{
          timeline: TimelineEntry[];
        }>;
        if (!response.ok || !body.data)
          throw new Error(body.error || 'Não foi possível abrir o histórico.');
        if (live) setState({ id: student.id, entries: body.data.timeline });
      })
      .catch((error: Error) => {
        if (live) setState({ id: student.id, error: error.message });
      });
    return () => {
      live = false;
    };
  }, [apiUrl, student]);
  const current = state && student && state.id === student.id ? state : null;
  return (
    <Dialog open={Boolean(student)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="size-5 text-blue-600" aria-hidden="true" />
            Histórico acadêmico · {student?.name}
          </DialogTitle>
          <DialogDescription>
            Matrículas de todos os anos letivos nesta instituição, com as provas
            e o aproveitamento. Registros encerrados são preservados.
          </DialogDescription>
        </DialogHeader>
        {!current ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Carregando histórico…
          </p>
        ) : current.error ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
            {current.error}
          </p>
        ) : (
          <StudentHistoryTimeline entries={current.entries ?? []} staffView />
        )}
      </DialogContent>
    </Dialog>
  );
}
