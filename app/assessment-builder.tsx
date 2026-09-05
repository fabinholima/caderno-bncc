'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  Columns2,
  FileOutput,
  ImagePlus,
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
import { apiFetch } from '@/lib/api-client';

export type BuilderQuestion = {
  id: string;
  code: string;
  statement: string;
  subject: string;
  grade: string;
  skill: string;
  knowledgeObjectId?: string;
  knowledgeObject?: string;
  competencyId?: string;
  competencyNumber?: number;
  sourceInstitution: string;
  sourceYear: number;
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

type RenderFont = { id: string; label: string };

type AssessmentPreset = {
  id: string;
  name: string;
  configuration: {
    header: {
      institutionName: string;
      teacherName: string;
      className: string;
      term: string;
      date: string;
      transcriptionPhrase?: string;
      logoDataUrl?: string;
    };
    paper: 'A4' | 'A5';
    template: string;
    font: string;
    fontSize: number;
  };
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

const fallbackFonts: RenderFont[] = [
  { id: 'plex', label: 'IBM Plex' },
  { id: 'heros', label: 'TeX Gyre Heros (Helvetica)' },
  { id: 'bonum', label: 'TeX Gyre Bonum (Bookman)' },
  { id: 'schola', label: 'TeX Gyre Schola (Schoolbook)' },
  { id: 'libertinus', label: 'Libertinus' },
];

const previewFontFamilies: Record<string, string> = {
  plex: '"IBM Plex Serif", Georgia, serif',
  heros: 'Helvetica, Arial, sans-serif',
  bonum: 'Bookman, "URW Bookman", Georgia, serif',
  schola: '"Century Schoolbook", Georgia, serif',
  libertinus: 'Libertinus Serif, "Times New Roman", serif',
};

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
  const [fonts, setFonts] = useState<RenderFont[]>(fallbackFonts);
  const [font, setFont] = useState('plex');
  const [fontSize, setFontSize] = useState(11);
  const [showBnccSkills, setShowBnccSkills] = useState(false);
  const [title, setTitle] = useState('Simulado multidisciplinar');
  const [grade, setGrade] = useState('Ensino Médio');
  const [institutionName, setInstitutionName] = useState(
    'Instituição de ensino',
  );
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [term, setTerm] = useState('');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [transcriptionPhrase, setTranscriptionPhrase] = useState(
    'A persistência transforma esforço em aprendizagem.',
  );
  const [instructions, setInstructions] = useState([
    'Confira seus dados e a versão do simulado antes de começar.',
    'Leia atentamente cada questão e todas as alternativas.',
    'Use somente caneta esferográfica de tinta preta ou azul.',
    'Respeite o tempo e as orientações informadas pelo aplicador.',
    'Não utilize materiais ou dispositivos não autorizados.',
    'Não dobre, rasgue, molhe ou faça anotações no cartão-resposta.',
    'Mantenha o QR Code e as quatro marcas pretas sem riscos ou rasuras.',
    'Assine o cartão-resposta apenas no campo indicado.',
    'Para preencher corretamente, marque um único círculo por questão, cobrindo-o completamente sem ultrapassar sua borda; não use X, traços ou marcações parciais.',
  ]);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [presets, setPresets] = useState<AssessmentPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [generatedVersions, setGeneratedVersions] = useState<
    GeneratedVersion[]
  >([]);
  const [questionKnowledgeObject, setQuestionKnowledgeObject] = useState('');
  const [questionCompetency, setQuestionCompetency] = useState('');
  const [questionSourceInstitution, setQuestionSourceInstitution] =
    useState('');
  const [questionSourceYear, setQuestionSourceYear] = useState('');
  const [questionDifficulty, setQuestionDifficulty] = useState('');
  const activeSection = sections.find(
    (section) => section.id === activeSectionId,
  );
  const questionsInActiveSubject = questions.filter(
    (question) => question.subject === activeSection?.subject,
  );
  const visibleQuestions = questionsInActiveSubject.filter(
    (question) =>
      (!questionKnowledgeObject ||
        question.knowledgeObjectId === questionKnowledgeObject) &&
      (!questionCompetency || question.competencyId === questionCompetency) &&
      (!questionSourceInstitution ||
        question.sourceInstitution === questionSourceInstitution) &&
      (!questionSourceYear ||
        question.sourceYear === Number(questionSourceYear)) &&
      (!questionDifficulty || question.difficulty === questionDifficulty),
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
    apiFetch(`${apiUrl}/api/render-templates`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          data?: RenderTemplate[];
          fonts?: RenderFont[];
        };
        if (body.data?.length) {
          setTemplates(body.data);
          setTemplate((current) =>
            body.data?.some((item) => item.id === current)
              ? current
              : body.data![0].id,
          );
        }
        if (body.fonts?.length) {
          setFonts(body.fonts);
          setFont((current) =>
            body.fonts?.some((item) => item.id === current)
              ? current
              : body.fonts![0].id,
          );
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [apiUrl]);

  useEffect(() => {
    if (!apiUrl) return;
    const controller = new AbortController();
    apiFetch(`${apiUrl}/api/assessment-presets`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { data?: AssessmentPreset[] };
        setPresets(body.data ?? []);
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
    setQuestionKnowledgeObject('');
    setQuestionSourceInstitution('');
    setQuestionSourceYear('');
    setQuestionDifficulty('');
  }, [activeSection?.subject]);

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
            const response = await apiFetch(
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

  function chooseLogo(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setMessage('Escolha um logotipo em PNG ou JPEG.');
      return;
    }
    if (file.size > 400_000) {
      setMessage('O logotipo deve ter no máximo 400 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setLogoDataUrl(reader.result);
      setGenerated(false);
      setMessage('');
    };
    reader.onerror = () => setMessage('Não foi possível ler o logotipo.');
    reader.readAsDataURL(file);
  }

  function applyPreset(preset: AssessmentPreset) {
    const { configuration } = preset;
    setInstitutionName(configuration.header.institutionName);
    setTeacherName(configuration.header.teacherName);
    setClassName(configuration.header.className);
    setTerm(configuration.header.term);
    setAssessmentDate(configuration.header.date);
    setTranscriptionPhrase(configuration.header.transcriptionPhrase || '');
    setLogoDataUrl(configuration.header.logoDataUrl || '');
    setPaper(configuration.paper);
    setTemplate(configuration.template);
    setFont(configuration.font);
    setFontSize(configuration.fontSize);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setGenerated(false);
    setMessage(`Configuração “${preset.name}” aplicada.`);
  }

  async function savePreset() {
    if (!apiUrl || presetName.trim().length < 2) {
      setMessage('Informe um nome com pelo menos 2 caracteres para salvar.');
      return;
    }
    setPresetSaving(true);
    try {
      const response = await apiFetch(`${apiUrl}/api/assessment-presets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: presetName,
          configuration: {
            header: {
              institutionName,
              teacherName,
              className,
              term,
              date: assessmentDate,
              transcriptionPhrase,
              logoDataUrl,
            },
            paper,
            template,
            font,
            fontSize,
          },
        }),
      });
      const body = (await response.json()) as {
        data?: AssessmentPreset;
        error?: string;
      };
      if (!response.ok || !body.data)
        throw new Error(body.error || 'Não foi possível salvar o favorito.');
      setPresets((current) => [
        body.data!,
        ...current.filter((preset) => preset.id !== body.data!.id),
      ]);
      setSelectedPresetId(body.data.id);
      setMessage(`Configuração “${body.data.name}” salva.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao salvar favorito.',
      );
    } finally {
      setPresetSaving(false);
    }
  }

  async function removePreset() {
    if (!apiUrl || !selectedPresetId) return;
    try {
      const response = await apiFetch(
        `${apiUrl}/api/assessment-presets/${selectedPresetId}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Não foi possível excluir o favorito.');
      setPresets((current) =>
        current.filter((preset) => preset.id !== selectedPresetId),
      );
      setSelectedPresetId('');
      setPresetName('');
      setMessage('Configuração favorita excluída.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao excluir favorito.',
      );
    }
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
        const response = await apiFetch(`${apiUrl}/api/assessments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title,
            grade,
            header: {
              institutionName,
              teacherName,
              className,
              term,
              date: assessmentDate,
              transcriptionPhrase,
              logoDataUrl,
            },
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
            font,
            fontSize,
            showBnccSkills,
            instructions,
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
            <div className="grid gap-2 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <select
                aria-label="Filtrar por objeto de conhecimento"
                value={
                  activeSection?.subject === 'Química'
                    ? questionCompetency
                    : questionKnowledgeObject
                }
                onChange={(event) =>
                  activeSection?.subject === 'Química'
                    ? setQuestionCompetency(event.target.value)
                    : setQuestionKnowledgeObject(event.target.value)
                }
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="">
                  {activeSection?.subject === 'Química'
                    ? 'Todas as competências'
                    : 'Todos os objetos'}
                </option>
                {Array.from(
                  new Map(
                    questionsInActiveSubject
                      .filter((question) =>
                        activeSection?.subject === 'Química'
                          ? question.competencyId
                          : question.knowledgeObjectId,
                      )
                      .map((question) => [
                        activeSection?.subject === 'Química'
                          ? question.competencyId
                          : question.knowledgeObjectId,
                        question,
                      ]),
                  ).values(),
                ).map((question) => (
                  <option
                    key={
                      activeSection?.subject === 'Química'
                        ? question.competencyId
                        : question.knowledgeObjectId
                    }
                    value={
                      activeSection?.subject === 'Química'
                        ? question.competencyId
                        : question.knowledgeObjectId
                    }
                  >
                    {activeSection?.subject === 'Química'
                      ? `Competência ${question.competencyNumber}`
                      : question.knowledgeObject}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por instituição ou banca"
                value={questionSourceInstitution}
                onChange={(event) =>
                  setQuestionSourceInstitution(event.target.value)
                }
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="">Todas as instituições</option>
                {Array.from(
                  new Set(
                    questionsInActiveSubject.map(
                      (question) => question.sourceInstitution,
                    ),
                  ),
                )
                  .sort()
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Filtrar por ano da prova"
                value={questionSourceYear}
                onChange={(event) => setQuestionSourceYear(event.target.value)}
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="">Todos os anos</option>
                {Array.from(
                  new Set(
                    questionsInActiveSubject.map(
                      (question) => question.sourceYear,
                    ),
                  ),
                )
                  .sort((a, b) => b - a)
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Filtrar por dificuldade"
                value={questionDifficulty}
                onChange={(event) => setQuestionDifficulty(event.target.value)}
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="">Todos os níveis</option>
                <option value="Fácil">Fácil</option>
                <option value="Média">Média</option>
                <option value="Difícil">Difícil</option>
              </select>
              {(questionKnowledgeObject ||
                questionSourceInstitution ||
                questionSourceYear ||
                questionDifficulty) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuestionKnowledgeObject('');
                    setQuestionSourceInstitution('');
                    setQuestionSourceYear('');
                    setQuestionDifficulty('');
                  }}
                  className="text-left text-xs font-semibold text-blue-600 xl:col-span-4"
                >
                  Limpar filtros · {visibleQuestions.length} encontradas
                </button>
              )}
            </div>
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
            <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <span className="block text-sm font-semibold text-blue-950">
                Configurações favoritas
              </span>
              <select
                value={selectedPresetId}
                onChange={(event) => {
                  const preset = presets.find(
                    (item) => item.id === event.target.value,
                  );
                  if (preset) applyPreset(preset);
                  else setSelectedPresetId('');
                }}
                className="mt-2 h-9 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm"
              >
                <option value="">Selecionar configuração...</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <Input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Ex.: Padrão da escola"
                  maxLength={80}
                  className="h-9 bg-white"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={savePreset}
                  disabled={presetSaving || presetName.trim().length < 2}
                >
                  {presetSaving ? 'Salvando...' : 'Salvar'}
                </Button>
                {selectedPresetId && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    onClick={removePreset}
                    aria-label="Excluir configuração favorita"
                    className="text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-blue-700">
                Salva cabeçalho, logotipo e opções de impressão para reutilizar.
              </p>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Nome da instituição
              </span>
              <Input
                value={institutionName}
                onChange={(event) => setInstitutionName(event.target.value)}
                placeholder="Ex.: Escola Municipal Paulo Freire"
              />
            </label>
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              <div className="flex items-center gap-3">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 text-slate-400">
                  {logoDataUrl ? (
                    <img
                      src={logoDataUrl}
                      alt="Prévia do logotipo da instituição"
                      className="size-full object-contain"
                    />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Logotipo</p>
                  <p className="text-xs text-slate-500">
                    PNG ou JPEG · até 400 KB
                  </p>
                  <div className="mt-2 flex gap-2">
                    <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold hover:bg-slate-50">
                      {logoDataUrl ? 'Trocar' : 'Escolher imagem'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        className="sr-only"
                        onChange={(event) =>
                          chooseLogo(event.target.files?.[0])
                        }
                      />
                    </label>
                    {logoDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setLogoDataUrl('');
                          setGenerated(false);
                        }}
                        className="h-8 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">Título</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className="mt-4 grid grid-cols-[1fr_96px] gap-3">
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Fonte do PDF
                </span>
                <select
                  value={font}
                  onChange={(event) => setFont(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {fonts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Tamanho
                </span>
                <select
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {Array.from({ length: 7 }, (_, index) => index + 10).map(
                    (size) => (
                      <option key={size} value={size}>
                        {size} pt
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Professor(a)
                </span>
                <Input
                  value={teacherName}
                  onChange={(event) => setTeacherName(event.target.value)}
                  placeholder="Nome"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">Turma</span>
                <Input
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  placeholder="Ex.: 7º A"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Período
                </span>
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Ex.: 2º bimestre"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">Data</span>
                <Input
                  value={assessmentDate}
                  onChange={(event) => setAssessmentDate(event.target.value)}
                  placeholder="Ex.: 15/09/2026"
                />
              </label>
            </div>
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
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={showBnccSkills}
                onChange={(event) => {
                  setShowBnccSkills(event.target.checked);
                  setGenerated(false);
                }}
                className="mt-0.5 size-4 accent-blue-600"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Exibir habilidade BNCC nas questões
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Mostra a habilidade antes do enunciado. A instituição e o ano da fonte são sempre exibidos em negrito.
                </span>
              </span>
            </label>
            {template === 'simulado-v1' && (
              <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">
                    Frase para transcrição
                  </span>
                  <Input
                    value={transcriptionPhrase}
                    onChange={(event) => {
                      setTranscriptionPhrase(event.target.value);
                      setGenerated(false);
                    }}
                    maxLength={240}
                    placeholder="Frase que o estudante copiará na capa"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Aparece na primeira página, antes das questões.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">
                    Instruções do simulado
                  </span>
                  <textarea
                    value={instructions.join('\n')}
                    onChange={(event) => {
                      setInstructions(
                        event.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .slice(0, 10),
                      );
                      setGenerated(false);
                    }}
                    rows={10}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 outline-none focus:border-blue-500"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Uma instrução por linha, no máximo 10. A instrução 9 orienta o preenchimento correto.
                  </span>
                </label>
              </div>
            )}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  Prévia do cabeçalho
                </span>
                <span className="text-xs text-slate-400">
                  {fontSize} pt · {paper}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-3">
                <div
                  className={`mx-auto bg-white px-4 py-5 shadow-sm ${
                    paper === 'A5' ? 'max-w-[245px]' : 'max-w-[320px]'
                  }`}
                  style={{
                    fontFamily: previewFontFamilies[font],
                    fontSize: `${Math.max(8, fontSize * 0.72)}px`,
                  }}
                >
                  <div className="grid grid-cols-[48px_1fr] items-center gap-3">
                    <div className="grid h-8 place-items-center overflow-hidden text-slate-400">
                      {logoDataUrl ? (
                        <img
                          src={logoDataUrl}
                          alt="Logotipo no cabeçalho da avaliação"
                          className="max-h-8 max-w-12 object-contain"
                        />
                      ) : (
                        <ImagePlus className="size-4" />
                      )}
                    </div>
                    <p className="text-center font-bold leading-tight">
                      {institutionName || 'Nome da instituição'}
                    </p>
                  </div>
                  <p className="mt-2 text-center font-semibold leading-tight">
                    {title || 'Título da avaliação'}
                  </p>
                  <p className="mt-1 text-center leading-tight">
                    {grade || 'Etapa ou série'} · Versão A · Valor:{' '}
                    {chosen.length || 0}{' '}
                    {chosen.length === 1 ? 'ponto' : 'pontos'}
                  </p>
                  {(teacherName || className || term || assessmentDate) && (
                    <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-center leading-tight">
                      {teacherName && <span>Professor(a): {teacherName}</span>}
                      {className && <span>Turma: {className}</span>}
                      {term && <span>Período: {term}</span>}
                      {assessmentDate && <span>Data: {assessmentDate}</span>}
                    </div>
                  )}
                  <div className="mt-3 flex items-end gap-2">
                    <span>Nome:</span>
                    <span className="h-px flex-1 bg-slate-400" />
                    <span>Turma:</span>
                    <span className="h-px w-10 bg-slate-400" />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Prévia aproximada. O PDF final é composto pelo ConTeXt.
              </p>
            </div>
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
              disabled={saving || !title.trim() || !institutionName.trim()}
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
