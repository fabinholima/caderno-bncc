'use client';
import {
  isCompactTemplate,
  isJudgmentTemplate,
} from '@/lib/compact-assessment.mjs';
import {
  assertAssessmentQuestionStyle,
  renderTemplateCatalog,
} from '@/lib/render-templates.mjs';
import type { EducatorData, School } from './educator-profile';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  Columns2,
  CopyPlus,
  FileOutput,
  FolderOpen,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Pin,
  PinOff,
  Plus,
  Printer,
  Shuffle,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AssessmentApplicationStep } from './assessment-application-step';
import { AssessmentPdfPreview } from './assessment-pdf-preview';
import { apiFetch } from '@/lib/api-client';

export type BuilderQuestion = {
  type?: string;
  points?: number;
  recommendSingleColumn?: boolean;
  id: string;
  code: string;
  statement: string;
  subject: string;
  grade: string;
  skill: string;
  knowledgeObjectId?: string;
  knowledgeObject?: string;
  knowledgeTopic?: string;
  pedagogicalTopicId?: string;
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
  fullWidth: Set<string>;
};

type GeneratedVersion = {
  code: string;
  renderJobId?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  downloads?: {
    prova: string;
    gabarito: string;
    provaTex: string;
    gabaritoTex: string;
  } | null;
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

const fallbackTemplates: RenderTemplate[] = renderTemplateCatalog.map(
  (item) => ({ ...item }),
);

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
        startOnNewPage: false,
        selected: new Set<string>(),
        fullWidth: new Set<string>(),
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
  const [showSaebDescriptors, setShowSaebDescriptors] = useState(false);
  const [showStudentPhoto, setShowStudentPhoto] = useState(false);
  const [title, setTitle] = useState('Simulado multidisciplinar');
  const [grade, setGrade] = useState('Ensino Médio');
  const [institutionName, setInstitutionName] = useState(
    'Instituição de ensino',
  );
  const [teacherName, setTeacherName] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/educator-profile`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar as escolas.');
        return (await response.json()) as { data: EducatorData };
      })
      .then((body) => {
        if (!active) return;
        setSchools(body.data.schools);
        if (restoredProfile.current) return;
        setTeacherName((current) => current || body.data.teacherName);
        const first = body.data.schools[0];
        if (first) {
          setSchoolId(first.id || '');
          setInstitutionName(`${first.name} — ${first.city}/${first.state}`);
          setLogoDataUrl(first.logoDataUrl);
        }
      })
      .catch(() => {
        if (active)
          setMessage('Não foi possível carregar as escolas do seu cadastro.');
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);
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
  const [step, setStep] = useState(0);
  const [workspaceId, setWorkspaceId] = useState('');
  const revisionRef = useRef(1);
  const saveQueue = useRef(Promise.resolve());
  const pendingSave = useRef<(() => void) | null>(null);
  const saveSequence = useRef(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [questionPoints, setQuestionPoints] = useState<Record<string, number>>(
    {},
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [recent, setRecent] = useState<
    Array<{
      id: string;
      title: string;
      subject: string;
      grade: string;
      updatedAt: string;
      pinned: boolean;
      assessmentId: string | null;
    }>
  >([]);
  const [offset, setOffset] = useState(0);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<
    (typeof recent)[number] | null
  >(null);
  const [unlinkUnsentApplications, setUnlinkUnsentApplications] =
    useState(false);
  const [selectedRecentIds, setSelectedRecentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingSelected, setDeletingSelected] = useState<
    false | 'delete' | 'unlink'
  >(false);
  const configuration = useMemo(
    () => ({
      title,
      grade,
      ...(schoolId ? { schoolId } : {}),
      header: {
        institutionName,
        teacherName,
        className,
        term,
        date: assessmentDate,
        transcriptionPhrase,
        logoDataUrl,
      },
      sections: sections.map((s) => ({
        id: s.id,
        subject: s.subject,
        columns: s.columns,
        startOnNewPage: s.startOnNewPage,
        questionIds: [...s.selected],
        fullWidthQuestionIds: [...s.fullWidth],
      })),
      versionCount: versions,
      paper,
      template,
      font,
      fontSize,
      showBnccSkills,
      showSaebDescriptors,
      showStudentPhoto,
      instructions,
      questionPoints,
      shuffleQuestions,
    }),
    [
      title,
      grade,
      schoolId,
      institutionName,
      teacherName,
      className,
      term,
      assessmentDate,
      transcriptionPhrase,
      logoDataUrl,
      sections,
      versions,
      paper,
      template,
      font,
      fontSize,
      showBnccSkills,
      showSaebDescriptors,
      showStudentPhoto,
      instructions,
      questionPoints,
      shuffleQuestions,
    ],
  );
  const configurationKey = JSON.stringify(configuration, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
  const renderedConfiguration = useRef('');
  const restoredProfile = useRef(false);
  const skipNextSave = useRef(false);
  const workspaceRequest = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      const response = await apiFetch(
        `${apiUrl}/api/assessment-workspaces${path}`,
        options,
      );
      const body = (await response.json()) as { data: T; error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível salvar a montagem.');
      return body.data;
    },
    [apiUrl],
  );
  const deleteRecentItem = useCallback(
    async (item: (typeof recent)[number], unlinkApplications = false) => {
      if (item.assessmentId) {
        const response = await apiFetch(
          `${apiUrl}/api/assessments/${item.assessmentId}${unlinkApplications ? '?unlinkUnsentApplications=true' : ''}`,
          { method: 'DELETE' },
        );
        const body = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(body.error || 'Não foi possível excluir a prova.');
      } else {
        await workspaceRequest(`/${item.id}`, { method: 'DELETE' });
      }
    },
    [apiUrl, workspaceRequest],
  );
  const confirmRecentDelete = useCallback(
    async (item: (typeof recent)[number], unlinkApplications = false) => {
      setDeletingWorkspaceId(item.id);
      try {
        await deleteRecentItem(item, unlinkApplications);
        setRecent(await workspaceRequest<typeof recent>(`?offset=${offset}`));
        setMessage(
          item.assessmentId
            ? unlinkApplications
              ? 'Aplicações ainda não aplicadas desvinculadas e prova excluída.'
              : 'Prova gerada excluída.'
            : 'Rascunho excluído.',
        );
        setSelectedRecentIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        setPendingDelete(null);
        setUnlinkUnsentApplications(false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setDeletingWorkspaceId('');
      }
    },
    [deleteRecentItem, offset, workspaceRequest],
  );
  const deleteSelectedRecent = useCallback(
    async (unlinkApplications: boolean) => {
      const selected = recent.filter((item) => selectedRecentIds.has(item.id));
      if (!selected.length) return;
      if (
        !window.confirm(
          unlinkApplications
            ? `Desvincular aplicações sem cartões e excluir ${selected.length} prova(s) selecionada(s)? Provas com aplicações abertas/encerradas, cartões gerados ou respostas serão preservadas.`
            : `Excluir ${selected.length} prova(s) selecionada(s)? Provas com aplicações ou respostas vinculadas serão preservadas.`,
        )
      )
        return;

      setDeletingSelected(unlinkApplications ? 'unlink' : 'delete');
      setMessage(
        unlinkApplications
          ? 'Desvinculando aplicações e excluindo provas selecionadas…'
          : 'Excluindo provas selecionadas…',
      );
      const failed: Array<{
        id: string;
        title: string;
        reason: string;
      }> = [];
      let deleted = 0;
      for (const item of selected) {
        try {
          await deleteRecentItem(item, unlinkApplications);
          deleted += 1;
        } catch (error) {
          failed.push({
            id: item.id,
            title: item.title || 'Prova sem título',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      try {
        setRecent(await workspaceRequest<typeof recent>(`?offset=${offset}`));
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `Exclusão concluída, mas não foi possível atualizar a lista: ${error.message}`
            : 'Exclusão concluída, mas não foi possível atualizar a lista.',
        );
      }
      setSelectedRecentIds(new Set(failed.map((item) => item.id)));
      setMessage(
        failed.length
          ? `${deleted} prova(s) excluída(s). ${failed.length} não foi(ram) excluída(s): ${failed.map((item) => `${item.title}: ${item.reason}`).join(' ')}${unlinkApplications ? '' : ' As provas não excluídas continuam selecionadas: use “Desvincular e excluir” para remover as vinculadas a aplicações sem cartões.'}`
          : `${deleted} prova(s) excluída(s).`,
      );
      setDeletingSelected(false);
    },
    [deleteRecentItem, offset, recent, selectedRecentIds, workspaceRequest],
  );
  useEffect(() => {
    if (step !== 0) return;
    workspaceRequest<typeof recent>(`?offset=${offset}`)
      .then(setRecent)
      .catch((e) => setMessage(e.message));
  }, [step, offset, workspaceRequest]);
  useEffect(() => {
    if (
      renderedConfiguration.current &&
      renderedConfiguration.current !== configurationKey
    ) {
      setGenerated(false);
      setAssessmentId(null);
      setGeneratedVersions([]);
      renderedConfiguration.current = '';
    }
  }, [configurationKey]);
  useEffect(() => {
    if (!workspaceId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const sequence = ++saveSequence.current;
    queueMicrotask(() => setSaveStatus('Alterações pendentes…'));
    const save = () => {
      pendingSave.current = null;
      saveQueue.current = saveQueue.current
        .then(async () => {
          setSaveStatus('Salvando…');
          const result = await workspaceRequest<{ revision: number }>(
            `/${workspaceId}`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                configuration,
                revision: revisionRef.current,
                assessmentId,
              }),
            },
          );
          revisionRef.current = result.revision;
          if (sequence === saveSequence.current)
            setSaveStatus('Rascunho salvo');
        })
        .catch((e) => {
          setSaveStatus(`Não salvo: ${e.message}`);
        });
    };
    pendingSave.current = save;
    const timer = setTimeout(save, 650);
    return () => clearTimeout(timer);
  }, [workspaceId, configuration, assessmentId, workspaceRequest, saveRetry]);
  useEffect(
    () => () => {
      pendingSave.current?.();
    },
    [],
  );
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (saveStatus && saveStatus !== 'Rascunho salvo') {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [saveStatus]);
  function restoreConfiguration(c: typeof configuration) {
    restoredProfile.current = true;
    skipNextSave.current = true;
    setTitle(c.title);
    setGrade(c.grade);
    setSchoolId(c.schoolId || '');
    setInstitutionName(c.header.institutionName);
    setTeacherName(c.header.teacherName);
    setClassName(c.header.className);
    setTerm(c.header.term);
    setAssessmentDate(c.header.date);
    setTranscriptionPhrase(c.header.transcriptionPhrase);
    setLogoDataUrl(c.header.logoDataUrl);
    setSections(
      c.sections.map((s) => ({
        ...s,
        selected: new Set(s.questionIds),
        fullWidth: new Set(s.fullWidthQuestionIds),
      })),
    );
    setVersions(c.versionCount);
    setPaper(c.paper);
    setTemplate(c.template);
    setQuestionTypeFilter(isJudgmentTemplate(c.template) ? 'true_false' : '');
    setFont(c.font);
    setFontSize(c.fontSize);
    setShowBnccSkills(c.showBnccSkills);
    setShowSaebDescriptors(c.showSaebDescriptors);
    setShowStudentPhoto(c.showStudentPhoto ?? false);
    setInstructions(c.instructions);
    setQuestionPoints(c.questionPoints || {});
    setShuffleQuestions(c.shuffleQuestions ?? false);
  }
  async function openWorkspace(id?: string, duplicate = false) {
    try {
      await saveQueue.current;
      type Workspace = {
        id: string;
        configuration: typeof configuration;
        revision: number;
        assessmentId: string | null;
      };
      let data: Workspace;
      if (id) data = await workspaceRequest<Workspace>(`/${id}`);
      if (!id || duplicate) {
        const c = id
          ? {
              ...data!.configuration,
              title: `${data!.configuration.title.slice(0, 170)} (cópia)`,
            }
          : {
              ...configuration,
              title: 'Nova prova',
              sections: configuration.sections.slice(0, 1).map((s) => ({
                ...s,
                questionIds: [],
                fullWidthQuestionIds: [],
              })),
              questionPoints: {},
            };
        data = await workspaceRequest<Workspace>('', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ configuration: c }),
        });
      }
      if (!data!) return;
      restoreConfiguration(data.configuration);
      revisionRef.current = data.revision;
      setWorkspaceId(data.id);
      setAssessmentId(data.assessmentId);
      setGenerated(false);
      setGeneratedVersions([]);
      setSaveStatus('Rascunho salvo');
      renderedConfiguration.current = '';
      setStep(1);
      setMessage('');
      if (data.assessmentId) {
        const response = await apiFetch(
          `${apiUrl}/api/assessments/${data.assessmentId}`,
        );
        if (!response.ok)
          throw new Error('Não foi possível carregar os PDFs salvos.');
        const body = (await response.json()) as {
          data: {
            versions: Array<{
              code: string;
              renderJob: {
                id: string;
                status: GeneratedVersion['status'];
                error?: string;
              } | null;
            }>;
          };
        };
        setGeneratedVersions(
          body.data.versions
            .filter((v) => v.renderJob)
            .map((v) => ({
              code: v.code,
              renderJobId: v.renderJob!.id,
              status: v.renderJob!.status,
              error: v.renderJob!.error,
            })),
        );
        renderedConfiguration.current = JSON.stringify(
          data!.configuration,
          (_key, value) =>
            value && typeof value === 'object' && !Array.isArray(value)
              ? Object.fromEntries(
                  Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
                )
              : value,
        );
        setGenerated(true);
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Não foi possível abrir a prova.',
      );
    }
  }
  function moveQuestion(sectionId: string, id: string, direction: number) {
    setSections((current) =>
      current.map((s) => {
        if (s.id !== sectionId) return s;
        const ids = [...s.selected],
          index = ids.indexOf(id),
          target = index + direction;
        if (target < 0 || target >= ids.length) return s;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        return { ...s, selected: new Set(ids) };
      }),
    );
  }
  const downloadRenderFile = async (url: string, filename: string) => {
    try {
      const response = await apiFetch(url);
      if (!response.ok) {
        let detail = 'Não foi possível baixar o arquivo.';
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          // A resposta pode ser uma página de erro sem JSON.
        }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Não foi possível baixar o PDF: ${error.message}`
          : 'Não foi possível baixar o PDF. Verifique sua conexão e tente novamente.',
      );
    }
  };
  const [questionSkill, setQuestionSkill] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState('');
  const [questionTopic, setQuestionTopic] = useState('');
  const [questionSubtopic, setQuestionSubtopic] = useState('');
  const [questionSourceInstitution, setQuestionSourceInstitution] =
    useState('');
  const [questionSourceYear, setQuestionSourceYear] = useState('');
  const [questionDifficulty, setQuestionDifficulty] = useState('');
  function resetQuestionFilters() {
    setQuestionSkill('');
    setQuestionTopic('');
    setQuestionSubtopic('');
    setQuestionSourceInstitution('');
    setQuestionSourceYear('');
    setQuestionDifficulty('');
  }
  const activeSection = sections.find(
    (section) => section.id === activeSectionId,
  );
  function activateSection(id: string) {
    if (
      sections.find((section) => section.id === id)?.subject !==
      activeSection?.subject
    ) {
      resetQuestionFilters();
    }
    setActiveSectionId(id);
  }
  const questionsForActiveSubject = questions.filter(
    (question) => question.subject === activeSection?.subject,
  );
  const questionTypeCounts = {
    multipleChoice: questionsForActiveSubject.filter(
      (question) => !['true_false', 'essay'].includes(question.type || ''),
    ).length,
    trueFalse: questionsForActiveSubject.filter(
      (question) => question.type === 'true_false',
    ).length,
    essay: questionsForActiveSubject.filter(
      (question) => question.type === 'essay',
    ).length,
  };
  const effectiveQuestionTypeFilter =
    questionTypeFilter ||
    (isJudgmentTemplate(template) ? 'true_false' : 'multiple_choice');
  const questionsInActiveSubject = questions.filter(
    (question) =>
      question.subject === activeSection?.subject &&
      (effectiveQuestionTypeFilter === 'true_false'
        ? question.type === 'true_false'
        : effectiveQuestionTypeFilter === 'essay'
          ? question.type === 'essay'
          : !['true_false', 'essay'].includes(question.type || '')) &&
      (template !== 'compacto-10-v1' || question.type === 'single_choice'),
  );
  const topicParts = (question: BuilderQuestion) => {
    const path = (question.knowledgeTopic || '')
      .split(/\s*>\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      topic: path[0] || question.knowledgeObject || '',
      subtopic: path[1] || '',
    };
  };
  const availableTopics = Array.from(
    new Set(
      questionsInActiveSubject
        .map((question) => topicParts(question).topic)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const availableSubtopics = Array.from(
    new Set(
      questionsInActiveSubject
        .filter(
          (question) =>
            !questionTopic || topicParts(question).topic === questionTopic,
        )
        .map((question) => topicParts(question).subtopic)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const visibleQuestions = questionsInActiveSubject.filter(
    (question) =>
      (!questionSkill ||
        question.skill.toLowerCase().includes(questionSkill.toLowerCase())) &&
      (!questionTopic || topicParts(question).topic === questionTopic) &&
      (!questionSubtopic ||
        topicParts(question).subtopic === questionSubtopic) &&
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
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const currentQuestionIds = new Set(
        questions.map((question) => question.id),
      );
      setSections((current) => {
        if (!current.length && subjects.length) {
          return [
            {
              id: `section-${Date.now()}`,
              subject: subjects[0],
              columns: 1,
              startOnNewPage: false,
              selected: new Set<string>(),
              fullWidth: new Set<string>(),
            },
          ];
        }
        return current.map((section) => {
          const selected = new Set(
            Array.from(section.selected).filter((id) =>
              currentQuestionIds.has(id),
            ),
          );
          const fullWidth = new Set(
            Array.from(section.fullWidth).filter((id) => selected.has(id)),
          );
          if (
            selected.size === section.selected.size &&
            fullWidth.size === section.fullWidth.size
          )
            return section;
          return { ...section, selected, fullWidth };
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [questions, subjects]);

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
    if (
      isCompactTemplate(template) &&
      chosen.length >= 10 &&
      !chosen.some((question) => question.id === id)
    )
      return setMessage('O modelo compacto aceita no máximo 10 questões.');
    setGenerated(false);
    setSections((current) =>
      current.map((section) => {
        if (section.id !== activeSectionId) return section;
        const selected = new Set(section.selected);
        const fullWidth = new Set(section.fullWidth);
        if (selected.has(id)) {
          selected.delete(id);
          fullWidth.delete(id);
        } else {
          selected.add(id);
        }
        return { ...section, selected, fullWidth };
      }),
    );
  }

  function toggleFullWidth(id: string) {
    setGenerated(false);
    setSections((current) =>
      current.map((section) => {
        if (section.id !== activeSectionId || !section.selected.has(id))
          return section;
        const fullWidth = new Set(section.fullWidth);
        if (fullWidth.has(id)) fullWidth.delete(id);
        else fullWidth.add(id);
        return { ...section, fullWidth };
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
        startOnNewPage: false,
        selected: new Set<string>(),
        fullWidth: new Set<string>(),
      },
    ]);
    activateSection(id);
    setSubjectToAdd('');
    setGenerated(false);
  }

  function selectQuestionSubject(subject: string) {
    const existing = sections.find((section) => section.subject === subject);
    if (existing) {
      activateSection(existing.id);
      return;
    }
    const id = `section-${Date.now()}`;
    setSections((current) => [
      ...current,
      {
        id,
        subject,
        columns: 1,
        startOnNewPage: false,
        selected: new Set<string>(),
        fullWidth: new Set<string>(),
      },
    ]);
    activateSection(id);
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
    const next = sections.filter((section) => section.id !== id);
    setSections(next);
    if (activeSectionId === id) activateSection(next[0]?.id || '');
    setGenerated(false);
  }

  function chooseLogo(file?: File) {
    setSchoolId('');
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
    setSchoolId('');
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
    setQuestionTypeFilter(
      isJudgmentTemplate(configuration.template) ? 'true_false' : '',
    );
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

  async function regenerate() {
    if (!assessmentId) return generate();
    setSaving(true);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/assessments/${assessmentId}/renders`,
        { method: 'POST' },
      );
      const body = (await response.json()) as {
        data: GeneratedVersion[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || 'Falha ao gerar novamente.');
      setGeneratedVersions(body.data);
      setGenerated(true);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  }
  async function generate() {
    if (
      sections.some((s) =>
        [...s.selected].some((id) => !questions.some((q) => q.id === id)),
      )
    )
      return setMessage(
        'Há questões indisponíveis no banco carregado. Atualize o banco ou remova-as antes de gerar.',
      );
    const configuredSections = sections.filter(
      (section) => section.selected.size > 0,
    );
    if (!configuredSections.length)
      return setMessage('Selecione pelo menos uma questão.');
    try {
      assertAssessmentQuestionStyle(chosen, template);
    } catch (error) {
      return setMessage(
        error instanceof Error
          ? error.message
          : 'Seleção incompatível com o modelo.',
      );
    }
    if (isCompactTemplate(template) && paper !== 'A4')
      return setMessage('O modelo compacto usa papel A4.');
    setSaving(true);
    setMessage('');
    try {
      // Persist any pending organization/configuration edits before creating
      // the assessment and queuing the ConTeXt PDFs.
      pendingSave.current?.();
      await saveQueue.current;
      if (
        apiUrl &&
        chosen.every((question) => /^[0-9a-f-]{36}$/i.test(question.id))
      ) {
        const response = await apiFetch(`${apiUrl}/api/assessments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(schoolId ? { schoolId } : {}),
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
              fullWidthQuestionIds: Array.from(section.fullWidth),
            })),
            versionCount: versions,
            paper,
            template,
            font,
            fontSize,
            showBnccSkills,
            showSaebDescriptors,
            showStudentPhoto,
            instructions,
            questionPoints: Object.fromEntries(
              chosen.map((q) => [q.id, questionPoints[q.id] ?? q.points ?? 1]),
            ),
            shuffleQuestions,
          }),
        });
        const body = (await response.json()) as {
          data: {
            id: string;
            versions: Array<{ code: string; renderJobId?: string }>;
          };
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Não foi possível gerar a avaliação.');
        setAssessmentId(body.data.id);
        renderedConfiguration.current = configurationKey;
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
        throw new Error(
          'Conecte a API e selecione questões cadastradas para gerar a prévia real.',
        );
      }
      setGenerated(true);
      setStep(4);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao gerar avaliação.',
      );
    } finally {
      setSaving(false);
    }
  }

  const setupReady =
    title.trim().length >= 5 &&
    grade.trim().length > 0 &&
    institutionName.trim().length > 0 &&
    teacherName.trim().length > 0;

  return (
    <div className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[.15em] text-[var(--blue)]">
            Montagem e versões
          </p>
          <h1 className="font-display text-3xl font-bold tracking-[-.03em] text-[var(--navy)] sm:text-[38px]">
            Elaborar prova
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Configure a prova, escolha as questões, organize as seções e revise
            os PDFs antes da aplicação.
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
      <nav
        aria-label="Etapas da elaboração"
        className="my-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            disabled={!!workspaceId && saveStatus !== 'Rascunho salvo'}
            onClick={() => {
              setMessage('');
              setStep(0);
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${step === 0 ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <FolderOpen className="size-4" /> Provas recentes
          </button>
          {workspaceId && (
            <span className="text-xs font-medium text-slate-500">
              {saveStatus || 'Salvando rascunho…'}
            </span>
          )}
        </div>
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {[
            'Identificação',
            'Questões',
            'Organização',
            'Prévia e revisão',
            'Aplicação',
          ].map((label, position) => {
            const index = position + 1;
            const disabled =
              !workspaceId ||
              (index >= 2 && !setupReady) ||
              (index >= 3 && !chosen.length) ||
              (index === 5 &&
                (!generated ||
                  !assessmentId ||
                  generatedVersions.some((v) => v.status !== 'completed')));
            return (
              <li key={label} className="min-w-[155px] flex-1 lg:min-w-0">
                <button
                  type="button"
                  aria-current={step === index ? 'step' : undefined}
                  disabled={disabled}
                  onClick={() => {
                    setMessage('');
                    setStep(index);
                  }}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${step === index ? 'border-blue-500 bg-blue-50 text-blue-950 shadow-sm' : index < step ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-50' : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-blue-200 hover:bg-blue-50/50'}`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step === index ? 'bg-blue-600 text-white' : index < step ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                  >
                    {index < step ? <Check className="size-4" /> : index}
                  </span>
                  <span className="text-sm font-semibold leading-tight">
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-slate-500 lg:hidden">
          Deslize para acompanhar as próximas etapas.
        </p>
      </nav>
      {workspaceId && (
        <div className="mb-3 text-sm">
          <output>{saveStatus}</output>
          {saveStatus.startsWith('Não salvo') && (
            <>
              <Button
                variant="outline"
                onClick={() => setSaveRetry((n) => n + 1)}
              >
                Tentar salvar novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => openWorkspace(workspaceId)}
              >
                Reabrir versão salva
              </Button>
            </>
          )}
        </div>
      )}
      {message && <output className="my-3 block text-sm">{message}</output>}
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingWorkspaceId) {
            setPendingDelete(null);
            setUnlinkUnsentApplications(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir prova gerada?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title || 'Prova sem título'}” e seus arquivos
              serão removidos. Aplicações com cartões gerados, enviados ou
              respondidos sempre serão preservadas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <input
              id="unlink-unsent-applications"
              type="checkbox"
              checked={unlinkUnsentApplications}
              onChange={(event) =>
                setUnlinkUnsentApplications(event.target.checked)
              }
              className="mt-0.5 size-4 shrink-0 accent-amber-700"
            />
            <label
              htmlFor="unlink-unsent-applications"
              className="cursor-pointer"
            >
              <span className="block font-semibold">
                Desvincular aplicações sem cartões
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-amber-900">
                Remove somente aplicações agendadas ou canceladas que ainda não
                tiveram cartões gerados nem enviados. A turma e os alunos não
                serão excluídos.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(deletingWorkspaceId)}
              onClick={() => setPendingDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-rose-700 text-white hover:bg-rose-800"
              disabled={!pendingDelete || Boolean(deletingWorkspaceId)}
              onClick={() =>
                pendingDelete &&
                void confirmRecentDelete(
                  pendingDelete,
                  unlinkUnsentApplications,
                )
              }
            >
              {deletingWorkspaceId ? 'Excluindo…' : 'Excluir prova'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {step === 0 && (
        <section className="space-y-4 rounded-xl border bg-white p-5">
          <div className="flex gap-3">
            <Button onClick={() => openWorkspace()}>Nova prova</Button>
            <Button
              variant="outline"
              disabled={!workspaceId && !recent.some((r) => !r.assessmentId)}
              onClick={() =>
                workspaceId
                  ? setStep(1)
                  : openWorkspace(recent.find((r) => !r.assessmentId)?.id)
              }
            >
              Continuar rascunho
            </Button>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {offset ? 'Provas arquivadas' : 'Provas recentes'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Suas provas e rascunhos, com acesso rápido às principais ações.
              </p>
            </div>
            <Badge variant="secondary">{recent.length} nesta página</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                aria-label="Selecionar todas as provas desta página"
                checked={
                  recent.length > 0 &&
                  recent.every((item) => selectedRecentIds.has(item.id))
                }
                disabled={!recent.length || Boolean(deletingSelected)}
                onChange={(event) =>
                  setSelectedRecentIds(
                    event.target.checked
                      ? new Set(recent.map((item) => item.id))
                      : new Set(),
                  )
                }
                className="size-4 rounded border-slate-300 accent-indigo-600"
              />
              Selecionar todas desta página
              {selectedRecentIds.size > 0 && (
                <span className="text-slate-500">
                  {selectedRecentIds.size} selecionada(s)
                </span>
              )}
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedRecentIds.size || Boolean(deletingSelected)}
              className="border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
              onClick={() => void deleteSelectedRecent(false)}
            >
              {deletingSelected === 'delete' ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deletingSelected === 'delete'
                ? 'Excluindo…'
                : 'Excluir selecionadas'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedRecentIds.size || Boolean(deletingSelected)}
              title="Desvincula aplicações ainda não aplicadas (sem cartões gerados ou respondidos) e exclui as provas selecionadas."
              className="border-amber-200 bg-white text-amber-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
              onClick={() => void deleteSelectedRecent(true)}
            >
              {deletingSelected === 'unlink' ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Unlink aria-hidden="true" />
              )}
              {deletingSelected === 'unlink'
                ? 'Desvinculando…'
                : 'Desvincular e excluir'}
            </Button>
          </div>
          <div className="grid gap-3">
            {recent.map((r) => (
              <article
                key={r.id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${r.title || 'prova sem título'}`}
                    checked={selectedRecentIds.has(r.id)}
                    disabled={Boolean(deletingSelected)}
                    onChange={(event) =>
                      setSelectedRecentIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                    className="mt-3 size-4 shrink-0 rounded border-slate-300 accent-indigo-600"
                  />
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                    <FileOutput className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {r.title || 'Prova sem título'}
                      </h3>
                      <Badge variant={r.assessmentId ? 'default' : 'outline'}>
                        {r.assessmentId ? 'Gerada' : 'Rascunho'}
                      </Badge>
                      {r.pinned && <Badge variant="secondary">Fixada</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {[
                        r.subject,
                        r.grade,
                        new Date(r.updatedAt).toLocaleDateString('pt-BR'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:flex sm:shrink-0 sm:bg-transparent sm:p-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 sm:w-auto"
                    onClick={() => openWorkspace(r.id)}
                  >
                    <FolderOpen aria-hidden="true" />
                    Reabrir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 sm:w-auto"
                    onClick={() => openWorkspace(r.id, true)}
                  >
                    <CopyPlus aria-hidden="true" />
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={r.pinned}
                    aria-label={r.pinned ? 'Desafixar prova' : 'Fixar prova'}
                    className="w-full border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800 sm:w-auto"
                    onClick={async () => {
                      try {
                        await workspaceRequest(`/${r.id}/pin`, {
                          method: 'PATCH',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ pinned: !r.pinned }),
                        });
                        setRecent(
                          await workspaceRequest<typeof recent>(
                            `?offset=${offset}`,
                          ),
                        );
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    {r.pinned ? (
                      <PinOff aria-hidden="true" />
                    ) : (
                      <Pin aria-hidden="true" />
                    )}
                    {r.pinned ? 'Desafixar' : 'Fixar'}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={
                      deletingWorkspaceId === r.id || Boolean(deletingSelected)
                    }
                    aria-label={
                      deletingWorkspaceId === r.id
                        ? 'Excluindo prova'
                        : 'Excluir prova'
                    }
                    className="w-full border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 sm:w-auto"
                    onClick={async () => {
                      if (r.assessmentId) {
                        setUnlinkUnsentApplications(false);
                        setPendingDelete(r);
                        return;
                      }
                      if (
                        window.confirm(
                          `Excluir “${r.title || 'Prova sem título'}” da lista? Esta ação remove o rascunho salvo.`,
                        )
                      )
                        await confirmRecentDelete(r);
                    }}
                  >
                    {deletingWorkspaceId === r.id ? (
                      <LoaderCircle
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                    {deletingWorkspaceId === r.id ? 'Excluindo…' : 'Excluir'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!recent.length && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <FileOutput
                className="mx-auto size-8 text-slate-500"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium text-slate-800">
                Nenhuma prova salva nesta página
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Crie uma nova prova ou consulte o arquivo.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => {
                setSelectedRecentIds(new Set());
                setOffset(Math.max(0, offset - 10));
              }}
            >
              Anteriores
            </Button>
            <Button
              variant="outline"
              disabled={recent.length < 10}
              onClick={() => {
                setSelectedRecentIds(new Set());
                setOffset(offset + 10);
              }}
            >
              Ver arquivo
            </Button>
          </div>
        </section>
      )}
      {step === 5 && assessmentId && (
        <AssessmentApplicationStep
          apiUrl={apiUrl}
          assessmentId={assessmentId}
        />
      )}
      <fieldset
        disabled={saving}
        className={
          step > 0 && step < 5
            ? step === 1 || step === 4
              ? 'mt-7 grid gap-5'
              : 'mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]'
            : 'hidden'
        }
      >
        <div className="space-y-5">
          <section
            className={
              step === 3
                ? 'rounded-2xl border border-slate-200 bg-white p-5'
                : 'hidden'
            }
          >
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
                  className={`rounded-xl border p-4 transition ${
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
                        <button
                          type="button"
                          onClick={() => activateSection(section.id)}
                          className="text-left font-semibold text-slate-900 hover:text-blue-700"
                        >
                          {section.subject}
                        </button>
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
                      className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
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
                    <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
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
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="text-sm text-slate-500">
                {chosen.length} questões distribuídas em{' '}
                {sections.filter((section) => section.selected.size).length}{' '}
                seção(ões).
              </p>
              <Button
                disabled={!chosen.length}
                onClick={() => {
                  setMessage('');
                  setStep(4);
                }}
              >
                Revisar e gerar prévia
              </Button>
            </div>
          </section>

          <section
            className={
              step === 2
                ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white'
                : 'hidden'
            }
          >
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
            <Input
              aria-label="Filtrar por habilidade BNCC"
              placeholder="Habilidade BNCC"
              value={questionSkill}
              onChange={(e) => setQuestionSkill(e.target.value)}
            />
            <div className="grid gap-2 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-3">
              <select
                aria-label="Formato das questões"
                value={effectiveQuestionTypeFilter}
                onChange={(event) => {
                  const nextType = event.target.value;
                  const wantsJudgment = nextType === 'true_false';
                  const requiresStandardTemplate = nextType === 'essay';
                  const nextTemplate = wantsJudgment
                    ? isCompactTemplate(template)
                      ? 'certo-errado-10-v1'
                      : 'certo-errado-v1'
                    : requiresStandardTemplate
                      ? 'basicexam-v1'
                      : isJudgmentTemplate(template)
                        ? isCompactTemplate(template)
                          ? 'compacto-10-v1'
                          : 'basicexam-v1'
                        : template;
                  const incompatibleIds = new Set(
                    chosen
                      .filter((question) =>
                        wantsJudgment
                          ? question.type !== 'true_false'
                          : question.type === 'true_false',
                      )
                      .map((question) => question.id),
                  );
                  const nextTypeLabel =
                    nextType === 'true_false'
                      ? 'Certo/Errado'
                      : nextType === 'essay'
                        ? 'Discursivas'
                        : 'múltipla escolha';
                  if (
                    incompatibleIds.size > 0 &&
                    !window.confirm(
                      `O formato selecionado não aceita ${incompatibleIds.size} questão(ões) já escolhida(s). Deseja removê-las e trocar para ${nextTypeLabel}?`,
                    )
                  )
                    return;
                  if (incompatibleIds.size > 0) {
                    setSections((current) =>
                      current.map((section) => {
                        const selected = new Set(section.selected);
                        const fullWidth = new Set(section.fullWidth);
                        for (const id of incompatibleIds) {
                          selected.delete(id);
                          fullWidth.delete(id);
                        }
                        return { ...section, selected, fullWidth };
                      }),
                    );
                    setGenerated(false);
                  }
                  if (nextTemplate !== template) {
                    setTemplate(nextTemplate);
                    setGenerated(false);
                  }
                  setQuestionTypeFilter(nextType);
                  if (isCompactTemplate(nextTemplate)) setPaper('A4');
                }}
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="multiple_choice">
                  Múltipla escolha ({questionTypeCounts.multipleChoice})
                </option>
                <option value="true_false">
                  Certo/Errado ({questionTypeCounts.trueFalse})
                </option>
                <option value="essay">
                  Discursivas ({questionTypeCounts.essay})
                </option>
              </select>
              <select
                aria-label="Filtrar por disciplina"
                value={activeSection?.subject || ''}
                onChange={(event) => selectQuestionSubject(event.target.value)}
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                {subjects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por tópico ou objeto de conhecimento"
                value={questionTopic}
                onChange={(event) => {
                  setQuestionTopic(event.target.value);
                  setQuestionSubtopic('');
                }}
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="">Todos os tópicos/objetos</option>
                {availableTopics.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por subtópico"
                value={questionSubtopic}
                disabled={!availableSubtopics.length}
                onChange={(event) => setQuestionSubtopic(event.target.value)}
                className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Todos os subtópicos</option>
                {availableSubtopics.map((item) => (
                  <option key={item} value={item}>
                    {item}
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
              {(questionTopic ||
                questionSubtopic ||
                questionSourceInstitution ||
                questionSourceYear ||
                questionDifficulty) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuestionTopic('');
                    setQuestionSubtopic('');
                    setQuestionSourceInstitution('');
                    setQuestionSourceYear('');
                    setQuestionDifficulty('');
                  }}
                  className="text-left text-xs font-semibold text-blue-600 xl:col-span-3"
                >
                  Limpar filtros · {visibleQuestions.length} encontradas
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {visibleQuestions.map((question) => (
                <article
                  key={question.id}
                  className={`p-4 transition hover:bg-blue-50/50 ${
                    activeSection?.selected.has(question.id)
                      ? 'bg-blue-50/40'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(question.id)}
                    className="flex w-full items-start gap-3 text-left"
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
                        <span className="text-xs text-slate-500">
                          {question.grade} · {question.difficulty}
                        </span>
                        <span className="text-xs text-slate-500">
                          {question.sourceInstitution} {question.sourceYear}
                        </span>
                        {topicParts(question).topic && (
                          <span className="text-xs font-medium text-slate-500">
                            {topicParts(question).topic}
                            {topicParts(question).subtopic
                              ? ` › ${topicParts(question).subtopic}`
                              : ''}
                          </span>
                        )}
                      </div>
                      {question.recommendSingleColumn && (
                        <p className="mb-1 text-xs font-semibold text-blue-700">
                          Sempre em uma coluna · definido no cadastro
                        </p>
                      )}
                      <p className="text-sm font-medium leading-5 text-slate-800">
                        {question.statement}
                      </p>
                    </div>
                  </button>
                  {activeSection?.selected.has(question.id) &&
                    activeSection.columns === 2 && (
                      <label className="mt-3 ml-8 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={
                            question.recommendSingleColumn ||
                            activeSection.fullWidth.has(question.id)
                          }
                          disabled={question.recommendSingleColumn}
                          onChange={() => toggleFullWidth(question.id)}
                          className="accent-blue-600"
                        />
                        {question.recommendSingleColumn
                          ? 'Largura total (1 coluna) · definido no cadastro da questão'
                          : 'Usar largura total (1 coluna) para esta questão'}
                      </label>
                    )}
                </article>
              ))}
              {!visibleQuestions.length && (
                <div className="p-8 text-center text-sm text-slate-500">
                  Adicione ou selecione uma disciplina para consultar suas
                  questões.
                </div>
              )}
            </div>
          </section>
          {step === 4 && (
            <section className="space-y-5">
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">
                  Etapa final antes da aplicação
                </p>
                <h2 className="mt-2 text-xl font-bold text-[var(--navy)]">
                  Revisão da prova no ConTeXt
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {generated
                    ? 'A prova foi enviada para composição. Acompanhe o processamento e confira cada PDF antes de aplicar à turma.'
                    : 'A compilação acontece somente nesta etapa. Confira as configurações e a organização; quando estiver tudo pronto, gere os PDFs e revise cada versão antes de aplicar.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full border bg-white px-3 py-1.5">
                    {chosen.length}{' '}
                    {chosen.length === 1 ? 'questão' : 'questões'}
                  </span>
                  <span className="rounded-full border bg-white px-3 py-1.5">
                    {sections.filter((section) => section.selected.size).length}{' '}
                    {sections.filter((section) => section.selected.size)
                      .length === 1
                      ? 'disciplina'
                      : 'disciplinas'}
                  </span>
                  <span className="rounded-full border bg-white px-3 py-1.5">
                    {versions} {versions === 1 ? 'versão' : 'versões'} · {paper}
                  </span>
                  <span className="rounded-full border bg-white px-3 py-1.5">
                    {templates.find((item) => item.id === template)?.label ||
                      template}
                  </span>
                </div>
                {!generated && (
                  <Button
                    className="mt-5 bg-[var(--blue)] text-white hover:bg-blue-700"
                    disabled={saving || !chosen.length}
                    onClick={generate}
                  >
                    <Sparkles className="size-4" />
                    {saving
                      ? 'Enviando para compilação…'
                      : 'Gerar prévia ConTeXt'}
                  </Button>
                )}
              </div>
              {generated && (
                <>
                  <div>
                    <h3 className="font-semibold text-[var(--navy)]">
                      PDFs para revisar
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Confira todas as páginas, imagens, QR codes e marcações na
                      prova e no gabarito. Se alterar a configuração, gere uma
                      nova prévia.
                    </p>
                  </div>
                  {generatedVersions
                    .filter((v) => v.status === 'completed' && v.renderJobId)
                    .map((v) => (
                      <AssessmentPdfPreview
                        key={v.renderJobId}
                        apiUrl={apiUrl}
                        jobId={v.renderJobId!}
                        code={v.code}
                      />
                    ))}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={saving || !chosen.length}
                      onClick={regenerate}
                    >
                      Gerar PDFs novamente
                    </Button>
                    <Button
                      disabled={
                        !assessmentId ||
                        !generated ||
                        !generatedVersions.length ||
                        generatedVersions.some((v) => v.status !== 'completed')
                      }
                      onClick={() => setStep(5)}
                    >
                      Finalizar revisão e aplicar à turma
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
        <aside className="space-y-5">
          {(step === 2 || step === 3) && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-xl font-bold">Prova em montagem</h2>
              <p className="my-3">
                {chosen.length} questões ·{' '}
                {chosen.reduce(
                  (sum, q) => sum + (questionPoints[q.id] ?? q.points ?? 1),
                  0,
                )}{' '}
                pontos
              </p>
              {sections.map((section) => (
                <div key={section.id}>
                  <h3 className="my-3 font-bold">
                    {section.subject} · {section.selected.size} questões
                  </h3>
                  {[...section.selected].map((id, index) => {
                    const q = questions.find((q) => q.id === id);
                    return (
                      <article key={id} className="my-2 rounded border p-3">
                        <p>
                          {index + 1}. {q?.code} —{' '}
                          {q?.statement.slice(0, 180) ||
                            'Questão indisponível no banco carregado'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {q?.difficulty} · {q?.skill}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            disabled={index === 0}
                            onClick={() => moveQuestion(section.id, id, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="outline"
                            disabled={index === section.selected.size - 1}
                            onClick={() => moveQuestion(section.id, id, 1)}
                          >
                            ↓
                          </Button>
                          <label>
                            Pontos{' '}
                            <input
                              aria-label={`Pontos da questão ${index + 1}`}
                              type="number"
                              min="0.01"
                              max="1000"
                              step="0.01"
                              className="w-20 rounded border p-1"
                              value={questionPoints[id] ?? q?.points ?? 1}
                              onChange={(e) =>
                                setQuestionPoints((p) => ({
                                  ...p,
                                  [id]: Number(e.target.value),
                                }))
                              }
                            />
                          </label>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setSections((current) =>
                                current.map((s) =>
                                  s.id !== section.id
                                    ? s
                                    : {
                                        ...s,
                                        selected: new Set(
                                          [...s.selected].filter(
                                            (x) => x !== id,
                                          ),
                                        ),
                                        fullWidth: new Set(
                                          [...s.fullWidth].filter(
                                            (x) => x !== id,
                                          ),
                                        ),
                                      },
                                ),
                              )
                            }
                          >
                            Remover
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
              <label className="my-4 block">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                />{' '}
                Embaralhar questões entre versões
              </label>
              <p className="text-xs">
                Desmarcado: preserva a ordem definida. O gabarito acompanha as
                alternativas de cada versão.
              </p>
              {step === 2 && (
                <Button
                  className="mt-4 w-full"
                  disabled={saving || !chosen.length}
                  onClick={() => {
                    setMessage('');
                    setStep(3);
                  }}
                >
                  Continuar para organização
                </Button>
              )}
            </section>
          )}

          <section
            className={
              step === 1
                ? 'mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7'
                : 'hidden'
            }
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Layers3 className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--navy)]">
                  1. Identificação e modelo
                </h2>
                <p className="text-sm text-slate-500">
                  Defina o cabeçalho e o formato de impressão. Depois, selecione
                  as questões.
                </p>
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
                Escola cadastrada para o cabeçalho
              </span>
              <select
                className="mb-3 w-full rounded-lg border p-2"
                value={schoolId}
                onChange={(event) => {
                  const id = event.target.value;
                  setSchoolId(id);
                  const school = schools.find((item) => item.id === id);
                  if (school) {
                    setInstitutionName(
                      `${school.name} — ${school.city}/${school.state}`,
                    );
                    setLogoDataUrl(school.logoDataUrl);
                  }
                  setGenerated(false);
                }}
              >
                <option value="">Cabeçalho personalizado</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name} — {school.city}/{school.state}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="assessment-institution-name" className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">
                Nome da instituição / município
              </span>
              <Input
                id="assessment-institution-name"
                value={institutionName}
                onChange={(event) => {
                  setSchoolId('');
                  setInstitutionName(event.target.value);
                }}
                placeholder="Ex.: Escola Municipal Paulo Freire"
              />
            </label>
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
              <div className="flex items-center gap-3">
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 text-slate-500">
                  {logoDataUrl ? (
                    <div
                      aria-hidden="true"
                      className="size-full bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${logoDataUrl}")` }}
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
                          setSchoolId('');
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
            <label htmlFor="assessment-title" className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">Título</span>
              <Input
                id="assessment-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className="mt-4 grid grid-cols-[1fr_96px] gap-3">
              <label htmlFor="assessment-pdf-font">
                <span className="mb-2 block text-sm font-semibold">
                  Fonte do PDF
                </span>
                <select
                  id="assessment-pdf-font"
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
              <label htmlFor="assessment-teacher-name">
                <span className="mb-2 block text-sm font-semibold">
                  Professor(a)
                </span>
                <Input
                  id="assessment-teacher-name"
                  value={teacherName}
                  onChange={(event) => setTeacherName(event.target.value)}
                  placeholder="Nome"
                />
              </label>
              <label htmlFor="assessment-class-name">
                <span className="mb-2 block text-sm font-semibold">Turma</span>
                <Input
                  id="assessment-class-name"
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  placeholder="Ex.: 7º A"
                />
              </label>
              <label htmlFor="assessment-term">
                <span className="mb-2 block text-sm font-semibold">
                  Período
                </span>
                <Input
                  id="assessment-term"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Ex.: 2º bimestre"
                />
              </label>
              <label htmlFor="assessment-date">
                <span className="mb-2 block text-sm font-semibold">Data</span>
                <Input
                  id="assessment-date"
                  value={assessmentDate}
                  onChange={(event) => setAssessmentDate(event.target.value)}
                  placeholder="Ex.: 15/09/2026"
                />
              </label>
            </div>
            <label htmlFor="assessment-grade" className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">
                Etapa ou série
              </span>
              <Input
                id="assessment-grade"
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
                  <option value="A5" disabled={isCompactTemplate(template)}>
                    A5
                  </option>
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold">
                Layout de impressão
              </span>
              <select
                value={template}
                onChange={(event) => {
                  const next = event.target.value;
                  if (
                    next !== template &&
                    (isJudgmentTemplate(next) !==
                      isJudgmentTemplate(template) ||
                      isCompactTemplate(next))
                  ) {
                    setSections((current) =>
                      current.map((section) => ({
                        ...section,
                        selected: new Set<string>(),
                        fullWidth: new Set<string>(),
                      })),
                    );
                    setMessage(
                      'Estilo alterado. Selecione as questões compatíveis com a prova.',
                    );
                  }
                  if (isCompactTemplate(next)) setPaper('A4');
                  setQuestionTypeFilter(
                    isJudgmentTemplate(next)
                      ? 'true_false'
                      : isCompactTemplate(next)
                        ? 'multiple_choice'
                        : '',
                  );
                  setTemplate(next);
                }}
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
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                id="show-bncc-skills"
                type="checkbox"
                checked={showBnccSkills}
                onChange={(event) => {
                  setShowBnccSkills(event.target.checked);
                  setGenerated(false);
                }}
                className="mt-0.5 size-4 accent-blue-600"
              />
              <span>
                <label
                  htmlFor="show-bncc-skills"
                  className="block text-sm font-semibold"
                >
                  Exibir habilidade BNCC nas questões
                </label>
                <span className="mt-1 block text-xs text-slate-500">
                  Mostra a habilidade antes do enunciado. A instituição e o ano
                  da fonte são sempre exibidos em negrito.
                </span>
              </span>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                id="show-saeb-descriptors"
                type="checkbox"
                checked={showSaebDescriptors}
                onChange={(event) => {
                  setShowSaebDescriptors(event.target.checked);
                  setGenerated(false);
                }}
                className="mt-0.5 size-4 accent-cyan-700"
              />
              <span>
                <label
                  htmlFor="show-saeb-descriptors"
                  className="block text-sm font-semibold"
                >
                  Exibir descritor SAEB nas questões
                </label>
                <span className="mt-1 block text-xs text-slate-500">
                  Mostra o código do descritor antes do enunciado somente nas
                  questões que possuem vínculo SAEB.
                </span>
              </span>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                id="show-student-photo"
                type="checkbox"
                checked={showStudentPhoto}
                onChange={(event) => {
                  setShowStudentPhoto(event.target.checked);
                  setGenerated(false);
                }}
                className="mt-0.5 size-4 accent-blue-600"
              />
              <span>
                <label
                  htmlFor="show-student-photo"
                  className="block text-sm font-semibold"
                >
                  Foto do aluno no cartão-resposta
                </label>
                <span className="mt-1 block text-xs text-slate-500">
                  Usa a foto do cadastro da turma nos cartões gerados para cada
                  aluno. Quem não tem foto recebe o espaço em branco.
                </span>
              </span>
            </div>
            {
              <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label
                  htmlFor="assessment-transcription-phrase"
                  className="block"
                >
                  <span className="mb-2 block text-sm font-semibold">
                    Frase para transcrição
                  </span>
                  <Input
                    id="assessment-transcription-phrase"
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
                    Uma instrução por linha, no máximo 10. A instrução 9 orienta
                    o preenchimento correto.
                  </span>
                </label>
              </div>
            }
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  Prévia do cabeçalho
                </span>
                <span className="text-xs text-slate-500">
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
                    <div className="grid h-8 place-items-center overflow-hidden text-slate-500">
                      {logoDataUrl ? (
                        <div
                          aria-hidden="true"
                          className="h-8 w-12 bg-contain bg-center bg-no-repeat"
                          style={{ backgroundImage: `url("${logoDataUrl}")` }}
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
                    {isJudgmentTemplate(template)
                      ? 'Cada versão recebe ordem própria de questões. As opções permanecem C e E.'
                      : 'Cada versão recebe ordem própria de questões e alternativas, preservando o gabarito por chave estável.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <p className="text-xs text-slate-500">
                Título, série, instituição e professor são obrigatórios.
              </p>
              <Button
                disabled={!setupReady}
                onClick={() => {
                  setMessage('');
                  setStep(2);
                }}
              >
                Continuar para questões
              </Button>
            </div>
          </section>
          {step === 4 && generated && (
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
                          <button
                            type="button"
                            onClick={() =>
                              downloadRenderFile(
                                version.renderJobId
                                  ? `${apiUrl}${version.downloads?.prova || `/api/render-jobs/${version.renderJobId}/prova`}`
                                  : '/generated/avaliacao-modelo.pdf',
                                `prova-${version.code}.pdf`,
                              )
                            }
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                          >
                            <Printer className="size-3.5" />
                            Prova
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadRenderFile(
                                version.renderJobId
                                  ? `${apiUrl}${version.downloads?.gabarito || `/api/render-jobs/${version.renderJobId}/gabarito`}`
                                  : '/generated/avaliacao-modelo.pdf',
                                `gabarito-${version.code}.pdf`,
                              )
                            }
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-blue-50"
                          >
                            <FileOutput className="size-3.5" />
                            Gabarito
                          </button>
                          {version.renderJobId && (
                            <>
                              <a
                                href={`${apiUrl}${version.downloads?.provaTex || `/api/render-jobs/${version.renderJobId}/prova.tex`}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                              >
                                <BookOpen className="size-3.5" />
                                Ver ConTeXt
                              </a>
                              <a
                                href={`${apiUrl}${version.downloads?.provaTex || `/api/render-jobs/${version.renderJobId}/prova.tex`}?download=1`}
                                download={`prova-${version.code}.tex`}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-2 text-xs font-semibold text-violet-800 hover:bg-violet-50"
                              >
                                <FileOutput className="size-3.5" />
                                Baixar .tex
                              </a>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="col-span-2 inline-flex h-9 items-center justify-center rounded-lg bg-slate-50 text-xs font-medium text-slate-500">
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
      </fieldset>
    </div>
  );
}
