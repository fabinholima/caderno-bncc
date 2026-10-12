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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

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
};
type Assessment = { id: string; title: string; grade: string };
type Application = {
  id: string;
  title: string;
  className: string;
  completed: number;
  students: number;
  status: string;
};
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
  onNavigate,
  onNewQuestion,
  onEditQuestion,
  onOpenApplication,
}: {
  apiUrl: string;
  name: string;
  view: string;
  canEditCatalog: boolean;
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
  const approved =
    data?.questions.filter((q) => q.status === 'Aprovada').length || 0;
  const review =
    data?.questions.filter(
      (q) => q.status === 'Em revisão' || q.status === 'Precisa de ajustes',
    ).length || 0;
  const completed = data?.applications.find((a) => a.status !== 'cancelled');
  const recovery = view === 'Recuperar';
  const preparing = view === 'Preparar';
  return (
    <div className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--blue)]">
        Seu espaço de trabalho
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--navy)] sm:text-4xl">
        {recovery
          ? 'Da dificuldade à intervenção'
          : preparing
            ? 'Prepare sua próxima avaliação'
            : `Olá, ${name.split(' ')[0]}. Qual é o próximo passo?`}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        {recovery
          ? 'Use as prioridades dos relatórios para planejar atividades e acompanhar a aprendizagem.'
          : 'Da questão à aprendizagem: prepare, corrija, acompanhe as dificuldades e reavalie sua turma.'}
      </p>
      <div className="my-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {steps.map(({ label, icon: Icon, description }, index) => (
          <button
            type="button"
            key={label}
            onClick={() => onNavigate(label)}
            aria-current={view === label ? 'page' : undefined}
            className={`group rounded-2xl border p-4 text-left transition hover:border-blue-400 hover:shadow-sm sm:p-5 ${view === label ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-center justify-between">
              <Icon className="size-6 text-[var(--blue)]" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-400">
                0{index + 1}
              </span>
            </div>
            <p className="mt-4 font-display text-lg font-bold text-[var(--navy)]">
              {label}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              {description}
            </p>
          </button>
        ))}
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
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
        <output className="mb-5 block text-sm text-slate-600">
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
          <ol className="mt-5 space-y-5">
            <li>
              <h3 className="font-semibold">1. Consulte as prioridades</h3>
              <p className="mt-1 text-sm text-slate-600">
                Abra o relatório de uma aplicação corrigida e identifique
                habilidades com maior dificuldade.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => onNavigate('Diagnosticar')}
              >
                Ver relatórios
              </Button>
            </li>
            <li>
              <h3 className="font-semibold">2. Planeje a intervenção</h3>
              <p className="mt-1 text-sm text-slate-600">
                Consulte o catálogo, escolha o objeto de conhecimento e prepare
                atividades para os erros observados.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => onNavigate('Planejamento')}
              >
                Consultar planejamento BNCC
              </Button>
            </li>
            <li>
              <h3 className="font-semibold">3. Reavalie a aprendizagem</h3>
              <p className="mt-1 text-sm text-slate-600">
                Monte outra avaliação com questões aprovadas da mesma habilidade
                e consulte a evolução dos alunos nos relatórios.
              </p>
              <Button className="mt-3" onClick={() => onNavigate('Avaliações')}>
                Preparar nova avaliação
              </Button>
            </li>
          </ol>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold text-[var(--navy)]">
              {preparing
                ? 'Ferramentas de preparação'
                : 'Continue de onde parou'}
            </h2>
            {preparing ? (
              <div className="mt-4 space-y-3">
                <HomeAction
                  icon={LibraryBig}
                  title="Banco de questões"
                  description={
                    data
                      ? `${approved} questões aprovadas · ${review} em revisão ou com ajustes`
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
                {canEditCatalog && (
                  <Button variant="outline" onClick={onNewQuestion}>
                    <Plus />
                    Nova questão
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {completed && (
                  <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">
                        {completed.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {completed.className} · {completed.completed}/
                        {completed.students} PDFs prontos
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => onOpenApplication(completed.id)}
                    >
                      Ver relatório
                    </Button>
                  </div>
                )}
                {data?.questions
                  .filter((q) => q.status !== 'Arquivada')
                  .slice(0, 3)
                  .map((q) => (
                    <div
                      key={q.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {q.code} · {q.subject}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {q.status}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (canEditCatalog) onEditQuestion(q.id);
                          else onNavigate('Questões');
                        }}
                      >
                        {canEditCatalog ? 'Abrir questão' : 'Ver banco'}
                      </Button>
                    </div>
                  ))}
                {data &&
                  !completed &&
                  !data.questions.some((q) => q.status !== 'Arquivada') && (
                    <div className="py-5">
                      <p className="text-sm text-slate-600">
                        Suas atividades aparecerão aqui. Comece pelo banco de
                        questões ou prepare sua primeira avaliação.
                      </p>
                      <Button
                        className="mt-4"
                        onClick={() => onNavigate('Preparar')}
                      >
                        Começar a preparar
                        <ArrowRight />
                      </Button>
                    </div>
                  )}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-blue-100 bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--blue)]">
              Próxima ação
            </p>
            <h2 className="mt-3 font-display text-xl font-bold text-[var(--navy)]">
              {completed
                ? 'Acompanhe os resultados da turma'
                : approved
                  ? 'Transforme questões em avaliação'
                  : 'Prepare o banco de questões'}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {completed
                ? 'Abra o relatório da aplicação. Conforme as correções forem concluídas, os resultados por habilidade, competência e tópico aparecerão ali.'
                : approved
                  ? 'As questões aprovadas já podem ser selecionadas para uma nova avaliação.'
                  : 'Somente questões aprovadas entram nas avaliações. Consulte o catálogo e acompanhe a revisão.'}
            </p>
            <Button
              className="mt-5"
              disabled={!data}
              onClick={() =>
                completed
                  ? onOpenApplication(completed.id)
                  : onNavigate(approved ? 'Avaliações' : 'Questões')
              }
            >
              {completed
                ? 'Ver relatório'
                : approved
                  ? 'Montar avaliação'
                  : 'Abrir banco'}
              <ArrowRight />
            </Button>
            {!!data?.assessments.length && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="font-semibold">Avaliações recentes</h3>
                {data.assessments.slice(0, 3).map((a) => (
                  <p
                    key={a.id}
                    className="mt-3 break-words text-sm text-slate-600"
                  >
                    {a.title} · {a.grade}
                  </p>
                ))}
                <Button
                  variant="link"
                  className="mt-2 px-0"
                  onClick={() => onNavigate('Avaliações')}
                >
                  Abrir avaliações
                  <ArrowRight />
                </Button>
              </div>
            )}
          </section>
        </div>
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
