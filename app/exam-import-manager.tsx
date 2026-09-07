'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Eye,
  FileText,
  FileUp,
  RefreshCw,
  ScanText,
  Sparkles,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { parsePastedQuestion } from './question-paste-importer';
import type { RichContentBlock } from './rich-content-editor';

type ExamImport = {
  id: string;
  sourceInstitution: string;
  sourceYear: number;
  examType: string;
  subjectMode: string;
  primarySubject?: string;
  sourceUrl?: string;
  rightsStatus: string;
  status: string;
  detectedQuestions: number;
  reviewedQuestions: number;
  error?: string;
  candidates: ExamImportCandidate[];
  processingJob?: {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    stage: string;
    progress: number;
    attempts: number;
    error?: string;
  } | null;
  aiJob?: {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    stage: string;
    progress: number;
    attempts: number;
    error?: string;
    provider?: string;
    model?: string;
    promptVersion?: string;
    metrics?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  } | null;
  documents: Array<{
    id: string;
    kind: 'exam' | 'answer_key';
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  createdAt: string;
};

type ExamImportCandidate = {
  id: string;
  sourceNumber: number;
  rawText: string;
  selected: boolean;
  questionType: 'single_choice' | 'multiple_choice' | 'essay';
  status: 'complete' | 'review' | 'completed' | 'duplicate' | 'ignored';
  pageNumber?: number;
  extractionMethod?: 'text' | 'ocr';
  imageDataUrl?: string;
  imageAlt?: string;
  imageExtractionMethod?: 'automatic_page_region';
  visualCaptureWarning?: string;
  correctAnswers?: string[];
  answerStatus?: 'missing' | 'suggested' | 'confirmed';
  answerConfidence?: number;
  grade?: string;
  difficulty?: BulkSettings['difficulty'];
  skill?: string;
  pedagogicalDisciplineId?: string;
  pedagogicalTopicId?: string;
  duplicateQuestionId?: string;
  duplicateQuestionCode?: string;
  aiSuggestion?: {
    normalizedText: string;
    questionType: ExamImportCandidate['questionType'];
    subject?: string | null;
    grade?: string | null;
    difficulty?: BulkSettings['difficulty'] | null;
    correctAnswers: string[];
    skillCode?: string | null;
    topicId?: string | null;
    confidence: number;
    warnings: string[];
    model: string;
    promptVersion: string;
    provider?: string;
  };
};

type PdfPreview = {
  name: string;
  size: number;
  url: string;
};

type StoredPdfPreview = {
  importId: string;
  documentId: string;
  title: string;
  name: string;
  size: number;
};

type BulkSettings = {
  grade: string;
  difficulty: 'Fácil' | 'Média' | 'Difícil';
  skill: string;
  pedagogicalDisciplineId: string;
  objectId: string;
  topicId: string;
  detailId: string;
};

type ReviewFilters = {
  query: string;
  status: string;
  questionType: string;
  institution: string;
  grade: string;
  topicId: string;
};

type PedagogicalDiscipline = {
  id: string;
  name: string;
  stage: string;
};

type PedagogicalTopic = {
  id: string;
  name: string;
  discipline_id: string;
  parent_id: string | null;
  grade_range: string;
  depth: number;
  path: string;
  skills?: Array<{ id: string; code: string; description: string }>;
};

type DuplicateQuestion = {
  id: string;
  code: string;
  duplicateOfQuestionId: string;
  duplicateOfCode: string;
  duplicateDetectedAt: string;
  duplicateReason: string;
  subject: string;
  grade: string;
  sourceInstitution: string;
  sourceYear: number;
  statement: string;
};

const defaultBulkSettings: BulkSettings = {
  grade: '',
  difficulty: 'Média',
  skill: '',
  pedagogicalDisciplineId: '',
  objectId: '',
  topicId: '',
  detailId: '',
};

function candidateReadiness(candidate: ExamImportCandidate) {
  const reasons: string[] = [];
  if (!candidate.selected) reasons.push('não selecionada');
  if (candidate.status === 'completed') reasons.push('já cadastrada');
  if (candidate.status === 'duplicate') reasons.push('questão duplicada');
  if (candidate.status === 'ignored') reasons.push('questão ignorada');
  if (candidate.questionType === 'essay')
    reasons.push('discursiva exige revisão individual');
  const labels = Object.keys(
    parsePastedQuestion(candidate.rawText).alternatives,
  )
    .sort()
    .join('');
  if (candidate.questionType !== 'essay' && labels !== 'ABCDE')
    reasons.push('alternativas A–E incompletas');
  if (
    candidate.questionType !== 'essay' &&
    candidate.answerStatus !== 'confirmed'
  )
    reasons.push('gabarito não confirmado');
  const answerCount = candidate.correctAnswers?.length || 0;
  if (candidate.questionType === 'single_choice' && answerCount !== 1)
    reasons.push('selecione uma resposta correta');
  if (candidate.questionType === 'multiple_choice' && answerCount < 2)
    reasons.push('selecione pelo menos duas respostas corretas');
  return { ready: reasons.length === 0, reasons };
}

function candidateEditorialChecks(candidate: ExamImportCandidate) {
  const parsed = parsePastedQuestion(candidate.rawText);
  const labels = Object.keys(parsed.alternatives).sort().join('');
  const bracesBalanced =
    (candidate.rawText.match(/\{/g)?.length || 0) ===
    (candidate.rawText.match(/\}/g)?.length || 0);
  return [
    {
      label:
        candidate.questionType === 'essay' ? 'Discursiva' : 'Alternativas A–E',
      ok: candidate.questionType === 'essay' || labels === 'ABCDE',
    },
    {
      label:
        candidate.questionType === 'essay' ? 'Correção individual' : 'Gabarito',
      ok:
        candidate.questionType === 'essay' ||
        (candidate.answerStatus === 'confirmed' &&
          Boolean(candidate.correctAnswers?.length)),
    },
    {
      label: 'Classificação',
      ok: Boolean(candidate.grade && candidate.pedagogicalTopicId),
    },
    {
      label: 'ConTeXt',
      ok: bracesBalanced,
    },
    ...(candidate.imageDataUrl ? [{ label: 'Imagem anexada', ok: true }] : []),
  ];
}

function candidateMatchesReviewFilters(
  candidate: ExamImportCandidate,
  item: ExamImport,
  filters: ReviewFilters,
  topics: PedagogicalTopic[],
) {
  if (
    filters.query &&
    !`${candidate.sourceNumber} ${candidate.rawText}`
      .toLocaleLowerCase('pt-BR')
      .includes(filters.query.toLocaleLowerCase('pt-BR'))
  )
    return false;
  if (filters.institution && item.sourceInstitution !== filters.institution)
    return false;
  if (filters.questionType && candidate.questionType !== filters.questionType)
    return false;
  if (filters.grade && candidate.grade !== filters.grade) return false;
  if (filters.status) {
    const pending =
      !['completed', 'duplicate'].includes(candidate.status) &&
      !candidateReadiness({ ...candidate, selected: true }).ready;
    if (
      filters.status === 'pending'
        ? !pending
        : candidate.status !== filters.status
    )
      return false;
  }
  if (filters.topicId) {
    const filterTopic = topics.find((topic) => topic.id === filters.topicId);
    const candidateTopic = topics.find(
      (topic) => topic.id === candidate.pedagogicalTopicId,
    );
    if (
      !filterTopic ||
      !candidateTopic ||
      (candidateTopic.id !== filterTopic.id &&
        !candidateTopic.path.startsWith(`${filterTopic.path} > `))
    )
      return false;
  }
  return true;
}

function blockPlainText(block: RichContentBlock) {
  if (block.type === 'paragraph') return block.text;
  if (block.type === 'romanList') return block.items.join(' ');
  if (block.type === 'contextFormula' || block.type === 'contextInline')
    return block.code;
  if (block.type === 'math') return block.tex;
  if (block.type === 'chemical') return block.formula;
  if (block.type === 'thermochemicalEquation') return block.equation;
  if (block.type === 'chemicalStructure')
    return block.caption || block.smiles || 'Estrutura química';
  return block.alt || block.caption || 'Imagem da questão';
}

const statusLabels: Record<string, string> = {
  uploaded: 'Documentos recebidos',
  queued: 'Na fila',
  extracting: 'Extraindo',
  extracted: 'Extração concluída',
  needs_review: 'Aguardando revisão',
  completed: 'Importação concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const rightsLabels: Record<string, string> = {
  pending_review: 'Direitos pendentes',
  authorized: 'Uso autorizado',
  public_license: 'Licença pública',
  citation_only: 'Somente citação',
  restricted: 'Uso interno',
  blocked: 'Uso bloqueado',
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Não foi possível ler o PDF.'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ExamImportManager({
  apiUrl,
  role,
  onRegisterQuestion,
  onOpenQuestion,
}: {
  apiUrl: string;
  role: 'admin' | 'coordinator' | 'teacher';
  onRegisterQuestion: (value: {
    importId: string;
    candidateId: string;
    rawText: string;
    sourceInstitution: string;
    sourceYear: number;
    questionType: ExamImportCandidate['questionType'];
    imageDataUrl?: string;
    imageAlt?: string;
    correctAnswers?: string[];
    grade?: string;
    difficulty?: BulkSettings['difficulty'];
    skill?: string;
    pedagogicalDisciplineId?: string;
    pedagogicalTopicId?: string;
  }) => void;
  onOpenQuestion: (questionId: string) => void;
}) {
  const [imports, setImports] = useState<ExamImport[]>([]);
  const [subjectMode, setSubjectMode] = useState('single');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [examPreview, setExamPreview] = useState<PdfPreview | null>(null);
  const [answerKeyPreview, setAnswerKeyPreview] = useState<PdfPreview | null>(
    null,
  );
  const [storedPreview, setStoredPreview] = useState<StoredPdfPreview | null>(
    null,
  );
  const [extractingId, setExtractingId] = useState('');
  const [pagePreviewCandidateId, setPagePreviewCandidateId] = useState('');
  const [croppingId, setCroppingId] = useState('');
  const [readingAnswerKeyId, setReadingAnswerKeyId] = useState('');
  const [bulkRegisteringId, setBulkRegisteringId] = useState('');
  const [bulkSettings, setBulkSettings] = useState<
    Record<string, BulkSettings>
  >({});
  const [pedagogicalDisciplines, setPedagogicalDisciplines] = useState<
    PedagogicalDiscipline[]
  >([]);
  const [pedagogicalTopics, setPedagogicalTopics] = useState<
    PedagogicalTopic[]
  >([]);
  const [duplicates, setDuplicates] = useState<DuplicateQuestion[]>([]);
  const [reviewFilters, setReviewFilters] = useState<ReviewFilters>({
    query: '',
    status: '',
    questionType: '',
    institution: '',
    grade: '',
    topicId: '',
  });
  const [batchActionBusy, setBatchActionBusy] = useState(false);
  const [cropDraft, setCropDraft] = useState({
    x: 10,
    y: 20,
    width: 80,
    height: 50,
  });

  useEffect(
    () => () => {
      if (examPreview) URL.revokeObjectURL(examPreview.url);
    },
    [examPreview],
  );

  useEffect(
    () => () => {
      if (answerKeyPreview) URL.revokeObjectURL(answerKeyPreview.url);
    },
    [answerKeyPreview],
  );

  const updatePreview = (
    file: File | null,
    setter: (preview: PdfPreview | null) => void,
  ) => {
    setter(
      file
        ? { name: file.name, size: file.size, url: URL.createObjectURL(file) }
        : null,
    );
  };

  const refresh = async () => {
    const response = await apiFetch(`${apiUrl}/api/exam-imports`);
    const body = (await response.json()) as {
      data?: ExamImport[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || 'Falha ao listar importações.');
    setImports(body.data || []);
  };

  const refreshDuplicates = async () => {
    const response = await apiFetch(`${apiUrl}/api/questions/duplicates`);
    const body = (await response.json()) as {
      data?: DuplicateQuestion[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || 'Falha ao listar duplicidades.');
    setDuplicates(body.data || []);
  };

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
    refreshDuplicates().catch((error) => setMessage(error.message));
  }, [apiUrl]);

  useEffect(() => {
    if (
      !imports.some(
        (item) =>
          ['queued', 'running'].includes(item.processingJob?.status || '') ||
          ['queued', 'running'].includes(item.aiJob?.status || ''),
      )
    )
      return;
    const timer = window.setInterval(
      () => refresh().catch((error) => setMessage(error.message)),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [apiUrl, imports]);

  const clearDuplicate = async (duplicate: DuplicateQuestion) => {
    if (
      !window.confirm(
        `Desfazer a duplicidade de ${duplicate.code}? A questão voltará como rascunho independente.`,
      )
    )
      return;
    const response = await apiFetch(
      `${apiUrl}/api/questions/${duplicate.id}/duplicate`,
      { method: 'DELETE' },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível desfazer a duplicidade.');
    await refreshDuplicates();
    setMessage(`${duplicate.code} voltou ao acervo como rascunho.`);
  };

  const visibleCandidates = (item: ExamImport) =>
    item.candidates.filter((candidate) =>
      candidateMatchesReviewFilters(
        candidate,
        item,
        reviewFilters,
        pedagogicalTopics,
      ),
    );

  const applyVisibleAction = async (
    action: 'select' | 'unselect' | 'confirm' | 'ignore' | 'restore',
  ) => {
    const targets = imports.flatMap((item) =>
      visibleCandidates(item).map((candidate) => ({ item, candidate })),
    );
    const actionable = targets.filter(({ candidate }) => {
      if (action === 'confirm')
        return (
          candidate.answerStatus === 'suggested' &&
          Boolean(candidate.correctAnswers?.length)
        );
      if (action === 'restore') return candidate.status === 'ignored';
      if (action === 'ignore')
        return !['completed', 'duplicate'].includes(candidate.status);
      return !['completed', 'duplicate', 'ignored'].includes(candidate.status);
    });
    if (!actionable.length) {
      setMessage('Nenhuma questão visível aceita esta ação.');
      return;
    }
    setBatchActionBusy(true);
    try {
      await Promise.all(
        actionable.map(({ item, candidate }) => {
          const changes: Partial<ExamImportCandidate> =
            action === 'select'
              ? { selected: true }
              : action === 'unselect'
                ? { selected: false }
                : action === 'confirm'
                  ? { answerStatus: 'confirmed', status: 'review' }
                  : action === 'ignore'
                    ? { selected: false, status: 'ignored' }
                    : { selected: true, status: 'review' };
          return updateCandidate(item.id, candidate.id, changes);
        }),
      );
      setMessage(
        `${actionable.length} questão(ões) atualizada(s) na fila editorial.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha na ação em lote.',
      );
      await refresh().catch(() => undefined);
    } finally {
      setBatchActionBusy(false);
    }
  };

  useEffect(() => {
    apiFetch(`${apiUrl}/api/curriculum/pedagogical-disciplines`)
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: PedagogicalDiscipline[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'Falha ao carregar as disciplinas.');
        const disciplines = body.data || [];
        setPedagogicalDisciplines(disciplines);
        const chemistry = disciplines.find(
          (discipline) =>
            discipline.name === 'Química' &&
            discipline.stage === 'Ensino Médio',
        );
        if (!chemistry) return;
        const topicsResponse = await apiFetch(
          `${apiUrl}/api/curriculum/pedagogical-topics?disciplineId=${chemistry.id}`,
        );
        const topicsBody = (await topicsResponse.json()) as {
          data?: PedagogicalTopic[];
          error?: string;
        };
        if (!topicsResponse.ok)
          throw new Error(
            topicsBody.error || 'Falha ao carregar os conteúdos de Química.',
          );
        setPedagogicalTopics(topicsBody.data || []);
      })
      .catch((error) => setMessage(error.message));
  }, [apiUrl]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const exam = data.get('examPdf');
    const answerKey = data.get('answerKeyPdf');
    if (!(exam instanceof File) || !exam.size)
      return setMessage('Selecione o PDF da prova.');
    const files = [
      exam,
      ...(answerKey instanceof File && answerKey.size ? [answerKey] : []),
    ];
    if (files.some((file) => file.type !== 'application/pdf'))
      return setMessage('Envie somente arquivos PDF.');
    if (files.some((file) => file.size > 15_000_000))
      return setMessage('Cada PDF deve ter no máximo 15 MB.');
    setBusy(true);
    setMessage('Enviando os documentos para a área de preparação...');
    try {
      const documents = await Promise.all(
        files.map(async (file, index) => ({
          kind: index === 0 ? 'exam' : 'answer_key',
          fileName: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      );
      const response = await apiFetch(`${apiUrl}/api/exam-imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceInstitution: String(data.get('sourceInstitution') || ''),
          sourceYear: Number(data.get('sourceYear')),
          examType: String(data.get('examType')),
          subjectMode,
          primarySubject:
            subjectMode === 'single'
              ? String(data.get('primarySubject') || '')
              : '',
          sourceUrl: String(data.get('sourceUrl') || ''),
          rightsStatus: String(data.get('rightsStatus')),
          documents,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Falha ao enviar a prova.');
      form.reset();
      setSubjectMode('single');
      setExamPreview(null);
      setAnswerKeyPreview(null);
      setMessage(
        'Prova recebida. Ela permanece isolada até a revisão editorial.',
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro no envio.');
    } finally {
      setBusy(false);
    }
  };

  const extractQuestions = async (item: ExamImport) => {
    setExtractingId(item.id);
    setMessage('Lendo o PDF e separando as questões...');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/exam-imports/${item.id}/extract`,
        { method: 'POST' },
      );
      const body = (await response.json()) as {
        data?: { id: string; status: string };
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível extrair as questões.');
      await refresh();
      setMessage(
        'Extração adicionada à fila. O progresso será atualizado automaticamente.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha na extração.');
      await refresh().catch(() => undefined);
    } finally {
      setExtractingId('');
    }
  };

  const controlProcessing = async (
    item: ExamImport,
    action: 'cancel' | 'retry',
  ) => {
    const response = await apiFetch(
      `${apiUrl}/api/exam-imports/${item.id}/${action}`,
      { method: 'POST' },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível atualizar o trabalho.');
    await refresh();
    setMessage(
      action === 'cancel'
        ? 'Cancelamento solicitado.'
        : 'Nova tentativa adicionada à fila.',
    );
  };

  const controlAiAnalysis = async (
    item: ExamImport,
    action: 'start' | 'cancel' | 'retry',
  ) => {
    const suffix = action === 'start' ? 'analyze' : `analyze/${action}`;
    const response = await apiFetch(
      `${apiUrl}/api/exam-imports/${item.id}/${suffix}`,
      { method: 'POST' },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(
        body.error || 'Não foi possível atualizar a análise por IA.',
      );
    await refresh();
    setMessage(
      action === 'start'
        ? 'Análise assistida adicionada à fila. As sugestões exigirão confirmação.'
        : action === 'cancel'
          ? 'Cancelamento da análise solicitado.'
          : 'Nova análise adicionada à fila.',
    );
  };

  const applyAiSuggestion = async (
    item: ExamImport,
    candidate: ExamImportCandidate,
  ) => {
    const suggestion = candidate.aiSuggestion;
    if (!suggestion) return;
    const discipline = pedagogicalDisciplines.find(
      (entry) =>
        entry.name.toLocaleLowerCase('pt-BR') ===
        suggestion.subject?.toLocaleLowerCase('pt-BR'),
    );
    await updateCandidate(item.id, candidate.id, {
      rawText: suggestion.normalizedText,
      questionType: suggestion.questionType,
      grade: suggestion.grade || candidate.grade || '',
      difficulty: suggestion.difficulty || candidate.difficulty,
      correctAnswers: suggestion.correctAnswers,
      answerStatus: suggestion.correctAnswers.length
        ? 'suggested'
        : candidate.answerStatus,
      answerConfidence: suggestion.confidence,
      skill: suggestion.skillCode || candidate.skill || '',
      pedagogicalTopicId:
        suggestion.topicId || candidate.pedagogicalTopicId || '',
      pedagogicalDisciplineId:
        discipline?.id || candidate.pedagogicalDisciplineId || '',
      status: 'review',
    });
    setMessage(
      `Sugestões aplicadas à questão ${candidate.sourceNumber}; revise e confirme antes de cadastrar.`,
    );
  };

  const updateCandidate = async (
    importId: string,
    candidateId: string,
    changes: Partial<ExamImportCandidate>,
  ) => {
    setImports((current) =>
      current.map((item) =>
        item.id === importId
          ? {
              ...item,
              candidates: item.candidates.map((candidate) =>
                candidate.id === candidateId
                  ? { ...candidate, ...changes }
                  : candidate,
              ),
            }
          : item,
      ),
    );
    const response = await apiFetch(
      `${apiUrl}/api/exam-imports/${importId}/candidates/${candidateId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível atualizar a questão.');
  };

  const createCrop = async (
    item: ExamImport,
    candidate: ExamImportCandidate,
  ) => {
    setCroppingId(candidate.id);
    setMessage('Criando o recorte da página original...');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/exam-imports/${item.id}/candidates/${candidate.id}/crop`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cropDraft),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível criar o recorte.');
      await refresh();
      setMessage(
        `Recorte da questão ${candidate.sourceNumber} anexado para revisão.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha no recorte.');
    } finally {
      setCroppingId('');
    }
  };

  const readAnswerKey = async (item: ExamImport) => {
    setReadingAnswerKeyId(item.id);
    setMessage('Lendo o gabarito e associando as respostas...');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/exam-imports/${item.id}/answer-key/extract`,
        { method: 'POST' },
      );
      const body = (await response.json()) as {
        data?: { detected: number; coverage: number };
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível ler o gabarito.');
      await refresh();
      setMessage(
        `${body.data?.detected || 0} respostas sugeridas (${Math.round((body.data?.coverage || 0) * 100)}% das questões). Confirme antes de salvar.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha ao ler o gabarito.',
      );
    } finally {
      setReadingAnswerKeyId('');
    }
  };

  const updateBulkSetting = <K extends keyof BulkSettings>(
    importId: string,
    field: K,
    value: BulkSettings[K],
  ) =>
    setBulkSettings((current) => ({
      ...current,
      [importId]: {
        ...(current[importId] || defaultBulkSettings),
        [field]: value,
      },
    }));

  const registerSelectedCandidates = async (item: ExamImport) => {
    const settings = bulkSettings[item.id] || defaultBulkSettings;
    if (!item.primarySubject?.trim()) {
      setMessage(
        'Defina uma disciplina para a prova antes do cadastro em lote.',
      );
      return;
    }
    const readyCandidates = item.candidates.filter(
      (candidate) => candidateReadiness(candidate).ready,
    );
    if (!readyCandidates.length) {
      setMessage(
        'Nenhuma questão está pronta. Selecione-a, confira A–E e confirme o gabarito.',
      );
      return;
    }
    const defaultTopicId =
      settings.detailId || settings.topicId || settings.objectId;
    const unclassified = readyCandidates.filter(
      (candidate) =>
        !(candidate.grade || settings.grade).trim() ||
        !(candidate.pedagogicalTopicId || defaultTopicId),
    );
    if (unclassified.length) {
      setMessage(
        `Classifique a série e o objeto de conhecimento da(s) questão(ões) ${unclassified.map((candidate) => candidate.sourceNumber).join(', ')} ou informe os padrões do lote.`,
      );
      return;
    }
    const invalidSkill = readyCandidates.find((candidate) => {
      const skill = candidate.skill ?? settings.skill;
      return skill && !/^[A-Z]{2}[0-9A-Z]{4,12}$/.test(skill);
    });
    if (invalidSkill) {
      setMessage(
        `O código da habilidade BNCC da questão ${invalidSkill.sourceNumber} não é válido.`,
      );
      return;
    }
    setBulkRegisteringId(item.id);
    let registered = 0;
    const failures: string[] = [];
    for (const candidate of readyCandidates) {
      try {
        const parsed = parsePastedQuestion(candidate.rawText);
        const statementBlocks: RichContentBlock[] = [
          ...parsed.statementBlocks,
          ...(candidate.imageDataUrl
            ? [
                {
                  type: 'image' as const,
                  dataUrl: candidate.imageDataUrl,
                  alt:
                    candidate.imageAlt ||
                    `Imagem da questão ${candidate.sourceNumber}`,
                  caption: '',
                },
              ]
            : []),
        ];
        const response = await apiFetch(`${apiUrl}/api/questions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: candidate.questionType,
            statement: statementBlocks.map(blockPlainText).join(' ').trim(),
            statementBlocks,
            metapostCode: '',
            answerGuide: '',
            subject: item.primarySubject,
            grade: (candidate.grade || settings.grade).trim(),
            sourceInstitution: item.sourceInstitution,
            sourceYear: item.sourceYear,
            skill: (candidate.skill ?? settings.skill).trim(),
            pedagogicalDisciplineId:
              candidate.pedagogicalDisciplineId ||
              settings.pedagogicalDisciplineId,
            pedagogicalTopicId: candidate.pedagogicalTopicId || defaultTopicId,
            difficulty: candidate.difficulty || settings.difficulty,
            alternatives: ['A', 'B', 'C', 'D', 'E'].map((letter, index) => {
              const contentBlocks = parsed.alternatives[letter];
              return {
                stableKey: `alt-${letter.toLowerCase()}`,
                content: contentBlocks.map(blockPlainText).join(' ').trim(),
                contentBlocks,
                isCorrect: (candidate.correctAnswers || []).includes(letter),
                position: index + 1,
              };
            }),
          }),
        });
        const body = (await response.json()) as {
          error?: string;
          issues?: Array<{ message: string }>;
          duplicateQuestionId?: string;
          duplicateQuestionCode?: string;
        };
        if (!response.ok) {
          if (response.status === 409 && body.duplicateQuestionId) {
            await updateCandidate(item.id, candidate.id, {
              status: 'duplicate',
              selected: false,
              duplicateQuestionId: body.duplicateQuestionId,
              duplicateQuestionCode: body.duplicateQuestionCode,
            });
          }
          throw new Error(
            body.issues?.map((issue) => issue.message).join(' ') ||
              body.error ||
              'falha no cadastro',
          );
        }
        await updateCandidate(item.id, candidate.id, { status: 'completed' });
        registered += 1;
      } catch (error) {
        failures.push(
          `Questão ${candidate.sourceNumber}: ${error instanceof Error ? error.message : 'erro inesperado'}`,
        );
      }
    }
    await refresh().catch(() => undefined);
    setBulkRegisteringId('');
    setMessage(
      failures.length
        ? `${registered} questão(ões) cadastrada(s). ${failures.length} falharam: ${failures.join(' ')}`
        : `${registered} questão(ões) cadastrada(s) e marcadas como concluídas.`,
    );
  };

  return (
    <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-violet-700">
        Curadoria editorial
      </p>
      <h1 className="font-display mt-1 text-3xl font-bold text-[var(--navy)]">
        Importar provas
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">
        Cadastre a fonte e envie os PDFs. Os documentos ficam em preparação e
        nenhuma questão entra no banco público sem revisão e aprovação.
      </p>
      {message && (
        <output className="mt-4 block rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-950">
          {message}
        </output>
      )}

      {duplicates.length > 0 && (
        <section className="mt-6 rounded-2xl border border-rose-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--navy)]">
                Duplicidades detectadas
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Registros arquivados e vinculados à questão mantida no acervo.
              </p>
            </div>
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
              {duplicates.length} duplicada(s)
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {duplicates.map((duplicate) => (
              <article
                key={duplicate.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {duplicate.code}{' '}
                      <span className="font-normal text-slate-500">→</span>{' '}
                      <button
                        type="button"
                        className="text-violet-700 underline"
                        onClick={() =>
                          onOpenQuestion(duplicate.duplicateOfQuestionId)
                        }
                      >
                        {duplicate.duplicateOfCode}
                      </button>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {duplicate.subject} · {duplicate.grade} ·{' '}
                      {duplicate.sourceInstitution} {duplicate.sourceYear}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                      {duplicate.statement}
                    </p>
                    <p className="mt-2 text-xs text-rose-800">
                      {duplicate.duplicateReason}
                    </p>
                  </div>
                  {role !== 'teacher' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        clearDuplicate(duplicate).catch((error) =>
                          setMessage(error.message),
                        )
                      }
                    >
                      Não é duplicada
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <FileUp className="size-5 text-violet-700" />
          <h2 className="font-display text-xl font-bold">Nova importação</h2>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              name="sourceInstitution"
              required
              placeholder="Instituição: ITA, Fuvest..."
            />
            <Input
              name="sourceYear"
              required
              type="number"
              min="1900"
              max="2100"
              defaultValue="2025"
            />
            <SelectField
              name="examType"
              label="Tipo de prova"
              options={[
                ['vestibular', 'Vestibular'],
                ['concurso', 'Concurso'],
                ['enem', 'ENEM'],
                ['simulado', 'Simulado'],
                ['other', 'Outro'],
              ]}
            />
            <SelectField
              name="subjectMode"
              label="Organização"
              value={subjectMode}
              onChange={setSubjectMode}
              options={[
                ['single', 'Uma disciplina'],
                ['multidisciplinary', 'Multidisciplinar'],
              ]}
            />
            {subjectMode === 'single' && (
              <Input
                name="primarySubject"
                required
                placeholder="Disciplina: Química"
              />
            )}
            <Input
              name="sourceUrl"
              type="url"
              placeholder="URL oficial de origem (opcional)"
            />
            <SelectField
              name="rightsStatus"
              label="Direitos de uso"
              options={
                role === 'teacher'
                  ? [
                      ['pending_review', 'Pendente de análise'],
                      ['restricted', 'Somente uso interno'],
                    ]
                  : [
                      ['pending_review', 'Pendente de análise'],
                      ['authorized', 'Uso autorizado'],
                      ['public_license', 'Licença pública'],
                      ['citation_only', 'Somente citação'],
                      ['restricted', 'Somente uso interno'],
                      ['blocked', 'Uso bloqueado'],
                    ]
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PdfField
              name="examPdf"
              title="PDF da prova"
              required
              onFileSelected={(file) => updatePreview(file, setExamPreview)}
            />
            <PdfField
              name="answerKeyPdf"
              title="PDF do gabarito"
              onFileSelected={(file) =>
                updatePreview(file, setAnswerKeyPreview)
              }
            />
          </div>
          {(examPreview || answerKeyPreview) && (
            <section aria-labelledby="pdf-preview-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3
                    id="pdf-preview-title"
                    className="font-display text-lg font-bold text-[var(--navy)]"
                  >
                    Prévia dos documentos
                  </h3>
                  <p className="text-xs text-slate-500">
                    Confira os arquivos antes de criar a importação.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Ainda não enviados
                </span>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {examPreview && (
                  <PdfPreviewCard title="Prova" preview={examPreview} />
                )}
                {answerKeyPreview && (
                  <PdfPreviewCard title="Gabarito" preview={answerKeyPreview} />
                )}
              </div>
            </section>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="size-4 text-emerald-700" />
              PDF de até 15 MB por arquivo. A publicação permanece bloqueada
              nesta etapa.
            </p>
            <Button type="submit" disabled={busy}>
              <FileUp /> {busy ? 'Enviando...' : 'Criar importação'}
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              Trabalhos de importação
            </h2>
            <p className="text-sm text-slate-500">
              Documentos aguardando extração e revisão.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              refresh().catch((error) => setMessage(error.message))
            }
          >
            <RefreshCw /> Atualizar
          </Button>
        </div>
        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <Input
              aria-label="Buscar na fila de revisão"
              value={reviewFilters.query}
              onChange={(event) =>
                setReviewFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Questão ou trecho..."
            />
            <SelectField
              name="review-status"
              label="Situação editorial"
              value={reviewFilters.status}
              onChange={(status) =>
                setReviewFilters((current) => ({ ...current, status }))
              }
              options={[
                ['', 'Todas as situações'],
                ['complete', 'Completa'],
                ['pending', 'Pendente'],
                ['review', 'Em revisão'],
                ['duplicate', 'Duplicada'],
                ['ignored', 'Ignorada'],
                ['completed', 'Concluída'],
              ]}
            />
            <SelectField
              name="review-type"
              label="Tipo de questão"
              value={reviewFilters.questionType}
              onChange={(questionType) =>
                setReviewFilters((current) => ({
                  ...current,
                  questionType,
                }))
              }
              options={[
                ['', 'Todos os tipos'],
                ['single_choice', 'Objetiva · uma resposta'],
                ['multiple_choice', 'Objetiva · várias respostas'],
                ['essay', 'Discursiva'],
              ]}
            />
            <SelectField
              name="review-institution"
              label="Instituição"
              value={reviewFilters.institution}
              onChange={(institution) =>
                setReviewFilters((current) => ({ ...current, institution }))
              }
              options={[
                ['', 'Todas as instituições'],
                ...[...new Set(imports.map((item) => item.sourceInstitution))]
                  .sort()
                  .map(
                    (institution) =>
                      [institution, institution] as [string, string],
                  ),
              ]}
            />
            <SelectField
              name="review-grade"
              label="Série"
              value={reviewFilters.grade}
              onChange={(grade) =>
                setReviewFilters((current) => ({
                  ...current,
                  grade,
                  topicId: '',
                }))
              }
              options={[
                ['', 'Todas as séries'],
                ['1ª série', '1ª série'],
                ['2ª série', '2ª série'],
                ['3ª série', '3ª série'],
              ]}
            />
            <SelectField
              name="review-topic"
              label="Conteúdo"
              value={reviewFilters.topicId}
              onChange={(topicId) =>
                setReviewFilters((current) => ({ ...current, topicId }))
              }
              options={[
                ['', 'Todos os conteúdos'],
                ...pedagogicalTopics
                  .filter(
                    (topic) =>
                      !topic.parent_id &&
                      (!reviewFilters.grade ||
                        topic.grade_range === reviewFilters.grade),
                  )
                  .map(
                    (topic) =>
                      [topic.id, `${topic.grade_range} · ${topic.name}`] as [
                        string,
                        string,
                      ],
                  ),
              ]}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {imports.flatMap((item) => visibleCandidates(item)).length}{' '}
              questão(ões) visível(is). As ações afetam somente este resultado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={batchActionBusy}
                onClick={() => applyVisibleAction('select')}
              >
                Selecionar visíveis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={batchActionBusy}
                onClick={() => applyVisibleAction('unselect')}
              >
                Desmarcar visíveis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={batchActionBusy}
                onClick={() => applyVisibleAction('confirm')}
              >
                Confirmar gabaritos sugeridos
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={batchActionBusy}
                onClick={() => applyVisibleAction('ignore')}
              >
                Ignorar visíveis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={batchActionBusy}
                onClick={() => applyVisibleAction('restore')}
              >
                Restaurar ignoradas
              </Button>
            </div>
          </div>
        </section>
        <div className="mt-4 space-y-3">
          {!imports.length && (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
              Nenhuma prova foi enviada ainda.
            </p>
          )}
          {imports
            .filter(
              (item) =>
                visibleCandidates(item).length > 0 || !item.candidates.length,
            )
            .map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--navy)]">
                      {item.sourceInstitution} {item.sourceYear}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.primarySubject || 'Prova multidisciplinar'} ·{' '}
                      {statusLabels[item.status] || item.status}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${item.rightsStatus === 'authorized' || item.rightsStatus === 'public_license' ? 'bg-emerald-50 text-emerald-800' : item.rightsStatus === 'blocked' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}
                  >
                    {rightsLabels[item.rightsStatus] || item.rightsStatus}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.documents.map((document) => (
                    <button
                      type="button"
                      key={document.id}
                      onClick={() =>
                        setStoredPreview({
                          importId: item.id,
                          documentId: document.id,
                          title:
                            document.kind === 'exam' ? 'Prova' : 'Gabarito',
                          name: document.fileName,
                          size: document.sizeBytes,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs transition hover:bg-violet-50 hover:text-violet-900"
                    >
                      <FileText className="size-4 text-violet-700" />
                      {document.kind === 'exam' ? 'Prova' : 'Gabarito'}:{' '}
                      {document.fileName} ·{' '}
                      {(document.sizeBytes / 1_000_000).toFixed(1)} MB
                      <Eye className="ml-1 size-4" />
                      <span className="font-semibold">Visualizar</span>
                    </button>
                  ))}
                </div>
                {storedPreview?.importId === item.id && (
                  <StoredPdfPreviewCard
                    apiUrl={apiUrl}
                    preview={storedPreview}
                    onClose={() => setStoredPreview(null)}
                  />
                )}
                {item.processingJob && (
                  <section className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
                          Processamento ·{' '}
                          {item.processingJob.stage.replaceAll('_', ' ')}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Tentativa {item.processingJob.attempts} ·{' '}
                          {item.processingJob.progress}% concluído
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {['queued', 'running'].includes(
                          item.processingJob.status,
                        ) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              controlProcessing(item, 'cancel').catch((error) =>
                                setMessage(error.message),
                              )
                            }
                          >
                            Cancelar
                          </Button>
                        )}
                        {['failed', 'cancelled'].includes(
                          item.processingJob.status,
                        ) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              controlProcessing(item, 'retry').catch((error) =>
                                setMessage(error.message),
                              )
                            }
                          >
                            Repetir processamento
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all"
                        style={{ width: `${item.processingJob.progress}%` }}
                      />
                    </div>
                    {item.processingJob.error && (
                      <p className="mt-2 text-xs text-rose-800">
                        {item.processingJob.error}
                      </p>
                    )}
                  </section>
                )}
                {item.aiJob && (
                  <section className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
                          Análise assistida ·{' '}
                          {item.aiJob.stage.replaceAll('_', ' ')}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Tentativa {item.aiJob.attempts} ·{' '}
                          {item.aiJob.progress}% ·{' '}
                          {item.aiJob.model ||
                            item.aiJob.promptVersion ||
                            'aguardando modelo'}
                        </p>
                      </div>
                      {['queued', 'running'].includes(item.aiJob.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            controlAiAnalysis(item, 'cancel').catch((error) =>
                              setMessage(error.message),
                            )
                          }
                        >
                          Cancelar IA
                        </Button>
                      ) : ['failed', 'cancelled'].includes(
                          item.aiJob.status,
                        ) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            controlAiAnalysis(item, 'retry').catch((error) =>
                              setMessage(error.message),
                            )
                          }
                        >
                          Repetir análise
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100">
                      <div
                        className="h-full rounded-full bg-violet-600"
                        style={{ width: `${item.aiJob.progress}%` }}
                      />
                    </div>
                    {item.aiJob.metrics?.total_tokens && (
                      <p className="mt-2 text-xs text-slate-600">
                        Uso: {item.aiJob.metrics.total_tokens} tokens (
                        {item.aiJob.metrics.input_tokens || 0} entrada /{' '}
                        {item.aiJob.metrics.output_tokens || 0} saída).
                      </p>
                    )}
                    {item.aiJob.error && (
                      <p className="mt-2 text-xs text-rose-800">
                        {item.aiJob.error}
                      </p>
                    )}
                  </section>
                )}
                <section className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-[var(--navy)]">
                        Questões extraídas
                      </h4>
                      <p className="text-xs text-slate-500">
                        Selecione, classifique e revise cada questão antes do
                        cadastro. A IA analisa até cinco selecionadas por vez e
                        apenas sugere alterações.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          extractingId === item.id ||
                          ['queued', 'running'].includes(
                            item.processingJob?.status || '',
                          )
                        }
                        onClick={() => extractQuestions(item)}
                      >
                        <ScanText />
                        {extractingId === item.id
                          ? 'Extraindo...'
                          : item.candidates?.length
                            ? 'Extrair novamente'
                            : 'Extrair questões'}
                      </Button>
                      {Boolean(item.candidates?.length) && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={['queued', 'running'].includes(
                            item.aiJob?.status || '',
                          )}
                          onClick={() =>
                            controlAiAnalysis(item, 'start').catch((error) =>
                              setMessage(error.message),
                            )
                          }
                        >
                          <Sparkles /> Analisar próximo lote com IA
                        </Button>
                      )}
                      {item.documents.some(
                        (document) => document.kind === 'answer_key',
                      ) &&
                        Boolean(item.candidates?.length) && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={readingAnswerKeyId === item.id}
                            onClick={() => readAnswerKey(item)}
                          >
                            {readingAnswerKeyId === item.id
                              ? 'Lendo gabarito...'
                              : 'Ler gabarito'}
                          </Button>
                        )}
                    </div>
                  </div>
                  {item.error && (
                    <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
                      {item.error}
                    </p>
                  )}
                  {Boolean(item.candidates?.length) && (
                    <BulkRegistrationPanel
                      item={item}
                      settings={bulkSettings[item.id] || defaultBulkSettings}
                      disciplines={pedagogicalDisciplines}
                      topics={pedagogicalTopics}
                      registering={bulkRegisteringId === item.id}
                      onSettingChange={(field, value) =>
                        updateBulkSetting(item.id, field, value)
                      }
                      onRegister={() => registerSelectedCandidates(item)}
                    />
                  )}
                  <div className="mt-3 space-y-3">
                    {visibleCandidates(item).map((candidate) => (
                      <article
                        key={candidate.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm font-semibold">
                            <input
                              type="checkbox"
                              checked={candidate.selected}
                              disabled={[
                                'completed',
                                'duplicate',
                                'ignored',
                              ].includes(candidate.status)}
                              onChange={(event) =>
                                updateCandidate(item.id, candidate.id, {
                                  selected: event.target.checked,
                                }).catch((error) => setMessage(error.message))
                              }
                              className="size-4 accent-violet-700"
                            />
                            Questão {candidate.sourceNumber}
                          </label>
                          <select
                            aria-label={`Tipo da questão ${candidate.sourceNumber}`}
                            value={candidate.questionType}
                            onChange={(event) =>
                              updateCandidate(item.id, candidate.id, {
                                questionType: event.target
                                  .value as ExamImportCandidate['questionType'],
                              }).catch((error) => setMessage(error.message))
                            }
                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs"
                          >
                            <option value="single_choice">
                              Múltipla escolha · uma resposta
                            </option>
                            <option value="multiple_choice">
                              Múltipla escolha · várias respostas
                            </option>
                            <option value="essay">Discursiva</option>
                          </select>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${candidate.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : candidate.status === 'duplicate' ? 'bg-rose-100 text-rose-800' : candidate.status === 'ignored' ? 'bg-slate-200 text-slate-700' : candidate.status === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'}`}
                          >
                            {candidate.status === 'completed'
                              ? 'Concluída'
                              : candidate.status === 'duplicate'
                                ? `Duplicada${candidate.duplicateQuestionCode ? ` de ${candidate.duplicateQuestionCode}` : ''}`
                                : candidate.status === 'ignored'
                                  ? 'Ignorada'
                                  : candidate.status === 'review'
                                    ? 'Em revisão'
                                    : 'Completa'}
                          </span>
                          {candidate.pageNumber && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setPagePreviewCandidateId((current) =>
                                  current === candidate.id ? '' : candidate.id,
                                )
                              }
                            >
                              <Eye /> Página {candidate.pageNumber}
                            </Button>
                          )}
                          {candidate.extractionMethod === 'ocr' && (
                            <span className="text-xs font-semibold text-sky-700">
                              Texto obtido por OCR
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {candidateEditorialChecks(candidate).map((check) => (
                            <span
                              key={check.label}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${check.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
                            >
                              {check.ok ? '✓' : '!'} {check.label}
                            </span>
                          ))}
                        </div>
                        {candidate.aiSuggestion && (
                          <section className="mt-3 rounded-lg border border-violet-200 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
                                  {candidate.aiSuggestion.provider ===
                                  'local_demo'
                                    ? 'Sugestão local de demonstração'
                                    : 'Sugestão da IA'}{' '}
                                  — revisão obrigatória
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  Confiança{' '}
                                  {Math.round(
                                    candidate.aiSuggestion.confidence * 100,
                                  )}
                                  % ·{' '}
                                  {candidate.aiSuggestion.subject ||
                                    'disciplina incerta'}{' '}
                                  ·{' '}
                                  {candidate.aiSuggestion.grade ||
                                    'série incerta'}{' '}
                                  ·{' '}
                                  {candidate.aiSuggestion.difficulty ||
                                    'dificuldade incerta'}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  Habilidade{' '}
                                  {candidate.aiSuggestion.skillCode ||
                                    'não sugerida'}{' '}
                                  · tópico{' '}
                                  {candidate.aiSuggestion.topicId
                                    ? 'identificado no catálogo'
                                    : 'não sugerido'}{' '}
                                  · {candidate.aiSuggestion.model}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  applyAiSuggestion(item, candidate).catch(
                                    (error) => setMessage(error.message),
                                  )
                                }
                              >
                                Aplicar para revisar
                              </Button>
                            </div>
                            {candidate.aiSuggestion.warnings.length > 0 && (
                              <p className="mt-2 text-xs text-amber-800">
                                Atenção:{' '}
                                {candidate.aiSuggestion.warnings.join(' · ')}
                              </p>
                            )}
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-semibold text-violet-800">
                                Ver texto formatado sugerido
                              </summary>
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">
                                {candidate.aiSuggestion.normalizedText}
                              </pre>
                            </details>
                          </section>
                        )}
                        {pagePreviewCandidateId === candidate.id &&
                          candidate.pageNumber && (
                            <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                              <iframe
                                title={`Página original da questão ${candidate.sourceNumber}`}
                                src={`${apiUrl}/api/exam-imports/${item.id}/pages/${candidate.pageNumber}.jpg`}
                                className="h-[620px] w-full rounded-lg border border-slate-200 bg-white"
                              />
                              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                                {[
                                  ['x', 'Esquerda %'],
                                  ['y', 'Topo %'],
                                  ['width', 'Largura %'],
                                  ['height', 'Altura %'],
                                ].map(([field, label]) => (
                                  <label
                                    key={field}
                                    className="text-xs font-semibold text-slate-600"
                                  >
                                    {label}
                                    <input
                                      type="number"
                                      min={
                                        field === 'x' || field === 'y' ? 0 : 1
                                      }
                                      max="100"
                                      value={
                                        cropDraft[
                                          field as keyof typeof cropDraft
                                        ]
                                      }
                                      onChange={(event) =>
                                        setCropDraft((current) => ({
                                          ...current,
                                          [field]: Number(event.target.value),
                                        }))
                                      }
                                      className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2"
                                    />
                                  </label>
                                ))}
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={croppingId === candidate.id}
                                  onClick={() => createCrop(item, candidate)}
                                >
                                  {croppingId === candidate.id
                                    ? 'Recortando...'
                                    : 'Criar recorte para a questão'}
                                </Button>
                              </div>
                            </section>
                          )}
                        {candidate.imageDataUrl && (
                          <figure className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
                            <img
                              src={candidate.imageDataUrl}
                              alt={candidate.imageAlt || 'Recorte da questão'}
                              className="mx-auto max-h-80 w-auto object-contain"
                            />
                            <figcaption className="mt-2 text-center text-xs font-semibold text-emerald-800">
                              {candidate.imageExtractionMethod ===
                              'automatic_page_region'
                                ? 'Conteúdo visual detectado e recortado automaticamente — confira antes do cadastro'
                                : 'Imagem pronta para acompanhar a questão no cadastro'}
                            </figcaption>
                          </figure>
                        )}
                        {candidate.visualCaptureWarning && (
                          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                            {candidate.visualCaptureWarning}
                          </p>
                        )}
                        {candidate.status === 'duplicate' &&
                          candidate.duplicateQuestionId && (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                              <p className="text-xs font-semibold text-rose-900">
                                Esta questão já existe como{' '}
                                {candidate.duplicateQuestionCode ||
                                  'questão cadastrada'}
                                .
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  onOpenQuestion(candidate.duplicateQuestionId!)
                                }
                              >
                                Abrir questão principal
                              </Button>
                            </div>
                          )}
                        <CandidateClassificationFields
                          candidate={candidate}
                          disciplines={pedagogicalDisciplines}
                          topics={pedagogicalTopics}
                          onChange={(changes) =>
                            updateCandidate(
                              item.id,
                              candidate.id,
                              changes,
                            ).catch((error) => setMessage(error.message))
                          }
                        />
                        <textarea
                          aria-label={`Texto extraído da questão ${candidate.sourceNumber}`}
                          defaultValue={candidate.rawText}
                          rows={9}
                          onBlur={(event) => {
                            if (event.target.value.trim() !== candidate.rawText)
                              updateCandidate(item.id, candidate.id, {
                                rawText: event.target.value,
                                status: 'review',
                              }).catch((error) => setMessage(error.message));
                          }}
                          className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-5"
                        />
                        {candidate.questionType !== 'essay' && (
                          <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700">
                                Gabarito da questão
                              </p>
                              {candidate.answerStatus === 'suggested' && (
                                <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                                  Sugestão automática ·{' '}
                                  {Math.round(
                                    (candidate.answerConfidence || 0) * 100,
                                  )}
                                  % de confiança
                                </span>
                              )}
                              {candidate.answerStatus === 'confirmed' && (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                  Confirmado pelo professor
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {['A', 'B', 'C', 'D', 'E'].map((letter) => {
                                const checked = (
                                  candidate.correctAnswers || []
                                ).includes(letter);
                                return (
                                  <button
                                    key={letter}
                                    type="button"
                                    aria-pressed={checked}
                                    onClick={() => {
                                      const correctAnswers =
                                        candidate.questionType ===
                                        'single_choice'
                                          ? [letter]
                                          : checked
                                            ? (
                                                candidate.correctAnswers || []
                                              ).filter(
                                                (answer) => answer !== letter,
                                              )
                                            : [
                                                ...(candidate.correctAnswers ||
                                                  []),
                                                letter,
                                              ];
                                      updateCandidate(item.id, candidate.id, {
                                        correctAnswers,
                                        answerStatus: 'confirmed',
                                        answerConfidence: 1,
                                        status: 'review',
                                      }).catch((error) =>
                                        setMessage(error.message),
                                      );
                                    }}
                                    className={`grid size-9 place-items-center rounded-full border text-xs font-bold ${checked ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                                  >
                                    {letter}
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        )}
                        {candidate.selected &&
                          candidate.status !== 'completed' &&
                          !candidateReadiness(candidate).ready && (
                            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                              Pendente para o lote:{' '}
                              {candidateReadiness(candidate)
                                .reasons.filter(
                                  (reason) => reason !== 'não selecionada',
                                )
                                .join(' · ')}
                            </p>
                          )}
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            disabled={
                              !candidate.selected ||
                              ['completed', 'duplicate'].includes(
                                candidate.status,
                              ) ||
                              candidate.status === 'ignored'
                            }
                            onClick={() => {
                              updateCandidate(item.id, candidate.id, {
                                status: 'review',
                              }).catch((error) => setMessage(error.message));
                              onRegisterQuestion({
                                importId: item.id,
                                candidateId: candidate.id,
                                rawText: candidate.rawText,
                                sourceInstitution: item.sourceInstitution,
                                sourceYear: item.sourceYear,
                                questionType: candidate.questionType,
                                imageDataUrl: candidate.imageDataUrl,
                                imageAlt: candidate.imageAlt,
                                correctAnswers: candidate.correctAnswers,
                                grade: candidate.grade,
                                difficulty: candidate.difficulty,
                                skill: candidate.skill,
                                pedagogicalDisciplineId:
                                  candidate.pedagogicalDisciplineId,
                                pedagogicalTopicId:
                                  candidate.pedagogicalTopicId,
                              });
                            }}
                          >
                            Editar, gerar prévia e cadastrar <ArrowRight />
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
                <p className="mt-3 text-xs text-slate-400">
                  Criada em {new Date(item.createdAt).toLocaleString('pt-BR')} ·{' '}
                  {item.detectedQuestions} detectadas · {item.reviewedQuestions}{' '}
                  revisadas
                </p>
              </article>
            ))}
        </div>
      </section>
    </main>
  );
}

function SelectField({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Array<[string, string]>;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        aria-label={label}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function CandidateClassificationFields({
  candidate,
  disciplines,
  topics,
  onChange,
}: {
  candidate: ExamImportCandidate;
  disciplines: PedagogicalDiscipline[];
  topics: PedagogicalTopic[];
  onChange: (changes: Partial<ExamImportCandidate>) => void;
}) {
  const chemistry = disciplines.find(
    (discipline) =>
      discipline.name === 'Química' && discipline.stage === 'Ensino Médio',
  );
  const selected = topics.find(
    (topic) => topic.id === candidate.pedagogicalTopicId,
  );
  const selectedDetail = selected?.depth === 2 ? selected : undefined;
  const selectedSubtopic =
    selected?.depth === 1
      ? selected
      : selectedDetail
        ? topics.find((topic) => topic.id === selectedDetail.parent_id)
        : undefined;
  const selectedObject =
    selected?.depth === 0
      ? selected
      : topics.find(
          (topic) =>
            topic.id === (selectedSubtopic?.parent_id || selected?.parent_id),
        );
  const objects = topics.filter(
    (topic) => !topic.parent_id && topic.grade_range === candidate.grade,
  );
  const subtopics = topics.filter(
    (topic) => topic.parent_id === selectedObject?.id,
  );
  const details = topics.filter(
    (topic) => topic.parent_id === selectedSubtopic?.id,
  );

  return (
    <section className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-900">
        Classificação desta questão
      </p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <SelectField
          name={`candidate-grade-${candidate.id}`}
          label={`Série da questão ${candidate.sourceNumber}`}
          value={candidate.grade || ''}
          onChange={(grade) =>
            onChange({
              grade,
              pedagogicalDisciplineId: chemistry?.id || '',
              pedagogicalTopicId: '',
            })
          }
          options={[
            ['', 'Série: usar padrão do lote'],
            ['1ª série', '1ª série do Ensino Médio'],
            ['2ª série', '2ª série do Ensino Médio'],
            ['3ª série', '3ª série do Ensino Médio'],
          ]}
        />
        <SelectField
          name={`candidate-object-${candidate.id}`}
          label={`Objeto da questão ${candidate.sourceNumber}`}
          value={selectedObject?.id || ''}
          onChange={(pedagogicalTopicId) =>
            onChange({
              pedagogicalDisciplineId: chemistry?.id || '',
              pedagogicalTopicId,
            })
          }
          options={[
            ['', 'Objeto: usar padrão do lote'],
            ...objects.map(
              (topic) => [topic.id, topic.name] as [string, string],
            ),
          ]}
        />
        {selectedObject && subtopics.length > 0 && (
          <SelectField
            name={`candidate-subtopic-${candidate.id}`}
            label={`Subtópico da questão ${candidate.sourceNumber}`}
            value={selectedSubtopic?.id || ''}
            onChange={(value) =>
              onChange({ pedagogicalTopicId: value || selectedObject.id })
            }
            options={[
              ['', 'Sem subtópico específico'],
              ...subtopics.map(
                (topic) => [topic.id, topic.name] as [string, string],
              ),
            ]}
          />
        )}
        {selectedSubtopic && details.length > 0 && (
          <SelectField
            name={`candidate-detail-${candidate.id}`}
            label={`Detalhamento da questão ${candidate.sourceNumber}`}
            value={selectedDetail?.id || ''}
            onChange={(value) =>
              onChange({ pedagogicalTopicId: value || selectedSubtopic.id })
            }
            options={[
              ['', 'Sem detalhamento específico'],
              ...details.map(
                (topic) => [topic.id, topic.name] as [string, string],
              ),
            ]}
          />
        )}
        <SelectField
          name={`candidate-difficulty-${candidate.id}`}
          label={`Dificuldade da questão ${candidate.sourceNumber}`}
          value={candidate.difficulty || ''}
          onChange={(difficulty) =>
            onChange({
              difficulty:
                (difficulty as BulkSettings['difficulty']) || undefined,
            })
          }
          options={[
            ['', 'Dificuldade: usar padrão do lote'],
            ['Fácil', 'Fácil'],
            ['Média', 'Média'],
            ['Difícil', 'Difícil'],
          ]}
        />
        <Input
          aria-label={`Habilidade BNCC da questão ${candidate.sourceNumber}`}
          value={candidate.skill || ''}
          onChange={(event) =>
            onChange({ skill: event.target.value.toUpperCase() })
          }
          placeholder="BNCC própria: EM13CNT101"
        />
      </div>
    </section>
  );
}

function BulkRegistrationPanel({
  item,
  settings,
  disciplines,
  topics,
  registering,
  onSettingChange,
  onRegister,
}: {
  item: ExamImport;
  settings: BulkSettings;
  disciplines: PedagogicalDiscipline[];
  topics: PedagogicalTopic[];
  registering: boolean;
  onSettingChange: <K extends keyof BulkSettings>(
    field: K,
    value: BulkSettings[K],
  ) => void;
  onRegister: () => void;
}) {
  const selected = item.candidates.filter(
    (candidate) => candidate.selected && candidate.status !== 'completed',
  );
  const ready = selected.filter(
    (candidate) => candidateReadiness(candidate).ready,
  );
  const chemistry = disciplines.find(
    (discipline) =>
      discipline.name === 'Química' && discipline.stage === 'Ensino Médio',
  );
  const objects = topics.filter(
    (topic) => !topic.parent_id && topic.grade_range === settings.grade,
  );
  const subtopics = topics.filter(
    (topic) => topic.parent_id === settings.objectId,
  );
  const details = topics.filter(
    (topic) => topic.parent_id === settings.topicId,
  );
  const defaultTopicId =
    settings.detailId || settings.topicId || settings.objectId;
  const classifiable = ready.every(
    (candidate) =>
      Boolean((candidate.grade || settings.grade).trim()) &&
      Boolean(candidate.pedagogicalTopicId || defaultTopicId),
  );
  return (
    <section className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="font-semibold text-violet-950">Cadastro em lote</h5>
          <p className="mt-1 text-xs text-slate-600">
            Estes dados são padrões. A classificação preenchida diretamente em
            uma questão tem prioridade.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 text-slate-700">
            {selected.length} selecionada(s)
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
            {ready.length} pronta(s)
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
            {selected.length - ready.length} pendente(s)
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SelectField
          name={`bulk-grade-${item.id}`}
          label="Série do Ensino Médio"
          value={settings.grade}
          onChange={(value) => {
            onSettingChange('grade', value);
            onSettingChange('pedagogicalDisciplineId', chemistry?.id || '');
            onSettingChange('objectId', '');
            onSettingChange('topicId', '');
            onSettingChange('detailId', '');
          }}
          options={[
            ['', 'Selecione a série'],
            ['1ª série', '1ª série do Ensino Médio'],
            ['2ª série', '2ª série do Ensino Médio'],
            ['3ª série', '3ª série do Ensino Médio'],
          ]}
        />
        <SelectField
          name={`bulk-object-${item.id}`}
          label="Objeto de conhecimento"
          value={settings.objectId}
          onChange={(value) => {
            onSettingChange('objectId', value);
            onSettingChange('pedagogicalDisciplineId', chemistry?.id || '');
            onSettingChange('topicId', '');
            onSettingChange('detailId', '');
          }}
          options={[
            ['', 'Selecione o objeto de conhecimento'],
            ...objects.map(
              (topic) => [topic.id, topic.name] as [string, string],
            ),
          ]}
        />
        <SelectField
          name={`bulk-topic-${item.id}`}
          label="Subtópico"
          value={settings.topicId}
          onChange={(value) => {
            onSettingChange('topicId', value);
            onSettingChange('detailId', '');
          }}
          options={[
            ['', subtopics.length ? 'Selecione o subtópico' : 'Sem subtópicos'],
            ...subtopics.map(
              (topic) => [topic.id, topic.name] as [string, string],
            ),
          ]}
        />
        {details.length > 0 && (
          <SelectField
            name={`bulk-detail-${item.id}`}
            label="Detalhamento"
            value={settings.detailId}
            onChange={(value) => onSettingChange('detailId', value)}
            options={[
              ['', 'Selecione o detalhamento'],
              ...details.map(
                (topic) => [topic.id, topic.name] as [string, string],
              ),
            ]}
          />
        )}
        <SelectField
          name={`bulk-difficulty-${item.id}`}
          label="Dificuldade do lote"
          value={settings.difficulty}
          onChange={(value) =>
            onSettingChange('difficulty', value as BulkSettings['difficulty'])
          }
          options={[
            ['Fácil', 'Fácil'],
            ['Média', 'Média'],
            ['Difícil', 'Difícil'],
          ]}
        />
        <Input
          aria-label="Habilidade BNCC do lote"
          value={settings.skill}
          onChange={(event) =>
            onSettingChange('skill', event.target.value.toUpperCase())
          }
          placeholder="BNCC opcional: EM13CNT101"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-slate-600">
          Para entrar no lote, a questão objetiva precisa ter A–E e gabarito
          confirmado. Discursivas continuam no botão “Revisar e cadastrar”.
        </p>
        <Button
          type="button"
          disabled={registering || !ready.length || !classifiable}
          onClick={onRegister}
        >
          {registering
            ? 'Cadastrando...'
            : `Cadastrar ${ready.length} pronta(s)`}
        </Button>
      </div>
    </section>
  );
}

function PdfField({
  name,
  title,
  required = false,
  onFileSelected,
}: {
  name: string;
  title: string;
  required?: boolean;
  onFileSelected: (file: File | null) => void;
}) {
  return (
    <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <FileText className="mx-auto size-7 text-violet-700" />
      <span className="mt-2 block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">
        Selecione um arquivo PDF de até 15 MB.
      </span>
      <input
        name={name}
        type="file"
        accept="application/pdf,.pdf"
        required={required}
        onChange={(event) =>
          onFileSelected(event.currentTarget.files?.[0] || null)
        }
        className="mt-3 block w-full text-xs"
      />
    </label>
  );
}

function PdfPreviewCard({
  title,
  preview,
}: {
  title: string;
  preview: PdfPreview;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
            {title}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {preview.name}
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {(preview.size / 1_000_000).toFixed(1)} MB
        </span>
      </div>
      <iframe
        title={`Prévia do PDF: ${preview.name}`}
        src={`${preview.url}#toolbar=1&navpanes=0&view=FitH`}
        className="h-[520px] w-full bg-white"
      />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-right">
        <a
          href={preview.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          Abrir prévia em outra aba
        </a>
      </div>
    </article>
  );
}

function StoredPdfPreviewCard({
  apiUrl,
  preview,
  onClose,
}: {
  apiUrl: string;
  preview: StoredPdfPreview;
  onClose: () => void;
}) {
  const url = `${apiUrl}/api/exam-imports/${preview.importId}/documents/${preview.documentId}/pdf`;
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-violet-200 bg-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
            Prévia após a importação · {preview.title}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {preview.name} · {(preview.size / 1_000_000).toFixed(1)} MB
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar prévia"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <iframe
        title={`Prévia do PDF importado: ${preview.name}`}
        src={`${url}#toolbar=1&navpanes=0&view=FitH`}
        className="h-[620px] w-full bg-white"
      />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-right">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          Abrir PDF em outra aba
        </a>
      </div>
    </section>
  );
}
