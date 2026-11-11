'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  FileOutput,
  LibraryBig,
  ScanLine,
  ChartNoAxesCombined,
  Sprout,
  Plus,
  RotateCcw,
  MoreHorizontal,
  ClipboardList,
  Users,
  CircleCheck,
  CircleDashed,
  PencilLine,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api-client';
import { questionBankSummary } from '@/lib/question-bank-summary.mjs';
import { AssessmentPdfPreview } from './assessment-pdf-preview';

const steps = [
  {
    label: 'Preparar',
    icon: BookOpenCheck,
    description: 'Questões aprovadas e avaliações alinhadas à BNCC.',
  },
  {
    label: 'Corrigir',
    icon: ScanLine,
    description: 'Envie cartões-resposta e confira as leituras.',
  },
  {
    label: 'Diagnosticar',
    icon: ChartNoAxesCombined,
    description: 'Consulte resultados por habilidade e competência.',
  },
  {
    label: 'Recuperar',
    icon: Sprout,
    description: 'Organize a intervenção e uma nova avaliação.',
  },
] as const;
type RecentQuestion = {
  id: string;
  code: string;
  subject: string;
  status: string;
  statement?: string;
  updatedAt?: string;
};
type Assessment = {
  id: string;
  title: string;
  grade: string;
  createdAt?: string;
  versionCount?: number;
};
type RegeneratedJob = {
  code: string;
  renderJobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
};
type Application = {
  id: string;
  title: string;
  className: string;
  completed: number;
  students: number;
  status: string;
  scheduledAt?: string | null;
};
// Situação da questão com cor e ícone próprios (nunca só a cor).
const questionStatus: Record<
  string,
  { className: string; icon: typeof CircleCheck }
> = {
  Aprovada: { className: 'bg-emerald-50 text-emerald-800', icon: CircleCheck },
  'Em revisão': { className: 'bg-blue-50 text-blue-800', icon: CircleDashed },
  'Precisa de ajustes': {
    className: 'bg-amber-50 text-amber-800',
    icon: TriangleAlert,
  },
  Rascunho: { className: 'bg-slate-100 text-slate-700', icon: PencilLine },
};
const shortDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
      })
    : '';
type HomeData = {
  questions: RecentQuestion[];
  assessments: Assessment[];
  applications: Application[];
};

