'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { importReviewGroup } from '@/lib/import-review-queue.mjs';
import { resolveImportClassification } from '@/lib/import-classification.mjs';
import { parsePastedExam } from '@/lib/pasted-exam.mjs';
import { examSharedTextGroups } from '@/lib/exam-shared-texts.mjs';
import type { SharedTextSummary } from './shared-text-picker';
import type { SubmitEvent } from 'react';
import { formString } from '@/lib/form-data';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  Plus,
  RefreshCw,
  ScanText,
  Sparkles,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { parsePastedQuestion } from './question-paste-importer';

import type { RichContentBlock } from './rich-content-editor';
import {
  fieldLabel,
  orderedHighSchoolDisciplines,
  defaultBulkSettings,
  candidateReadiness,
  candidateEditorialChecks,
  candidateMatchesReviewFilters,
  blockPlainText,
  statusLabels,
  rightsLabels,
  fileToDataUrl,
  type ExamImport,
  type AiReviewField,
  type ExamImportCandidate,
  type PdfPreview,
  type StoredPdfPreview,
  type BulkSettings,
  type ReviewFilters,
  type PedagogicalDiscipline,
  type PedagogicalTopic,
  type DuplicateQuestion,
} from './exam-import/model';
import {
  PdfField,
  PdfPreviewCard,
  StoredPdfPreviewCard,
} from './exam-import/pdf-fields';
import {
  SelectField,
  CandidateClassificationFields,
  BulkRegistrationPanel,
} from './exam-import/candidate-fields';
import { ImportedQuestionTextEditor } from './exam-import/question-text-editor';
import { AiSuggestionReview } from './exam-import/ai-suggestion-review';

