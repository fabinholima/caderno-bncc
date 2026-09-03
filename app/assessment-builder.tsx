'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  Columns2,
  FileOutput,
  Layers3,
  LoaderCircle,
  Plus,
  Printer,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type BuilderQuestion = {
  id: string;
  code: string;
  statement: string;
  subject: string;
  grade: string;
  skill: string;
  difficulty: string;
};

type AssessmentSection = {
  id: string;
  subject: string;
  columns: 1 | 2;
  startOnNewPage: boolean;
  selected: Set<string>;
};

type GeneratedVersion = {
  code: string;
  renderJobId?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  downloads?: { prova: string; gabarito: string } | null;
};

type RenderTemplate = {
  id: string;
  label: string;
  description: string;
  engine: string;
  version: number;
};

const fallbackTemplates: RenderTemplate[] = [
  {
    id: 'basicexam-v1',
    label: 'Caderno clássico',
    description: 'Layout escolar limpo, com t-basicexam e gabarito separado.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  },
];

export function AssessmentBuilder({
  questions,
  apiUrl,
}: {
  questions: BuilderQuestion[];
  apiUrl: string;
}) {
  const subjects = useMemo(
    () => Array.from(new Set(questions.map((question) => question.subject))),
    [questions],
  );
  const [sections, setSections] = useState<AssessmentSection[]>(() =>
    Array.from(new Set(questions.map((question) => question.subject)))
      .slice(0, 2)
      .map((subject, index) => ({
        id: `section-${index + 1}`,
        subject,
        columns: index === 0 ? 2 : 1,
        startOnNewPage: index > 0,
        selected: new Set(
          questions
            .filter((question) => question.subject === subject)
            .slice(0, 2)
            .map((question) => question.id),
        ),
      })),
  );
  const [activeSectionId, setActiveSectionId] = useState(
    () => sections[0]?.id || '',
  );
  const [subjectToAdd, setSubjectToAdd] = useState('');
  const [versions, setVersions] = useState(3);
  const [paper, setPaper] = useState<'A4' | 'A5'>('A4');
  const [templates, setTemplates] =
    useState<RenderTemplate[]>(fallbackTemplates);
  const [template, setTemplate] = useState('basicexam-v1');
  const [title, setTitle] = useState('Simulado multidisciplinar');
  const [grade, setGrade] = useState('Ensino Médio');
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [generatedVersions, setGeneratedVersions] = useState<
    GeneratedVersion[]
  >([]);
  const activeSection = sections.find(
    (section) => section.id === activeSectionId,
  );
  const visibleQuestions = questions.filter(
    (question) => question.subject === activeSection?.subject,
  );
  const chosen = useMemo(() => {
    const selectedIds = new Set(
      sections.flatMap((section) => Array.from(section.selected)),
    );
    return questions.filter((question) => selectedIds.has(question.id));
  }, [questions, sections]);

  useEffect(() => {
    if (!apiUrl) return;
    const controller = new AbortController();
    fetch(`${apiUrl}/api/render-templates`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { data?: RenderTemplate[] };
        if (body.data?.length) {
          setTemplates(body.data);
          setTemplate((current) =>
            body.data?.some((item) => item.id === current)
              ? current
              : body.data![0].id,
          );
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [apiUrl]);

  useEffect(() => {
    const currentQuestionIds = new Set(
      questions.map((question) => question.id),
    );
    const currentSubjects = new Set(subjects);
    setSections((current) => {
      const synchronized = current
        .filter((section) => currentSubjects.has(section.subject))
        .map((section) => ({
          ...section,
          selected: new Set(
            Array.from(section.selected).filter((id) =>
              currentQuestionIds.has(id),
            ),
          ),
        }));
      if (synchronized.length || !subjects.length) return synchronized;
      return [
        {
          id: `section-${Date.now()}`,
          subject: subjects[0],
          columns: 1,
          startOnNewPage: false,
          selected: new Set<string>(),
        },
      ];
    });
  }, [questions, subjects]);

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0]?.id || '');
    }
  }, [activeSectionId, sections]);

  useEffect(() => {
    if (
      !generated ||
      !apiUrl ||
      !generatedVersions.some(
        (version) =>
          version.renderJobId &&
          version.status !== 'completed' &&
          version.status !== 'failed',
      )
    )
      return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await Promise.all(
          generatedVersions.map(async (version) => {
            if (
              !version.renderJobId ||
              version.status === 'completed' ||
              version.status === 'failed'
            )
              return version;
            const response = await fetch(
              `${apiUrl}/api/render-jobs/${version.renderJobId}`,
              { signal: controller.signal },
            );
            if (!response.ok) return version;
            const body = (await response.json()) as {
              data: GeneratedVersion & { id: string };
            };
            return {
              ...version,
              status: body.data.status,
              error: body.data.error,
              downloads: body.data.downloads,
            };
          }),
        );
        setGeneratedVersions(next);
        const completed = next.filter(
          (version) => version.status === 'completed',
        ).length;
        const failed = next.filter(
          (version) => version.status === 'failed',
        ).length;
        if (completed + failed === next.length) {
          setMessage(
            failed
              ? `${completed} versões prontas e ${failed} com falha de composição.`
              : `${completed} versões prontas para baixar.`,
          );
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMessage('Aguardando uma nova consulta ao processador de PDFs.');
      }
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiUrl, generated, generatedVersions]);

  function toggle(id: string) {
    setGenerated(false);
    setSections((current) =>
      current.map((section) => {
        if (section.id !== activeSectionId) return section;
        const selected = new Set(section.selected);
        selected.has(id) ? selected.delete(id) : selected.add(id);
        return { ...section, selected };
      }),
    );
  }

  function addSection() {
    const subject =
      subjectToAdd ||
      subjects.find(
        (item) => !sections.some((section) => section.subject === item),
      );
    if (!subject) return;
    const id = `section-${Date.now()}`;
    setSections((current) => [
      ...current,
      {
        id,
        subject,
        columns: 1,
        startOnNewPage: current.length > 0,
        selected: new Set<string>(),
      },
    ]);
    setActiveSectionId(id);
    setSubjectToAdd('');
    setGenerated(false);
  }

  function updateSection(id: string, change: Partial<AssessmentSection>) {
    setSections((current) =>
      current.map((section) =>
        section.id === id ? { ...section, ...change } : section,
      ),
    );
    setGenerated(false);
  }

  function removeSection(id: string) {
    setSections((current) => {
      const next = current.filter((section) => section.id !== id);
      if (activeSectionId === id) setActiveSectionId(next[0]?.id || '');
      return next;
    });
    setGenerated(false);
  }

  async function generate() {
    const configuredSections = sections.filter(
      (section) => section.selected.size > 0,
    );
    if (!configuredSections.length)
      return setMessage('Selecione pelo menos uma questão.');
    setSaving(true);
    setMessage('');
    try {
      if (
        apiUrl &&
        chosen.every((question) => /^[0-9a-f-]{36}$/i.test(question.id))
      ) {
        const response = await fetch(`${apiUrl}/api/assessments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title,
            grade,
            sections: configuredSections.map((section) => ({
              subject: section.subject,
              title: section.subject,
              columns: section.columns,
              startOnNewPage: section.startOnNewPage,
              questionIds: Array.from(section.selected),
            })),
            versionCount: versions,
            paper,
            template,
            instructions: [
              'Leia cada questão com atenção.',
              'Marque apenas uma alternativa.',
            ],
          }),
        });
        const body = (await response.json()) as {
          data: { versions: Array<{ code: string; renderJobId?: string }> };
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Não foi possível gerar a avaliação.');
        setGeneratedVersions(
          body.data.versions.map((version) => ({
            ...version,
            status: 'queued',
          })),
        );
        setMessage(
          `${body.data.versions.length} versões enviadas para a fila de PDF.`,
        );
      } else {
        setGeneratedVersions(
          Array.from({ length: versions }, (_, index) => ({
            code: String.fromCharCode(65 + index),
            status: 'completed' as const,
          })),
        );
        setMessage(
          `${versions} versões preparadas com ${configuredSections.length} disciplinas. A prova modelo já pode ser baixada; a API produzirá os arquivos dinâmicos.`,
        );
      }
      setGenerated(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao gerar avaliação.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[.15em] text-[var(--blue)]">
            Montagem e versões
          </p>
          <h1 className="font-display text-3xl font-bold tracking-[-.03em] text-[var(--navy)] sm:text-[38px]">
            Nova avaliação
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Escolha questões, defina as versões e envie uma fotografia imutável
            para a fila de composição tipográfica.
          </p>
        </div>
        <Badge
          className="w-fit border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"
          variant="outline"
        >
          <Check className="mr-1 size-3" />
          BNCC vinculada
        </Badge>
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <h2 className="font-display text-xl font-bold text-[var(--navy)]">
                  1. Organize as disciplinas
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cada disciplina vira uma seção independente no PDF.
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={subjectToAdd}
                  onChange={(event) => setSubjectToAdd(event.target.value)}
                  className="h-10 min-w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Adicionar disciplina...</option>
                  {subjects
                    .filter(
                      (item) =>
                        !sections.some((section) => section.subject === item),
                    )
                    .map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  onClick={addSection}
                  disabled={
                    sections.length >= subjects.length ||
                    (!subjectToAdd &&
                      !subjects.some(
                        (item) =>
                          !sections.some((section) => section.subject === item),
                      ))
                  }
                >
                  <Plus className="size-4" />
                  Adicionar
                </Button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {sections.map((section, index) => (
                <article
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    activeSectionId === section.id
                      ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-blue-600 shadow-sm">
                        <BookOpen className="size-4" />
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {section.subject}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Seção {index + 1} · {section.selected.size}{' '}
                          {section.selected.size === 1 ? 'questão' : 'questões'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remover ${section.subject}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSection(section.id);
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateSection(section.id, { columns: 1 });
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        section.columns === 1
                          ? 'border-blue-300 bg-white text-blue-700'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      1 coluna
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateSection(section.id, { columns: 2 });
                      }}
                      className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        section.columns === 2
                          ? 'border-blue-300 bg-white text-blue-700'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <Columns2 className="size-3" />2 colunas
                    </button>
                  </div>
                  {index > 0 && (
                    <label
                      onClick={(event) => event.stopPropagation()}
                      className="mt-3 flex items-center gap-2 text-xs text-slate-600"
                    >
                      <input
                        type="checkbox"
                        checked={section.startOnNewPage}
                        onChange={(event) =>
                          updateSection(section.id, {
                            startOnNewPage: event.target.checked,
                          })
                        }
                        className="accent-blue-600"
                      />
                      Iniciar esta disciplina em nova página
                    </label>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <header className="border-b border-slate-200 p-5">
              <h2 className="font-display text-xl font-bold text-[var(--navy)]">
                2. Escolha as questões de{' '}
                <span className="text-blue-600">
                  {activeSection?.subject || 'uma disciplina'}
                </span>
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {chosen.length} questões no total · clique para incluir ou
                remover da seção ativa
              </p>
            </header>
            <div className="divide-y divide-slate-100">
              {visibleQuestions.map((question) => (
                <button
                  key={question.id}
                  onClick={() => toggle(question.id)}
                  className={`flex w-full items-start gap-3 p-4 text-left transition hover:bg-blue-50/50 ${
                    activeSection?.selected.has(question.id)
                      ? 'bg-blue-50/40'
                      : ''
                  }`}
                >
                  <span
                    className={`mt-1 grid size-5 shrink-0 place-items-center rounded border ${
                      activeSection?.selected.has(question.id)
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300'
                    }`}
                  >
                    {activeSection?.selected.has(question.id) && (
                      <Check className="size-3" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700">
                        {question.code}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-violet-200 bg-violet-50 font-mono text-violet-700"
                      >
                        {question.skill}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {question.grade} · {question.difficulty}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-5 text-slate-800">
                      {question.statement}
                    </p>
                  </div>
                </button>
              ))}
              {!visibleQuestions.length && (
                <div className="p-8 text-center text-sm text-slate-500">
                  Adicione ou selecione uma disciplina para consultar suas
                  questões.
                </div>
              )}
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Layers3 className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--navy)]">
                  3. Configuração
                </h2>
                <p className="text-xs text-slate-500">Conteúdo e impressão</p>
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Título</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">
                Etapa ou série
              </span>
              <Input
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                placeholder="Ex.: 3ª série do Ensino Médio"
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Versões
                </span>
                <select
                  value={versions}
                  onChange={(event) => setVersions(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="1">A</option>
                  <option value="2">A e B</option>
                  <option value="3">A, B e C</option>
                  <option value="4">A até D</option>
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">Papel</span>
                <select
                  value={paper}
                  onChange={(event) =>
                    setPaper(event.target.value as 'A4' | 'A5')
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">
                Layout de impressão
              </span>
              <select
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · v{item.version}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {templates.find((item) => item.id === template)?.description}
              </p>
            </label>
            <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex gap-3">
                <Shuffle className="mt-0.5 size-4 shrink-0 text-violet-600" />
                <div>
                  <p className="text-sm font-semibold text-violet-900">
                    Embaralhamento determinístico
                  </p>
                  <p className="mt-1 text-xs leading-5 text-violet-700">
                    Cada versão recebe ordem própria de questões e alternativas,
                    preservando o gabarito por chave estável.
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={generate}
              disabled={saving || !title.trim()}
              className="mt-5 w-full bg-[var(--blue)] text-white hover:bg-blue-700"
            >
              <Sparkles />
              {saving
                ? 'Preparando...'
                : `Gerar ${versions} ${versions === 1 ? 'versão' : 'versões'}`}
            </Button>
            {message && (
              <p
                role="status"
                className="mt-3 text-xs leading-5 text-slate-600"
              >
                {message}
              </p>
            )}
          </section>
          {generated && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
              <div className="flex items-center gap-2 text-blue-900">
                {generatedVersions.some(
                  (version) =>
                    version.status === 'queued' || version.status === 'running',
                ) ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : generatedVersions.some(
                    (version) => version.status === 'failed',
                  ) ? (
                  <CircleAlert className="size-5 text-amber-600" />
                ) : (
                  <Check className="size-5 text-emerald-600" />
                )}
                <h3 className="font-semibold">Processamento dos PDFs</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-blue-700">
                Cada versão produz uma prova do aluno e um gabarito do
                professor.
              </p>
              <div className="mt-4 space-y-3">
                {generatedVersions.map((version) => (
                  <article
                    key={version.code}
                    className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-lg bg-blue-50 font-mono text-sm font-bold text-blue-800">
                          {version.code}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            Versão {version.code}
                          </p>
                          <p className="text-xs text-slate-500">
                            {version.status === 'completed'
                              ? 'PDFs prontos'
                              : version.status === 'failed'
                                ? 'Falha na composição'
                                : version.status === 'running'
                                  ? 'Compondo no ConTeXt...'
                                  : 'Aguardando o processador...'}
                          </p>
                        </div>
                      </div>
                      {version.status === 'completed' ? (
                        <Check className="size-4 text-emerald-600" />
                      ) : version.status === 'failed' ? (
                        <CircleAlert className="size-4 text-amber-600" />
                      ) : (
                        <LoaderCircle className="size-4 animate-spin text-blue-600" />
                      )}
                    </div>
                    {version.error && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {version.error}
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {version.status === 'completed' ? (
                        <>
                          <a
                            href={
                              version.renderJobId
                                ? `${apiUrl}${version.downloads?.prova || `/api/render-jobs/${version.renderJobId}/prova`}`
                                : '/generated/avaliacao-modelo.pdf'
                            }
                            download
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                          >
                            <Printer className="size-3.5" />
                            Prova
                          </a>
                          <a
                            href={
                              version.renderJobId
                                ? `${apiUrl}${version.downloads?.gabarito || `/api/render-jobs/${version.renderJobId}/gabarito`}`
                                : '/generated/avaliacao-modelo.pdf'
                            }
                            download
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                          >
                            <FileOutput className="size-3.5" />
                            Gabarito
                          </a>
                        </>
                      ) : (
                        <span className="col-span-2 inline-flex h-9 items-center justify-center rounded-lg bg-slate-50 text-xs font-medium text-slate-400">
                          Downloads liberados após a composição
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