export function WorkspaceHome({
  apiUrl,
  name,
  view,
  canEditCatalog,
  canPurge = false,
  onNavigate,
  onNewQuestion,
  onEditQuestion,
  onOpenApplication,
}: {
  apiUrl: string;
  name: string;
  view: string;
  canEditCatalog: boolean;
  canPurge?: boolean;
  onNavigate: (view: string) => void;
  onNewQuestion: () => void;
  onEditQuestion: (id: string) => void;
  onOpenApplication: (id: string) => void;
}) {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState(
    apiUrl ? '' : 'Conecte o serviço para consultar suas atividades.',
  );
  const [reload, setReload] = useState(0);
  const [regeneratingId, setRegeneratingId] = useState('');
  const [regenerated, setRegenerated] = useState<{
    assessmentId: string;
    jobs: RegeneratedJob[];
  } | null>(null);
  const [regenerationError, setRegenerationError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  async function deleteSavedAssessment(assessment: Assessment) {
    if (
      !window.confirm(
        `Excluir a prova “${assessment.title}”? Os PDFs e as versões dela serão removidos.`,
      )
    )
      return;
    setDeletingId(assessment.id);
    setRegenerationError('');
    try {
      const remove = (query = '') =>
        apiFetch(`${apiUrl}/api/assessments/${assessment.id}${query}`, {
          method: 'DELETE',
        });
      let response = await remove();
      let body = (await response.json()) as { error?: string };
      if (
        response.status === 409 &&
        canPurge &&
        window.confirm(
          `${body.error || 'A prova tem aplicações ou respostas.'}\n\nComo administrador, você pode excluir DEFINITIVAMENTE a prova com aplicações, cartões-resposta e notas. Não é possível desfazer. Continuar?`,
        )
      ) {
        response = await remove('?purge=true');
        body = (await response.json()) as { error?: string };
      }
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível excluir a prova.');
      setReload((value) => value + 1);
    } catch (cause) {
      setRegenerationError(
        cause instanceof Error ? cause.message : 'Falha ao excluir a prova.',
      );
    } finally {
      setDeletingId('');
    }
  }
  async function regenerateSavedAssessment(assessmentId: string) {
    setRegeneratingId(assessmentId);
    setRegenerationError('');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/assessments/${assessmentId}/renders`,
        { method: 'POST' },
      );
      const body = (await response.json()) as {
        data?: RegeneratedJob[];
        error?: string;
      };
      if (!response.ok || !body.data?.length)
        throw new Error(
          body.error || 'Não foi possível gerar os PDFs novamente.',
        );
      setRegenerated({ assessmentId, jobs: body.data });
    } catch (cause) {
      setRegenerationError(
        cause instanceof Error ? cause.message : 'Falha ao gerar os PDFs.',
      );
    } finally {
      setRegeneratingId('');
    }
  }
  useEffect(() => {
    if (
      !regenerated?.jobs.some(
        (job) => job.status === 'queued' || job.status === 'running',
      )
    )
      return;
    const timer = window.setInterval(async () => {
      const jobs = await Promise.all(
        regenerated.jobs.map(async (job) => {
          if (job.status === 'completed' || job.status === 'failed') return job;
          try {
            const response = await apiFetch(
              `${apiUrl}/api/render-jobs/${job.renderJobId}`,
            );
            const body = (await response.json()) as {
              data?: {
                status: RegeneratedJob['status'];
                error?: string | null;
              };
            };
            return response.ok && body.data ? { ...job, ...body.data } : job;
          } catch {
            return job;
          }
        }),
      );
      setRegenerated((current) =>
        current?.assessmentId === regenerated.assessmentId
          ? { ...current, jobs }
          : current,
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, [apiUrl, regenerated]);
  useEffect(() => {
    let cancelled = false;
    async function load<T>(path: string): Promise<T[]> {
      const response = await apiFetch(`${apiUrl}/api/${path}`);
      const body = (await response.json()) as { data?: T[] };
      if (!response.ok || !Array.isArray(body.data))
        throw new Error(
          'Não foi possível carregar suas atividades. Tente novamente.',
        );
      return body.data;
    }
    if (!apiUrl) {
      return;
    }
    Promise.all([
      load<RecentQuestion>('questions'),
      load<Assessment>('assessments'),
      load<Application>('assessment-applications'),
    ])
      .then(([questions, assessments, applications]) => {
        if (!cancelled) setData({ questions, assessments, applications });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl, reload]);
  const activeQuestions =
    data?.questions.filter((q) => q.status !== 'Arquivada') || [];
  const approved = activeQuestions.filter(
    (q) => q.status === 'Aprovada',
  ).length;
  const review = activeQuestions.filter(
    (q) => q.status === 'Em revisão' || q.status === 'Precisa de ajustes',
  ).length;
  const applications =
    data?.applications.filter((a) => a.status !== 'cancelled') || [];
  const completed = applications[0];
  const pendingPdfs = applications.filter(
    (a) => a.completed < a.students,
  ).length;
  const recovery = view === 'Recuperar';
  const preparing = view === 'Preparar';
  const home = !recovery && !preparing;
  const firstName = name.split(' ')[0];
  const next = completed
    ? {
        title: 'Acompanhe os resultados da turma',
        text: `${completed.title} · ${completed.className}. Os resultados por habilidade aparecem conforme as correções forem concluídas.`,
        label: 'Ver relatório',
        action: () => onOpenApplication(completed.id),
      }
    : approved
      ? {
          title: 'Transforme questões em avaliação',
          text: `Você tem ${approved} ${approved === 1 ? 'questão aprovada' : 'questões aprovadas'} prontas para montar uma prova.`,
          label: 'Montar avaliação',
          action: () => onNavigate('Avaliações'),
        }
      : {
          title: 'Prepare o banco de questões',
          text: 'Somente questões aprovadas entram nas avaliações. Cadastre ou importe questões e envie para revisão.',
          label: 'Abrir banco',
          action: () => onNavigate('Questões'),
        };
  const stats = [
    {
      label: 'Questões aprovadas',
      value: approved,
      detail: `${activeQuestions.length} no banco`,
      icon: LibraryBig,
      view: 'Questões',
    },
    {
      label: 'Em revisão ou ajustes',
      value: review,
      detail: review ? 'Aguardando revisão' : 'Nada pendente',
      icon: CircleDashed,
      view: 'Questões',
    },
    {
      label: 'Avaliações',
      value: data?.assessments.length ?? 0,
      detail: 'Provas montadas',
      icon: FileOutput,
      view: 'Avaliações',
    },
    {
      label: 'Aplicações',
      value: applications.length,
      detail: pendingPdfs ? `${pendingPdfs} com PDFs pendentes` : 'PDFs em dia',
      icon: ClipboardList,
      view: 'Diagnosticar',
    },
  ];
  return (
    <div className="mx-auto max-w-[1450px] space-y-6 px-5 py-7 sm:px-8 sm:py-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--blue)]">
            Seu espaço de trabalho
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--navy)] sm:text-4xl">
            {recovery
              ? 'Da dificuldade à intervenção'
              : preparing
                ? 'Prepare sua próxima avaliação'
                : `Olá, ${firstName}`}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {recovery
              ? 'Use as prioridades dos relatórios para planejar atividades e acompanhar a aprendizagem.'
              : 'Prepare, corrija, acompanhe as dificuldades e reavalie sua turma.'}
          </p>
        </div>
        {home && (
          <div className="flex flex-wrap gap-2">
            {canEditCatalog && (
              <Button variant="outline" onClick={onNewQuestion}>
                <Plus aria-hidden="true" />
                Nova questão
              </Button>
            )}
            <Button variant="outline" onClick={() => onNavigate('Corrigir')}>
              <ScanLine aria-hidden="true" />
              Enviar cartões
            </Button>
            <Button
              className="order-first sm:order-last"
              onClick={() => onNavigate('Avaliações')}
            >
              <FileOutput aria-hidden="true" />
              Nova avaliação
            </Button>
          </div>
        )}
      </header>

      {!home && (
        <nav aria-label="Etapas do trabalho" className="flex flex-wrap gap-2">
          {steps.map(({ label, icon: Icon }, index) => (
            <button
              type="button"
              key={label}
              onClick={() => onNavigate(label)}
              aria-current={view === label ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${view === label ? 'border-[var(--navy)] bg-[var(--navy)] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="text-xs opacity-70">0{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error}
          <Button
            variant="outline"
            onClick={() => {
              setData(null);
              setError(
                apiUrl
                  ? ''
                  : 'Conecte o serviço para consultar suas atividades.',
              );
              setReload((n) => n + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : !data ? (
        <output className="block text-sm text-slate-600">
          Carregando suas atividades…
        </output>
      ) : null}

      {recovery ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold text-[var(--navy)]">
            Organize a recuperação da turma
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            O planejamento da intervenção é feito pelo professor. A geração
            automática de planos ainda não está disponível.
          </p>
          <ol className="mt-5 grid gap-4 lg:grid-cols-3">
            {[
              {
                title: '1. Consulte as prioridades',
                text: 'Abra o relatório de uma aplicação corrigida e identifique as habilidades com maior dificuldade.',
                label: 'Ver relatórios',
                view: 'Diagnosticar',
              },
              {
                title: '2. Planeje a intervenção',
                text: 'Consulte o catálogo, escolha o objeto de conhecimento e prepare atividades para os erros observados.',
                label: 'Consultar planejamento BNCC',
                view: 'Planejamento',
              },
              {
                title: '3. Reavalie a aprendizagem',
                text: 'Monte outra avaliação com questões aprovadas da mesma habilidade e acompanhe a evolução.',
                label: 'Preparar nova avaliação',
                view: 'Avaliações',
              },
            ].map((item, index) => (
              <li
                key={item.title}
                className="flex flex-col rounded-xl border border-slate-200 p-4"
              >
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 flex-1 text-sm text-slate-600">
                  {item.text}
                </p>
                <Button
                  variant={index === 2 ? 'default' : 'outline'}
                  className="mt-3 self-start"
                  onClick={() => onNavigate(item.view)}
                >
                  {item.label}
                </Button>
              </li>
            ))}
          </ol>
        </section>
      ) : preparing ? (
        <section className="grid gap-3 lg:grid-cols-3">
          <HomeAction
            icon={LibraryBig}
            title="Banco de questões"
            description={
              data
                ? `${approved} aprovadas · ${review} em revisão ou com ajustes`
                : 'Filtre por disciplina, série e habilidade'
            }
            onClick={() => onNavigate('Questões')}
            label="Consultar"
          />
          <HomeAction
            icon={FileOutput}
            title="Montar uma avaliação"
            description="Selecione questões aprovadas e gere os cadernos e gabaritos."
            onClick={() => onNavigate('Avaliações')}
            label="Preparar"
          />
          <HomeAction
            icon={BookOpenCheck}
            title="Planejamento BNCC"
            description="Consulte habilidades, competências e tópicos do catálogo."
            onClick={() => onNavigate('Planejamento')}
            label="Consultar"
          />
        </section>
      ) : (
        <>
          <section
            aria-label="Resumo"
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            {stats.map(({ label, value, detail, icon: Icon, view: target }) => (
              <button
                type="button"
                key={label}
                onClick={() => onNavigate(target)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-sm sm:p-5"
              >
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <Icon
                    className="size-4 text-[var(--blue)]"
                    aria-hidden="true"
                  />
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--navy)] sm:text-3xl">
                  {data ? value : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {data ? detail : ' '}
                </p>
              </button>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-5">
              <section
                aria-labelledby="home-applications"
                className="rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                  <h2
                    id="home-applications"
                    className="font-display text-lg font-bold text-[var(--navy)]"
                  >
                    Aplicações recentes
                  </h2>
                  <Button
                    variant="link"
                    className="h-auto px-0"
                    onClick={() => onNavigate('Diagnosticar')}
                  >
                    Ver todas
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
                {data && !applications.length ? (
                  <div className="m-5 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600 sm:m-6">
                    Nenhuma avaliação aplicada ainda. Aplique uma prova a uma
                    turma para acompanhar PDFs, correção e resultados.
                    <div>
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => onNavigate('Turmas e alunos')}
                      >
                        <Users aria-hidden="true" />
                        Ir para turmas
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 px-5 pb-2 sm:px-6">
                    {applications.slice(0, 4).map((a) => {
                      const ready = a.students ? a.completed / a.students : 0;
                      return (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
                        >
                          <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                            <p className="truncate font-semibold text-slate-900">
                              {a.title}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-600">
                              {a.className}
                              {a.scheduledAt
                                ? ` · ${shortDate(a.scheduledAt)}`
                                : ''}
                            </p>
                          </div>
                          <div className="w-40 flex-1 sm:flex-none">
                            <p className="flex justify-between text-xs text-slate-600">
                              <span>PDFs prontos</span>
                              <span className="tabular-nums">
                                {a.completed}/{a.students}
                              </span>
                            </p>
                            <div
                              className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
                              aria-hidden="true"
                            >
                              <span
                                className={`block h-full rounded-full ${ready === 1 ? 'bg-emerald-600' : 'bg-blue-600'}`}
                                style={{ width: `${ready * 100}%` }}
                              />
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenApplication(a.id)}
                          >
                            Relatório
                            <ArrowRight aria-hidden="true" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section
                aria-labelledby="home-assessments"
                className="rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                  <h2
                    id="home-assessments"
                    className="font-display text-lg font-bold text-[var(--navy)]"
                  >
                    Avaliações recentes
                  </h2>
                  <Button
                    variant="link"
                    className="h-auto px-0"
                    onClick={() => onNavigate('Avaliações')}
                  >
                    Ver todas
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
                {data && !data.assessments.length ? (
                  <p className="m-5 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600 sm:m-6">
                    Nenhuma avaliação montada ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 px-5 pb-2 sm:px-6">
                    {data?.assessments.slice(0, 5).map((a) => (
                      <li key={a.id} className="py-3">
                        <div className="flex items-center gap-3">
                          <FileOutput
                            className="size-4 shrink-0 text-slate-500"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">
                              {a.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {[
                                a.grade,
                                a.versionCount
                                  ? `${a.versionCount} ${a.versionCount === 1 ? 'versão' : 'versões'}`
                                  : '',
                                shortDate(a.createdAt),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          {regeneratingId === a.id && (
                            <span className="text-xs text-slate-600">
                              Gerando…
                            </span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Mais ações para ${a.title}`}
                                />
                              }
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="min-w-48"
                            >
                              <DropdownMenuItem
                                onClick={() => onNavigate('Avaliações')}
                              >
                                <FileOutput />
                                Abrir avaliações
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={Boolean(regeneratingId)}
                                onClick={() => regenerateSavedAssessment(a.id)}
                              >
                                <RotateCcw />
                                Gerar PDFs novamente
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={deletingId === a.id}
                                onClick={() => void deleteSavedAssessment(a)}
                              >
                                <Trash2 />
                                Excluir prova
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {regenerated?.assessmentId === a.id && (
                          <div className="mt-3 space-y-3" aria-live="polite">
                            {regenerated.jobs.some(
                              (job) =>
                                job.status === 'queued' ||
                                job.status === 'running',
                            ) && (
                              <p className="text-sm text-slate-600">
                                Compondo os PDFs no ConTeXt…
                              </p>
                            )}
                            {regenerated.jobs.map((job) =>
                              job.status === 'completed' ? (
                                <AssessmentPdfPreview
                                  key={job.renderJobId}
                                  apiUrl={apiUrl}
                                  jobId={job.renderJobId}
                                  code={job.code}
                                />
                              ) : job.status === 'failed' ? (
                                <p
                                  key={job.renderJobId}
                                  role="alert"
                                  className="text-sm text-rose-700"
                                >
                                  Versão {job.code}:{' '}
                                  {job.error || 'Falha na composição.'}
                                </p>
                              ) : null,
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {regenerationError && (
                  <p role="alert" className="px-6 pb-4 text-sm text-rose-700">
                    {regenerationError}
                  </p>
                )}
              </section>
            </div>

            <div className="min-w-0 space-y-5">
              <section
                aria-labelledby="home-next"
                className="rounded-2xl bg-[var(--navy)] p-5 text-white sm:p-6"
              >
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--lime)]">
                  <ChartNoAxesCombined className="size-4" aria-hidden="true" />
                  Próximo passo
                </p>
                <h2
                  id="home-next"
                  className="mt-3 font-display text-xl font-bold leading-snug"
                >
                  {next.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {next.text}
                </p>
                <Button
                  disabled={!data}
                  onClick={next.action}
                  className="mt-4 bg-[var(--lime)] text-[var(--navy)] hover:bg-[var(--lime)]/90"
                >
                  {next.label}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </section>

              <section
                aria-labelledby="home-questions"
                className="rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                  <h2
                    id="home-questions"
                    className="font-display text-lg font-bold text-[var(--navy)]"
                  >
                    Questões recentes
                  </h2>
                  <Button
                    variant="link"
                    className="h-auto px-0"
                    onClick={() => onNavigate('Questões')}
                  >
                    Abrir banco
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
                {data && !activeQuestions.length ? (
                  <p className="m-5 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600 sm:m-6">
                    Nenhuma questão no banco ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 px-5 pb-2 sm:px-6">
                    {activeQuestions.slice(0, 5).map((q) => {
                      const status =
                        questionStatus[q.status] || questionStatus.Rascunho;
                      const StatusIcon = status.icon;
                      return (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() =>
                              canEditCatalog
                                ? onEditQuestion(q.id)
                                : onNavigate('Questões')
                            }
                            className="block w-full py-3 text-left"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[var(--blue)]">
                                {q.code} · {q.subject}
                              </span>
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                              >
                                <StatusIcon
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                {q.status}
                              </span>
                            </span>
                            {q.statement && (
                              <span className="mt-1 line-clamp-2 block text-sm text-slate-700">
                                {questionBankSummary(q.statement)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HomeAction({
  icon: Icon,
  title,
  description,
  label,
  onClick,
}: {
  icon: typeof LibraryBig;
  title: string;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
      <Icon className="size-5 shrink-0 text-[var(--blue)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-slate-600">{description}</p>
      </div>
      <Button variant="outline" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