export function ExamImportManager({
  apiUrl,
  role,
  onNewQuestion,
  onRegisterQuestion,
  onOpenQuestion,
}: {
  apiUrl: string;
  role: 'admin' | 'coordinator' | 'teacher';
  onNewQuestion: () => void;
  onRegisterQuestion: (value: {
    importId: string;
    candidateId: string;
    rawText: string;
    resolution?: string;
    adoteNote?: string;
    sourceInstitution: string;
    sourceYear: number;
    questionType: ExamImportCandidate['questionType'];
    subject?: string;
    imageDataUrl?: string;
    imageAlt?: string;
    correctAnswers?: string[];
    grade?: string;
    difficulty?: BulkSettings['difficulty'];
    skill?: string;
    pedagogicalDisciplineId?: string;
    pedagogicalTopicId?: string;
    sharedText?: SharedTextSummary | null;
  }) => void;
  onOpenQuestion: (questionId: string) => void;
}) {
  const [imports, setImports] = useState<ExamImport[]>([]);
  const [aiProviders, setAiProviders] = useState<Record<string, string>>({});
  const [selectedImportId, setSelectedImportId] = useState('');
  const [subjectMode, setSubjectMode] = useState('single');
  // Muda após enviar: recria os campos de PDF e apaga o nome do arquivo escolhido.
  const [formGeneration, setFormGeneration] = useState(0);
  const [importMode, setImportMode] = useState('pdf');
  const [pastedText, setPastedText] = useState('');
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
  const [reviewTab, setReviewTab] = useState<
    'pending' | 'completed' | 'discarded'
  >('pending');
  const [cropDraft, setCropDraft] = useState({
    x: 10,
    y: 20,
    width: 80,
    height: 50,
  });
  const [cropPointer, setCropPointer] = useState<{
    candidateId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

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

  const refresh = useCallback(async () => {
    const response = await apiFetch(`${apiUrl}/api/exam-imports`);
    const body = (await response.json()) as {
      data?: ExamImport[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || 'Falha ao listar importações.');
    setImports(body.data || []);
  }, [apiUrl]);

  const refreshDuplicates = useCallback(async () => {
    const response = await apiFetch(`${apiUrl}/api/questions/duplicates`);
    const body = (await response.json()) as {
      data?: DuplicateQuestion[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || 'Falha ao listar duplicidades.');
    setDuplicates(body.data || []);
  }, [apiUrl]);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch((error) => setMessage(error.message));
    void Promise.resolve()
      .then(refreshDuplicates)
      .catch((error) => setMessage(error.message));
  }, [refresh, refreshDuplicates]);

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
  }, [refresh, imports]);

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

  const deleteDuplicate = async (duplicate: DuplicateQuestion) => {
    if (
      !window.confirm(
        `Excluir definitivamente ${duplicate.code}? Esta ação não pode ser desfeita. A questão original ${duplicate.duplicateOfCode} será mantida.`,
      )
    )
      return;
    const response = await apiFetch(
      `${apiUrl}/api/questions/${duplicate.id}/duplicate/permanent`,
      { method: 'DELETE' },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível excluir a duplicata.');
    await refreshDuplicates();
    setMessage(
      `${duplicate.code} foi excluída. ${duplicate.duplicateOfCode} permanece no acervo.`,
    );
  };

  const visibleCandidates = (item: ExamImport) =>
    item.candidates.filter(
      (candidate) =>
        importReviewGroup(candidate) === reviewTab &&
        candidateMatchesReviewFilters(
          candidate,
          item,
          reviewFilters,
          pedagogicalTopics,
        ),
    );

  const visibleCount = imports.reduce(
    (total, item) => total + visibleCandidates(item).length,
    0,
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
    // Descartar em massa pede confirmação (as questões podem ser restauradas na aba Descartadas).
    if (
      action === 'ignore' &&
      !window.confirm(
        `Descartar ${actionable.length} questão(ões) visível(is)? Elas podem ser restauradas na aba Descartadas.`,
      )
    )
      return;
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
        const topicsResponse = await apiFetch(
          `${apiUrl}/api/curriculum/pedagogical-topics`,
        );
        const topicsBody = (await topicsResponse.json()) as {
          data?: PedagogicalTopic[];
          error?: string;
        };
        if (!topicsResponse.ok)
          throw new Error(
            topicsBody.error ||
              'Falha ao carregar os conteúdos das disciplinas.',
          );
        setPedagogicalTopics(topicsBody.data || []);
      })
      .catch((error) => setMessage(error.message));
  }, [apiUrl]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const exam = data.get('examPdf');
    const answerKey = data.get('answerKeyPdf');
    const examPdfUrl = formString(data, 'examPdfUrl').trim();
    const answerKeyPdfUrl = formString(data, 'answerKeyPdfUrl').trim();
    const examFile = exam instanceof File && exam.size ? exam : null;
    const keyFile =
      answerKey instanceof File && answerKey.size ? answerKey : null;
    if (importMode === 'text') {
      try {
        parsePastedExam(pastedText);
      } catch (error) {
        return setMessage(
          error instanceof Error ? error.message : 'Lote inválido.',
        );
      }
    }
    if (
      importMode === 'pdf' &&
      ((!examFile && !examPdfUrl) || (examFile && examPdfUrl))
    )
      return setMessage('Informe um arquivo ou uma URL para a prova.');
    if (importMode === 'pdf' && keyFile && answerKeyPdfUrl)
      return setMessage(
        'Informe arquivo ou URL para o gabarito, apenas uma opção.',
      );
    const files =
      importMode === 'text'
        ? []
        : [
            ...(examFile ? [{ file: examFile, kind: 'exam' }] : []),
            ...(keyFile ? [{ file: keyFile, kind: 'answer_key' }] : []),
          ];
    if (files.some(({ file }) => file.type !== 'application/pdf'))
      return setMessage('Envie somente arquivos PDF.');
    if (files.some(({ file }) => file.size > 15_000_000))
      return setMessage('Cada PDF deve ter no máximo 15 MB.');
    setBusy(true);
    setMessage('Enviando os documentos para a área de preparação...');
    try {
      const documents = await Promise.all(
        files.map(async ({ file, kind }) => ({
          kind,
          fileName: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      );
      const response = await apiFetch(`${apiUrl}/api/exam-imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceInstitution: formString(data, 'sourceInstitution'),
          sourceYear: Number(data.get('sourceYear')),
          examType: formString(data, 'examType'),
          subjectMode,
          primarySubject:
            subjectMode === 'single' ? formString(data, 'primarySubject') : '',
          sourceUrl: formString(data, 'sourceUrl'),
          examPdfUrl: importMode === 'pdf' ? examPdfUrl : '',
          answerKeyPdfUrl: importMode === 'pdf' ? answerKeyPdfUrl : '',
          pastedText: importMode === 'text' ? pastedText : '',
          rightsStatus: formString(data, 'rightsStatus'),
          documents: importMode === 'pdf' ? documents : [],
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Falha ao enviar a prova.');
      form.reset();
      setFormGeneration((value) => value + 1);
      setSubjectMode('single');
      setExamPreview(null);
      setAnswerKeyPreview(null);
      setPastedText('');
      setMessage(
        importMode === 'text'
          ? 'Lote separado em questões e salvo para revisão. Confirme os gabaritos, classifique e cadastre as selecionadas.'
          : 'Prova recebida. Ela permanece isolada até a revisão editorial.',
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

  const removeFailedImport = async (item: ExamImport) => {
    if (
      !window.confirm(
        `Remover ${item.sourceInstitution} ${item.sourceYear} da fila? Os PDFs e candidatos desta importação serão excluídos.`,
      )
    )
      return;
    const response = await apiFetch(`${apiUrl}/api/exam-imports/${item.id}`, {
      method: 'DELETE',
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível remover a importação.');
    await refresh();
    setMessage('Importação removida da fila.');
  };

  const controlAiAnalysis = async (
    item: ExamImport,
    action: 'start' | 'cancel' | 'retry',
  ) => {
    const suffix = action === 'start' ? 'analyze' : `analyze/${action}`;
    const response = await apiFetch(
      `${apiUrl}/api/exam-imports/${item.id}/${suffix}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: aiProviders[item.id] || 'gemini' }),
      },
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

  const decideAiSuggestionFields = async (
    item: ExamImport,
    candidate: ExamImportCandidate,
    fields: AiReviewField[],
    decision: 'accept' | 'reject',
  ) => {
    const suggestion = candidate.aiSuggestion;
    if (!suggestion) return;
    const previousAccepted = candidate.aiReview?.acceptedFields || [];
    const previousRejected = candidate.aiReview?.rejectedFields || [];
    const acceptedFields =
      decision === 'accept'
        ? [...new Set([...previousAccepted, ...fields])]
        : previousAccepted.filter((field) => !fields.includes(field));
    const rejectedFields =
      decision === 'reject'
        ? [...new Set([...previousRejected, ...fields])]
        : previousRejected.filter((field) => !fields.includes(field));
    const changes: Partial<ExamImportCandidate> = {
      status: 'review',
      aiReview: { acceptedFields, rejectedFields },
    };

    if (decision === 'reject') {
      await updateCandidate(item.id, candidate.id, changes);
      setMessage(
        `${fields.length} sugestão(ões) rejeitada(s) na questão ${candidate.sourceNumber}.`,
      );
      return;
    }

    const discipline = pedagogicalDisciplines.find(
      (entry) =>
        entry.name.toLocaleLowerCase('pt-BR') ===
        suggestion.subject?.toLocaleLowerCase('pt-BR'),
    );
    if (fields.includes('rawText')) {
      changes.rawText = suggestion.normalizedText;
      // O texto-base sai do enunciado junto com a conversão aceita.
      if (suggestion.sharedText) changes.sharedText = suggestion.sharedText;
    }
    if (fields.includes('questionType'))
      changes.questionType = suggestion.questionType;
    if (fields.includes('pedagogicalDisciplineId') && discipline)
      changes.pedagogicalDisciplineId = discipline.id;
    if (fields.includes('grade') && suggestion.grade)
      changes.grade = suggestion.grade;
    if (fields.includes('difficulty') && suggestion.difficulty)
      changes.difficulty = suggestion.difficulty;
    if (fields.includes('correctAnswers') && suggestion.correctAnswers.length) {
      changes.correctAnswers = suggestion.correctAnswers;
      changes.answerStatus = 'suggested';
      changes.answerConfidence = suggestion.confidence;
    }
    if (fields.includes('skill') && suggestion.skillCode)
      changes.skill = suggestion.skillCode;
    if (fields.includes('pedagogicalTopicId') && suggestion.topicId)
      changes.pedagogicalTopicId = suggestion.topicId;

    await updateCandidate(item.id, candidate.id, changes);
    setMessage(
      `${fields.length} sugestão(ões) aceita(s) na questão ${candidate.sourceNumber}; o gabarito ainda exige confirmação.`,
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
    const body = (await response.json()) as {
      data?: ExamImportCandidate;
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível atualizar a questão.');
    if (body.data) {
      setImports((current) =>
        current.map((item) =>
          item.id === importId
            ? {
                ...item,
                candidates: item.candidates.map((candidate) =>
                  candidate.id === candidateId
                    ? { ...candidate, ...body.data }
                    : candidate,
                ),
              }
            : item,
        ),
      );
    }
  };

  const updateCandidateDraft = (
    importId: string,
    candidateId: string,
    rawText: string,
  ) =>
    setImports((current) =>
      current.map((item) =>
        item.id === importId
          ? {
              ...item,
              candidates: item.candidates.map((candidate) =>
                candidate.id === candidateId
                  ? {
                      ...candidate,
                      rawText,
                      editorialReviewed: false,
                      status: 'review',
                    }
                  : candidate,
              ),
            }
          : item,
      ),
    );

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

  const beginCropSelection = (
    candidateId: string,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropPointer({
      candidateId,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  };

  const updateCropSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropPointer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCropPointer({
      ...cropPointer,
      currentX: Math.max(
        0,
        Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
      ),
      currentY: Math.max(
        0,
        Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
      ),
    });
  };

  const finishCropSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropPointer) return;
    const left = Math.min(cropPointer.startX, cropPointer.currentX);
    const top = Math.min(cropPointer.startY, cropPointer.currentY);
    const width = Math.abs(cropPointer.currentX - cropPointer.startX);
    const height = Math.abs(cropPointer.currentY - cropPointer.startY);
    if (width >= 1 && height >= 1)
      setCropDraft({ x: left, y: top, width, height });
    setCropPointer(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
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

  // Texto-base do grupo do item: reaproveita o já criado no banco ou cria no
  // primeiro cadastro e grava o vínculo em todos os itens do grupo.
  const ensureSharedText = async (
    item: ExamImport,
    candidate: ExamImportCandidate,
    created = new Map<string, SharedTextSummary>(),
  ): Promise<SharedTextSummary | null> => {
    const group = examSharedTextGroups(item.candidates).byCandidate.get(
      candidate.id,
    );
    if (!group) return null;
    const cached = created.get(group.key);
    if (cached) return cached;
    if (group.sharedTextId) {
      const response = await apiFetch(
        `${apiUrl}/api/questions/shared-texts/${group.sharedTextId}`,
        { cache: 'no-store' },
      );
      if (response.ok) {
        const summary = ((await response.json()) as { data: SharedTextSummary })
          .data;
        created.set(group.key, summary);
        return summary;
      }
    }
    // Blocos ConTeXt têm limite de 20 mil caracteres: divide por parágrafo.
    const content: Array<{ type: 'contextRaw'; code: string }> = [];
    for (const paragraph of group.content.split(/\n{2,}/)) {
      const last = content.at(-1);
      if (last && last.code.length + paragraph.length + 2 <= 20_000)
        last.code = `${last.code}\n\n${paragraph}`;
      else
        content.push({ type: 'contextRaw', code: paragraph.slice(0, 20_000) });
    }
    const response = await apiFetch(`${apiUrl}/api/questions/shared-texts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: group.title,
        source: group.source,
        content,
      }),
    });
    const body = (await response.json()) as {
      data?: SharedTextSummary;
      error?: string;
      issues?: Array<{ message: string }>;
    };
    if (!response.ok || !body.data)
      throw new Error(
        `Texto-base dos itens ${group.sourceNumbers.join(', ')}: ${
          body.issues?.map((issue) => issue.message).join(' ') ||
          body.error ||
          'não foi possível criar.'
        }`,
      );
    created.set(group.key, body.data);
    for (const id of group.candidateIds)
      await updateCandidate(item.id, id, { sharedTextId: body.data.id });
    return body.data;
  };

  const registerSelectedCandidates = async (item: ExamImport) => {
    const settings = bulkSettings[item.id] || defaultBulkSettings;
    const readyCandidates = item.candidates.filter(
      (candidate) => candidateReadiness(candidate).ready,
    );
    if (!readyCandidates.length) {
      setMessage(
        'Nenhuma questão está pronta. Selecione-a, confira A–E e confirme o gabarito.',
      );
      return;
    }
    const unclassified = readyCandidates.filter(
      (candidate) =>
        !resolveImportClassification({
          candidate,
          settings,
          item,
          disciplines: pedagogicalDisciplines,
          topics: pedagogicalTopics,
        }).topicId,
    );
    if (unclassified.length) {
      setMessage(
        `Classifique a série e o objeto de conhecimento da(s) questão(ões) ${unclassified.map((candidate) => candidate.sourceNumber).join(', ')} ou informe os padrões do lote.`,
      );
      return;
    }
    const invalidSkill = readyCandidates.find((candidate) => {
      const skill = resolveImportClassification({
        candidate,
        settings,
        item,
        disciplines: pedagogicalDisciplines,
        topics: pedagogicalTopics,
      }).skill;
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
    const createdSharedTexts = new Map<string, SharedTextSummary>();
    for (const candidate of readyCandidates) {
      try {
        const sharedText = await ensureSharedText(
          item,
          candidate,
          createdSharedTexts,
        );
        const classification = resolveImportClassification({
          candidate,
          settings,
          item,
          disciplines: pedagogicalDisciplines,
          topics: pedagogicalTopics,
        });
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
            answerGuide: candidate.resolution || '',
            ...(candidate.adoteNote
              ? {
                  statementBlocks: [
                    ...statementBlocks,
                    { type: 'adoteNote', text: candidate.adoteNote },
                  ],
                }
              : {}),
            subject: classification.subject,
            grade: classification.grade,
            sourceInstitution: item.sourceInstitution,
            sourceYear: item.sourceYear,
            skill: classification.skill.trim(),
            pedagogicalDisciplineId: classification.discipline?.id || '',
            pedagogicalTopicId: classification.topicId,
            difficulty: candidate.difficulty || settings.difficulty,
            sharedTextId: sharedText?.id || '',
            alternatives:
              candidate.questionType === 'essay'
                ? []
                : candidate.questionType === 'true_false'
                  ? ['Certo', 'Errado'].map((content, index) => ({
                      stableKey: index === 0 ? 'alt-a' : 'alt-b',
                      content,
                      contentBlocks: [{ type: 'paragraph', text: content }],
                      isCorrect: (candidate.correctAnswers || []).includes(
                        index === 0 ? 'A' : 'B',
                      ),
                      position: index + 1,
                    }))
                  : ['A', 'B', 'C', 'D', 'E'].map((letter, index) => {
                      const contentBlocks = parsed.alternatives[letter];
                      return {
                        stableKey: `alt-${letter.toLowerCase()}`,
                        content: contentBlocks
                          .map(blockPlainText)
                          .join(' ')
                          .trim(),
                        contentBlocks,
                        isCorrect: (candidate.correctAnswers || []).includes(
                          letter,
                        ),
                        position: index + 1,
                      };
                    }),
          }),
        });
        const body = (await response.json()) as {
          data?: { id: string; code: string };
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
        await updateCandidate(item.id, candidate.id, {
          status: 'completed',
          selected: false,
          registeredQuestionId: body.data?.id,
          registeredQuestionCode: body.data?.code,
        });
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

  const importSummary = [
    {
      label: 'Na fila',
      value: imports.filter((item) =>
        ['uploaded', 'queued'].includes(
          item.processingJob?.status || item.status,
        ),
      ).length,
      tone: 'bg-slate-50 text-slate-700',
    },
    {
      label: 'Processando',
      value: imports.filter(
        (item) =>
          item.processingJob?.status === 'running' ||
          item.aiJob?.status === 'running' ||
          item.status === 'extracting',
      ).length,
      tone: 'bg-sky-50 text-sky-800',
    },
    {
      label: 'Em revisão',
      value: imports.filter(
        (item) =>
          item.status === 'needs_review' ||
          item.candidates.some((candidate) => candidate.status === 'review'),
      ).length,
      tone: 'bg-amber-50 text-amber-900',
    },
    {
      label: 'Concluídas',
      value: imports.filter((item) => item.status === 'completed').length,
      tone: 'bg-emerald-50 text-emerald-800',
    },
    {
      label: 'Com erro',
      value: imports.filter(
        (item) =>
          item.status === 'failed' ||
          item.processingJob?.status === 'failed' ||
          item.aiJob?.status === 'failed',
      ).length,
      tone: 'bg-rose-50 text-rose-800',
    },
  ];

  return (
    <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">
        Curadoria editorial
      </p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display mt-1 text-3xl font-bold text-[var(--navy)]">
          Importar provas
        </h1>
        <Button
          type="button"
          onClick={onNewQuestion}
          className="bg-[var(--blue)] text-white hover:bg-blue-700"
        >
          <Plus /> Inserir questão
        </Button>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">
        Cadastre a fonte e envie os PDFs. Os documentos ficam em preparação e
        nenhuma questão entra no banco público sem revisão e aprovação.
      </p>
      <nav
        aria-label="Etapas da importação"
        className="mt-6 grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-3"
      >
        {[
          ['01', 'Enviar documentos', 'Fonte, prova e gabarito'],
          ['02', 'Extrair e revisar', 'Texto, imagens e classificação'],
          ['03', 'Cadastrar questões', 'Aprovação editorial no acervo'],
        ].map(([number, title, description], index) => (
          <div
            key={number}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 ${index === 0 ? 'bg-blue-50' : 'bg-slate-50'}`}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${index === 0 ? 'bg-blue-700 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
            >
              {number}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--navy)]">
                {title}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {description}
              </span>
            </span>
          </div>
        ))}
      </nav>
      {message && (
        <output className="mt-4 block rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-950">
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
                        className="text-blue-700 underline"
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
                    <div className="flex flex-wrap gap-2">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          deleteDuplicate(duplicate).catch((error) =>
                            setMessage(error.message),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                        Excluir
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileUp className="size-5 text-blue-700" />
            <div>
              <h2 className="font-display text-xl font-bold">
                Nova importação
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Comece pelos dados da fonte e anexe os documentos originais.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            Etapa 1 de 3
          </span>
        </div>
        <div className="mt-5 flex gap-2" aria-label="Origem da importação">
          <Button
            type="button"
            variant={importMode === 'pdf' ? 'default' : 'outline'}
            onClick={() => setImportMode('pdf')}
          >
            PDF
          </Button>
          <Button
            type="button"
            variant={importMode === 'text' ? 'default' : 'outline'}
            onClick={() => setImportMode('text')}
          >
            Lote por texto / TXT / Markdown
          </Button>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label htmlFor="import-source-institution" className={fieldLabel}>
              Instituição
              <Input
                id="import-source-institution"
                name="sourceInstitution"
                required
                placeholder="Ex.: ITA, Fuvest, ENEM"
                className="font-normal"
              />
            </label>
            <label htmlFor="import-source-year" className={fieldLabel}>
              Ano da prova
              <Input
                id="import-source-year"
                name="sourceYear"
                required
                type="number"
                min="1900"
                max="2100"
                defaultValue={String(new Date().getFullYear())}
                className="font-normal"
              />
            </label>
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
              <label htmlFor="import-primary-subject" className={fieldLabel}>
                Disciplina da prova
                <Input
                  id="import-primary-subject"
                  className="font-normal"
                  name="primarySubject"
                  required
                  list="exam-import-disciplines"
                  placeholder="Ex.: Química"
                  autoComplete="off"
                />
                <datalist id="exam-import-disciplines">
                  {[
                    ...new Set(
                      orderedHighSchoolDisciplines(pedagogicalDisciplines).map(
                        (discipline) => discipline.name,
                      ),
                    ),
                  ].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </datalist>
              </label>
            )}
            <label htmlFor="import-source-url" className={fieldLabel}>
              <span>
                Página de referência{' '}
                <span className="font-normal text-slate-500">(opcional)</span>
              </span>
              <Input
                id="import-source-url"
                name="sourceUrl"
                type="url"
                placeholder="https://… (não baixa o PDF)"
                className="font-normal"
              />
            </label>
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
          <div hidden={importMode !== 'pdf'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <PdfField
                key={`exam-${formGeneration}`}
                name="examPdf"
                title="PDF da prova"
                onFileSelected={(file) => updatePreview(file, setExamPreview)}
              />
              <PdfField
                key={`key-${formGeneration}`}
                name="answerKeyPdf"
                title="PDF do gabarito"
                onFileSelected={(file) =>
                  updatePreview(file, setAnswerKeyPreview)
                }
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label
                htmlFor="exam-pdf-url"
                className="space-y-2 text-sm font-semibold text-slate-700"
              >
                Ou URL do PDF da prova
                <Input
                  id="exam-pdf-url"
                  name="examPdfUrl"
                  type="url"
                  placeholder="https://instituicao.br/prova.pdf"
                  className="font-normal"
                />
                <span className="block text-xs font-normal text-slate-500">
                  Link direto HTTPS, público, até 15 MB. Escolha arquivo ou URL.
                </span>
              </label>
              <label
                htmlFor="answer-key-pdf-url"
                className="space-y-2 text-sm font-semibold text-slate-700"
              >
                Ou URL do PDF do gabarito (opcional)
                <Input
                  id="answer-key-pdf-url"
                  name="answerKeyPdfUrl"
                  type="url"
                  placeholder="https://instituicao.br/gabarito.pdf"
                  className="font-normal"
                />
                <span className="block text-xs font-normal text-slate-500">
                  Link direto HTTPS, público, até 15 MB. Escolha arquivo ou URL.
                </span>
              </label>
            </div>
          </div>
          {importMode === 'text' && (
            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Importar questões em lote
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Cole o texto da prova ou carregue um arquivo. Você poderá
                    revisar cada questão antes de cadastrar.
                  </p>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <FileUp className="size-4" />
                  Carregar TXT ou Markdown
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    className="sr-only"
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      if (
                        !/\.(txt|md|markdown)$/i.test(file.name) ||
                        file.size > 2_000_000
                      ) {
                        setMessage(
                          'Escolha TXT ou Markdown em UTF-8, até 2 MB.',
                        );
                        return;
                      }
                      try {
                        setPastedText(await file.text());
                        setMessage(
                          'Arquivo carregado. Confira o texto e envie o lote para revisão.',
                        );
                      } catch {
                        setMessage('Não foi possível ler o arquivo.');
                      }
                      input.value = '';
                    }}
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Texto do lote
                <textarea
                  aria-label="Texto do lote"
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  rows={12}
                  maxLength={1_000_000}
                  spellCheck={false}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6"
                  placeholder="Cole aqui o texto das questões..."
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  TXT ou Markdown, até 2 MB. O lote pode conter até 100
                  questões.
                </span>
              </label>
              <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Ver exemplo do formato de importação
                </summary>
                <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  {`# Questões de certo ou errado
## Bloco 1: Tema das questões
**1.** Afirmação a ser julgada como certa ou errada.
**2.** Outra afirmação para julgar.

## Gabarito
| Questão | Gabarito | Questão | Gabarito |
| --- | --- | --- | --- |
| 1 | C | 2 | E |

## Comentários
**1. CERTO.** Comentário ou resolução da primeira questão.
**2. ERRADO.** Comentário ou resolução da segunda questão.`}
                </pre>
                <p className="mt-2 text-xs text-slate-500">
                  Também aceitamos o gabarito em tabela e os comentários
                  separados por número. O exemplo é apenas uma referência e não
                  será inserido no campo.
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Questões com classificação do catálogo
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  {`QUESTÃO 1
DISCIPLINA: Química
SÉRIE: 2ª série
TÓPICO: Estequiometria
SUBTÓPICO: Cálculo estequiométrico
HABILIDADE: EM13CNT301
Enunciado da questão...
(A) Primeira alternativa
(B) Segunda alternativa
GABARITO: B`}
                </pre>
                <p className="mt-2 text-xs text-slate-500">
                  Os campos são opcionais e usam os nomes cadastrados em
                  Planejamento, sem diferenciar maiúsculas ou acentos. Nome não
                  encontrado impede o lote e indica a questão. Sem os campos,
                  valem os padrões do lote.
                </p>
              </details>
            </section>
          )}
          {importMode === 'pdf' && (examPreview || answerKeyPreview) && (
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

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                02
              </span>
              <h2 className="font-display text-xl font-bold">
                Revisão das importações
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              Documentos aguardando extração, classificação e aprovação.
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {importSummary.map((summary) => (
            <div
              key={summary.label}
              className={`rounded-xl px-4 py-3 ${summary.tone}`}
            >
              <p className="text-2xl font-bold">{summary.value}</p>
              <p className="text-xs font-semibold">{summary.label}</p>
            </div>
          ))}
        </div>
        <div
          className="mt-5 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Fila de revisão das importações"
        >
          {(
            [
              ['pending', 'Pendentes'],
              ['completed', 'Concluídas'],
              ['discarded', 'Descartadas'],
            ] as const
          ).map(([group, label]) => (
            <Button
              key={group}
              type="button"
              role="tab"
              aria-selected={reviewTab === group}
              variant={reviewTab === group ? 'default' : 'outline'}
              onClick={() => {
                setReviewTab(group);
                setReviewFilters((current) => ({ ...current, status: '' }));
              }}
            >
              {label} (
              {
                imports
                  .flatMap((item) => item.candidates)
                  .filter((candidate) => importReviewGroup(candidate) === group)
                  .length
              }
              )
            </Button>
          ))}
        </div>
        <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
          <div className="grid items-end gap-2 md:grid-cols-2 xl:grid-cols-6">
            <label htmlFor="import-review-search" className={fieldLabel}>
              Buscar
              <Input
                id="import-review-search"
                className="h-9 font-normal"
                value={reviewFilters.query}
                onChange={(event) =>
                  setReviewFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder="Questão ou trecho..."
              />
            </label>
            <SelectField
              name="review-status"
              label="Situação editorial"
              value={reviewFilters.status}
              onChange={(status) =>
                setReviewFilters((current) => ({ ...current, status }))
              }
              options={[
                ['', 'Todas as situações'],
                ...((reviewTab === 'pending'
                  ? [
                      ['complete', 'Completa'],
                      ['pending', 'Pendente'],
                      ['review', 'Em revisão'],
                    ]
                  : reviewTab === 'discarded'
                    ? [
                        ['duplicate', 'Duplicada'],
                        ['ignored', 'Descartada'],
                      ]
                    : [['completed', 'Concluída']]) as Array<[string, string]>),
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
                ['true_false', 'Certo ou errado'],
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
              {visibleCount} questão(ões) visível(is). As ações afetam somente
              este resultado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  batchActionBusy || !visibleCount || reviewTab !== 'pending'
                }
                onClick={() => applyVisibleAction('select')}
              >
                Selecionar visíveis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  batchActionBusy || !visibleCount || reviewTab !== 'pending'
                }
                onClick={() => applyVisibleAction('unselect')}
              >
                Desmarcar visíveis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  batchActionBusy || !visibleCount || reviewTab !== 'pending'
                }
                onClick={() => applyVisibleAction('confirm')}
              >
                Confirmar gabaritos sugeridos
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  batchActionBusy || !visibleCount || reviewTab !== 'pending'
                }
                onClick={() => applyVisibleAction('ignore')}
              >
                Descartar visíveis
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  batchActionBusy || !visibleCount || reviewTab !== 'discarded'
                }
                onClick={() => applyVisibleAction('restore')}
              >
                Restaurar descartadas
              </Button>
            </div>
          </div>
        </section>
        <div className="mt-4 space-y-3">
          {imports.length > 0 &&
            !imports.some(
              (item) =>
                visibleCandidates(item).length ||
                (reviewTab === 'pending' && !item.candidates.length),
            ) && (
              <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                Nenhuma questão nesta aba com os filtros atuais.
              </p>
            )}
          {!imports.length && (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
              Nenhuma prova foi enviada ainda.
            </p>
          )}
          {imports
            .filter(
              (item) =>
                visibleCandidates(item).length > 0 ||
                (reviewTab === 'pending' && !item.candidates.length),
            )
            .map((item) => (
              <article
                key={item.id}
                className={`overflow-hidden rounded-xl border bg-white transition ${selectedImportId === item.id ? 'border-blue-300 shadow-sm' : 'border-slate-200 hover:border-blue-200'}`}
              >
                <button
                  type="button"
                  aria-expanded={selectedImportId === item.id}
                  onClick={() =>
                    setSelectedImportId((current) =>
                      current === item.id ? '' : item.id,
                    )
                  }
                  className="grid w-full gap-3 p-4 text-left md:grid-cols-[minmax(220px,1.4fr)_minmax(150px,1fr)_120px_minmax(150px,1fr)_auto] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {selectedImportId === item.id ? (
                      <ChevronDown className="size-5 shrink-0 text-blue-700" />
                    ) : (
                      <ChevronRight className="size-5 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[var(--navy)]">
                        {item.sourceInstitution} · {item.sourceYear}
                      </h3>
                      <p className="truncate text-xs text-slate-500">
                        {item.examType} · criada em{' '}
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.primarySubject || 'Multidisciplinar'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.documents.length
                        ? item.documents
                            .map((document) =>
                              document.kind === 'exam' ? 'Prova' : 'Gabarito',
                            )
                            .join(' + ')
                        : 'Sem arquivos'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {item.reviewedQuestions}/{item.detectedQuestions}
                    </p>
                    <p className="text-xs text-slate-500">revisadas</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {statusLabels[item.status] || item.status}
                    </p>
                    {item.processingJob && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-600"
                          style={{ width: `${item.processingJob.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <span
                    className={`justify-self-start rounded-full px-3 py-1 text-xs font-semibold md:justify-self-end ${item.rightsStatus === 'authorized' || item.rightsStatus === 'public_license' ? 'bg-emerald-50 text-emerald-800' : item.rightsStatus === 'blocked' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}
                  >
                    {rightsLabels[item.rightsStatus] || item.rightsStatus}
                  </span>
                </button>
                {selectedImportId === item.id && (
                  <div className="border-t border-slate-200 bg-slate-50/40 p-4 sm:p-5">
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
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs transition hover:bg-blue-50 hover:text-blue-900"
                        >
                          <FileText className="size-4 text-blue-700" />
                          {document.kind === 'exam' ? 'Prova' : 'Gabarito'}:{' '}
                          {document.fileName} ·{' '}
                          {(document.sizeBytes / 1_000_000).toFixed(1)} MB
                          <Eye className="ml-1 size-4" />
                          <span className="font-semibold">Visualizar</span>
                        </button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          removeFailedImport(item).catch((error) =>
                            setMessage(error.message),
                          )
                        }
                      >
                        <Trash2 /> Remover da fila
                      </Button>
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
                                  controlProcessing(item, 'cancel').catch(
                                    (error) => setMessage(error.message),
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
                                  controlProcessing(item, 'retry').catch(
                                    (error) => setMessage(error.message),
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
                      <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-blue-900">
                              Análise assistida ·{' '}
                              {item.aiJob.stage === 'waiting_quota'
                                ? 'Aguardando cota da IA · retomada automática'
                                : item.aiJob.stage.replaceAll('_', ' ')}
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
                                controlAiAnalysis(item, 'cancel').catch(
                                  (error) => setMessage(error.message),
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
                                controlAiAnalysis(item, 'retry').catch(
                                  (error) => setMessage(error.message),
                                )
                              }
                            >
                              Repetir análise
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full rounded-full bg-blue-600"
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
                    <section className="mt-5 border-t border-slate-100 pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-[var(--navy)]">
                            Questões extraídas
                          </h4>
                          <p className="text-xs text-slate-500">
                            Selecione, classifique e revise cada questão antes
                            do cadastro. A IA analisa até cinco selecionadas por
                            vez e apenas sugere alterações.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Boolean(
                            item.documents?.some(
                              (document) => document.kind === 'exam',
                            ),
                          ) && (
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
                          )}
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            IA para conversão
                            <select
                              aria-label="IA para conversão"
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={aiProviders[item.id] || 'gemini'}
                              disabled={['queued', 'running'].includes(
                                item.aiJob?.status || '',
                              )}
                              onChange={(event) =>
                                setAiProviders((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="gemini">Gemini</option>
                              <option value="deepseek">DeepSeek</option>
                              <option value="openai">ChatGPT (OpenAI)</option>
                            </select>
                          </label>
                          {Boolean(item.candidates?.length) && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={['queued', 'running'].includes(
                                item.aiJob?.status || '',
                              )}
                              onClick={() =>
                                controlAiAnalysis(item, 'start').catch(
                                  (error) => setMessage(error.message),
                                )
                              }
                            >
                              <Sparkles /> Converter próximo lote para ConTeXt
                              com IA
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
                      {!item.candidates?.length &&
                        item.status === 'needs_review' && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <strong>Revisão manual necessária.</strong> A prova
                            foi mantida. Abra a prévia do PDF, selecione a
                            página e crie cada questão por recorte.
                          </div>
                        )}
                      {Boolean(item.candidates?.length) &&
                        reviewTab === 'pending' && (
                          <BulkRegistrationPanel
                            item={item}
                            settings={
                              bulkSettings[item.id] || defaultBulkSettings
                            }
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
                        {visibleCandidates(item).map((candidate) =>
                          reviewTab !== 'pending' ? (
                            <article
                              key={candidate.id}
                              className="rounded-xl border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold">
                                  Questão {candidate.sourceNumber} ·{' '}
                                  {reviewTab === 'completed'
                                    ? 'Concluída'
                                    : candidate.status === 'duplicate'
                                      ? 'Duplicada'
                                      : 'Descartada'}
                                </p>
                                {(candidate.registeredQuestionId ||
                                  candidate.duplicateQuestionId) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      onOpenQuestion(
                                        (candidate.registeredQuestionId ||
                                          candidate.duplicateQuestionId)!,
                                      )
                                    }
                                  >
                                    Abrir{' '}
                                    {candidate.registeredQuestionCode ||
                                      candidate.duplicateQuestionCode ||
                                      'questão no banco'}{' '}
                                    <ArrowRight />
                                  </Button>
                                )}
                                {candidate.status === 'ignored' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateCandidate(item.id, candidate.id, {
                                        status: 'review',
                                        selected: true,
                                      }).catch((error) =>
                                        setMessage(error.message),
                                      )
                                    }
                                  >
                                    Restaurar para pendentes
                                  </Button>
                                )}
                              </div>
                              {candidate.registeredAt && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Cadastrada em{' '}
                                  {new Date(
                                    candidate.registeredAt,
                                  ).toLocaleString('pt-BR')}
                                </p>
                              )}
                              <details className="mt-3">
                                <summary className="cursor-pointer text-sm">
                                  Ver conteúdo importado
                                </summary>
                                <pre className="mt-2 whitespace-pre-wrap text-xs">
                                  {candidate.rawText}
                                </pre>
                                {candidate.resolution && (
                                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                                    Resolução: {candidate.resolution}
                                  </pre>
                                )}
                              </details>
                            </article>
                          ) : (
                            <article
                              key={candidate.id}
                              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
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
                                      }).catch((error) =>
                                        setMessage(error.message),
                                      )
                                    }
                                    className="size-4 accent-blue-700"
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
                                    }).catch((error) =>
                                      setMessage(error.message),
                                    )
                                  }
                                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs"
                                >
                                  <option value="single_choice">
                                    Múltipla escolha · uma resposta
                                  </option>
                                  <option value="multiple_choice">
                                    Múltipla escolha · várias respostas
                                  </option>
                                  <option value="true_false">
                                    Certo ou errado · uma afirmação
                                  </option>
                                  <option value="essay">Discursiva</option>
                                </select>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${candidate.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : candidate.status === 'duplicate' ? 'bg-rose-100 text-rose-800' : candidate.status === 'ignored' ? 'bg-slate-200 text-slate-700' : candidate.status === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}
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
                                        current === candidate.id
                                          ? ''
                                          : candidate.id,
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
                                {candidate.extractionMethod ===
                                  'gemini-pdf' && (
                                  <span className="text-xs font-semibold text-blue-700">
                                    PDF lido diretamente pelo Gemini · revisão
                                    obrigatória
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {candidateEditorialChecks(candidate).map(
                                  (check) => (
                                    <span
                                      key={check.label}
                                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${check.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
                                    >
                                      {check.ok ? '✓' : '!'} {check.label}
                                    </span>
                                  ),
                                )}
                              </div>
                              {(() => {
                                const group = examSharedTextGroups(
                                  item.candidates,
                                ).byCandidate.get(candidate.id);
                                if (!group) return null;
                                return (
                                  <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                    <summary className="cursor-pointer font-semibold">
                                      Texto-base comum
                                      {group.title
                                        ? ` “${group.title}”`
                                        : ''} ·
                                      itens {group.sourceNumbers.join(', ')}
                                      {group.sharedTextId
                                        ? ' · já criado no banco'
                                        : ' · será criado no primeiro cadastro'}
                                    </summary>
                                    <p className="mt-1">
                                      Na prova, o texto sai uma vez antes do
                                      grupo. Se algum item não pertencer a ele,
                                      mude o tipo do item ou corrija o texto na
                                      conversão.
                                    </p>
                                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2">
                                      {group.content}
                                    </pre>
                                  </details>
                                );
                              })()}
                              {candidate.aiSuggestion &&
                                !['completed', 'duplicate', 'ignored'].includes(
                                  candidate.status,
                                ) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="mt-3"
                                    disabled={['queued', 'running'].includes(
                                      item.aiJob?.status || '',
                                    )}
                                    onClick={() =>
                                      updateCandidate(item.id, candidate.id, {
                                        resetAi: true,
                                      })
                                        .then(() =>
                                          setMessage(
                                            'Questão selecionada para nova conversão. Use Converter próximo lote para reprocessá-la.',
                                          ),
                                        )
                                        .catch((error) =>
                                          setMessage(error.message),
                                        )
                                    }
                                  >
                                    Preparar nova conversão desta questão
                                  </Button>
                                )}
                              {candidate.aiSuggestion && (
                                <AiSuggestionReview
                                  candidate={candidate}
                                  disciplines={pedagogicalDisciplines}
                                  topics={pedagogicalTopics}
                                  onAccept={(fields) =>
                                    decideAiSuggestionFields(
                                      item,
                                      candidate,
                                      fields,
                                      'accept',
                                    ).catch((error) => {
                                      setMessage(error.message);
                                    })
                                  }
                                  onReject={(fields) =>
                                    decideAiSuggestionFields(
                                      item,
                                      candidate,
                                      fields,
                                      'reject',
                                    ).catch((error) => {
                                      setMessage(error.message);
                                    })
                                  }
                                />
                              )}
                              {pagePreviewCandidateId === candidate.id &&
                                candidate.pageNumber && (
                                  <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                                    <div
                                      className="relative cursor-crosshair select-none overflow-hidden rounded-lg border border-slate-200 bg-white"
                                      onPointerDown={(event) =>
                                        beginCropSelection(candidate.id, event)
                                      }
                                      onPointerMove={updateCropSelection}
                                      onPointerUp={finishCropSelection}
                                    >
                                      <Image
                                        unoptimized
                                        width={1200}
                                        height={1600}
                                        draggable={false}
                                        alt={`Página original da questão ${candidate.sourceNumber}`}
                                        src={`${apiUrl}/api/exam-imports/${item.id}/pages/${candidate.pageNumber}.jpg`}
                                        className="block max-h-[620px] w-full object-contain"
                                      />
                                      {cropPointer?.candidateId ===
                                        candidate.id && (
                                        <div
                                          className="pointer-events-none absolute border-2 border-blue-600 bg-blue-300/20"
                                          style={{
                                            left: `${Math.min(cropPointer.startX, cropPointer.currentX)}%`,
                                            top: `${Math.min(cropPointer.startY, cropPointer.currentY)}%`,
                                            width: `${Math.abs(cropPointer.currentX - cropPointer.startX)}%`,
                                            height: `${Math.abs(cropPointer.currentY - cropPointer.startY)}%`,
                                          }}
                                        />
                                      )}
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500">
                                      Arraste o mouse sobre a página para
                                      selecionar o gráfico, tabela ou trecho da
                                      questão.
                                    </p>
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
                                              field === 'x' || field === 'y'
                                                ? 0
                                                : 1
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
                                                [field]: Number(
                                                  event.target.value,
                                                ),
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
                                        onClick={() =>
                                          createCrop(item, candidate)
                                        }
                                      >
                                        {croppingId === candidate.id
                                          ? 'Recortando...'
                                          : 'Criar recorte e extrair texto'}
                                      </Button>
                                    </div>
                                  </section>
                                )}
                              {candidate.imageDataUrl && (
                                <figure className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
                                  <Image
                                    unoptimized
                                    width={1200}
                                    height={1600}
                                    src={candidate.imageDataUrl}
                                    alt={
                                      candidate.imageAlt || 'Recorte da questão'
                                    }
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
                                        onOpenQuestion(
                                          candidate.duplicateQuestionId!,
                                        )
                                      }
                                    >
                                      Abrir questão principal
                                    </Button>
                                  </div>
                                )}
                              <CandidateClassificationFields
                                candidate={candidate}
                                item={item}
                                settings={
                                  bulkSettings[item.id] || defaultBulkSettings
                                }
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
                              <ImportedQuestionTextEditor
                                candidate={candidate}
                                onChange={(rawText) =>
                                  updateCandidateDraft(
                                    item.id,
                                    candidate.id,
                                    rawText,
                                  )
                                }
                                onSave={(rawText) =>
                                  updateCandidate(item.id, candidate.id, {
                                    rawText,
                                    status: 'review',
                                  })
                                    .then(() =>
                                      setMessage(
                                        `Texto da questão ${candidate.sourceNumber} salvo.`,
                                      ),
                                    )
                                    .catch((error) => setMessage(error.message))
                                }
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
                                          (candidate.answerConfidence || 0) *
                                            100,
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
                                    {(candidate.questionType === 'true_false'
                                      ? ['A', 'B']
                                      : ['A', 'B', 'C', 'D', 'E']
                                    ).map((letter) => {
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
                                                'single_choice' ||
                                              candidate.questionType ===
                                                'true_false'
                                                ? [letter]
                                                : checked
                                                  ? (
                                                      candidate.correctAnswers ||
                                                      []
                                                    ).filter(
                                                      (answer) =>
                                                        answer !== letter,
                                                    )
                                                  : [
                                                      ...(candidate.correctAnswers ||
                                                        []),
                                                      letter,
                                                    ];
                                            updateCandidate(
                                              item.id,
                                              candidate.id,
                                              {
                                                correctAnswers,
                                                answerStatus: 'confirmed',
                                                answerConfidence: 1,
                                                status: 'review',
                                              },
                                            ).catch((error) =>
                                              setMessage(error.message),
                                            );
                                          }}
                                          className={`grid size-9 place-items-center rounded-full border text-xs font-bold ${checked ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                                        >
                                          {candidate.questionType ===
                                          'true_false'
                                            ? letter === 'A'
                                              ? 'C'
                                              : 'E'
                                            : letter}
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
                                        (reason) =>
                                          reason !== 'não selecionada',
                                      )
                                      .join(' · ')}
                                  </p>
                                )}
                              <label className="mt-4 block text-sm font-semibold text-slate-700">
                                Resolução em ConTeXt (opcional)
                                <textarea
                                  aria-label={`Resolução da questão ${candidate.sourceNumber}`}
                                  key={`${candidate.id}-resolution`}
                                  defaultValue={candidate.resolution || ''}
                                  maxLength={20000}
                                  rows={6}
                                  spellCheck={false}
                                  disabled={['completed', 'duplicate'].includes(
                                    candidate.status,
                                  )}
                                  onBlur={(event) => {
                                    if (
                                      event.target.value !==
                                      (candidate.resolution || '')
                                    )
                                      updateCandidate(item.id, candidate.id, {
                                        resolution: event.target.value,
                                      }).catch((error) =>
                                        setMessage(error.message),
                                      );
                                  }}
                                  className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm"
                                />
                              </label>
                              <p className="mt-1 text-xs text-slate-500">
                                Use Editar, gerar prévia e cadastrar para
                                conferir a resolução no gabarito comentado.
                              </p>
                              {candidate.extractionMethod === 'pasted-text' && (
                                <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(
                                      candidate.editorialReviewed,
                                    )}
                                    disabled={[
                                      'completed',
                                      'duplicate',
                                    ].includes(candidate.status)}
                                    onChange={(event) =>
                                      updateCandidate(item.id, candidate.id, {
                                        editorialReviewed: event.target.checked,
                                      }).catch((error) =>
                                        setMessage(error.message),
                                      )
                                    }
                                  />
                                  Revisei o enunciado, as alternativas e a
                                  resolução desta questão
                                </label>
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
                                  onClick={async () => {
                                    let sharedText: SharedTextSummary | null =
                                      null;
                                    try {
                                      sharedText = await ensureSharedText(
                                        item,
                                        candidate,
                                      );
                                    } catch (error) {
                                      setMessage(
                                        error instanceof Error
                                          ? error.message
                                          : 'Não foi possível criar o texto-base.',
                                      );
                                      return;
                                    }
                                    const classification =
                                      resolveImportClassification({
                                        candidate,
                                        settings:
                                          bulkSettings[item.id] ||
                                          defaultBulkSettings,
                                        item,
                                        disciplines: pedagogicalDisciplines,
                                        topics: pedagogicalTopics,
                                      });
                                    updateCandidate(item.id, candidate.id, {
                                      status: 'review',
                                    }).catch((error) =>
                                      setMessage(error.message),
                                    );
                                    onRegisterQuestion({
                                      importId: item.id,
                                      candidateId: candidate.id,
                                      rawText: candidate.rawText,
                                      resolution: candidate.resolution,
                                      adoteNote: candidate.adoteNote,
                                      sourceInstitution: item.sourceInstitution,
                                      sourceYear: item.sourceYear,
                                      questionType: candidate.questionType,
                                      imageDataUrl: candidate.imageDataUrl,
                                      imageAlt: candidate.imageAlt,
                                      correctAnswers: candidate.correctAnswers,
                                      grade: classification.grade,
                                      subject: classification.subject,
                                      difficulty: candidate.difficulty,
                                      skill: classification.skill,
                                      pedagogicalDisciplineId:
                                        classification.discipline?.id,
                                      pedagogicalTopicId:
                                        classification.topicId,
                                      sharedText,
                                    });
                                  }}
                                >
                                  Editar, gerar prévia e cadastrar{' '}
                                  <ArrowRight />
                                </Button>
                              </div>
                            </article>
                          ),
                        )}
                      </div>
                    </section>
                    <p className="mt-3 text-xs text-slate-500">
                      Criada em{' '}
                      {new Date(item.createdAt).toLocaleString('pt-BR')} ·{' '}
                      {item.detectedQuestions} detectadas ·{' '}
                      {item.reviewedQuestions} revisadas
                    </p>
                  </div>
                )}
              </article>
            ))}
        </div>
      </section>
    </section>
  );
}
