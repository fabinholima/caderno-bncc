import { CONTEXT_PASTE_MARKER } from '@/lib/pasted-exam.mjs';
import { parsePastedQuestion } from '../question-paste-importer';
import type { RichContentBlock } from '../rich-content-editor';

// Rótulo visível acima de cada campo (o texto de exemplo some ao digitar).
export const fieldLabel = 'grid gap-1.5 text-sm font-semibold text-slate-700';

export type ExamImport = {
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

export type AiReviewField =
  | 'rawText'
  | 'questionType'
  | 'pedagogicalDisciplineId'
  | 'grade'
  | 'difficulty'
  | 'correctAnswers'
  | 'skill'
  | 'pedagogicalTopicId';

/** Texto-base comum a vários itens C/E, como a IA o devolve. */
export type CandidateSharedText = {
  title: string;
  source: string;
  content: string;
  sourceNumbers: number[];
  keepLineBreaks?: boolean;
  lineNumbering?: boolean;
};

export type ExamImportCandidate = {
  resetAi?: boolean;
  sharedText?: CandidateSharedText | null;
  sharedTextId?: string | null;
  id: string;
  sourceNumber: number;
  rawText: string;
  resolution?: string;
  adoteNote?: string;
  editorialReviewed?: boolean;
  selected: boolean;
  questionType: 'single_choice' | 'multiple_choice' | 'true_false' | 'essay';
  status: 'complete' | 'review' | 'completed' | 'duplicate' | 'ignored';
  pageNumber?: number;
  extractionMethod?: 'text' | 'ocr' | 'gemini-pdf' | 'pasted-text';
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
  registeredQuestionId?: string;
  registeredQuestionCode?: string;
  registeredAt?: string;
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
    sharedText?: CandidateSharedText | null;
    model: string;
    promptVersion: string;
    provider?: string;
  };
  aiReview?: {
    acceptedFields: AiReviewField[];
    rejectedFields: AiReviewField[];
    reviewedAt?: string;
    reviewedBy?: string | null;
    history?: Array<{
      acceptedFields: AiReviewField[];
      rejectedFields: AiReviewField[];
      reviewedAt: string;
      reviewedBy?: string | null;
    }>;
  };
};

export type PdfPreview = {
  name: string;
  size: number;
  url: string;
};

export type StoredPdfPreview = {
  importId: string;
  documentId: string;
  title: string;
  name: string;
  size: number;
};

export type BulkSettings = {
  grade: string;
  difficulty: 'Fácil' | 'Média' | 'Difícil';
  skill: string;
  pedagogicalDisciplineId: string;
  objectId: string;
  topicId: string;
  detailId: string;
};

export type ReviewFilters = {
  query: string;
  status: string;
  questionType: string;
  institution: string;
  grade: string;
  topicId: string;
};

export type PedagogicalDiscipline = {
  id: string;
  name: string;
  stage: string;
  skills?: Array<{ id: string; code: string; description: string }>;
};

export function orderedHighSchoolDisciplines(
  disciplines: PedagogicalDiscipline[],
) {
  return disciplines
    .filter((discipline) => discipline.stage === 'Ensino Médio')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export type PedagogicalTopic = {
  id: string;
  name: string;
  discipline_id: string;
  parent_id: string | null;
  grade_range: string;
  depth: number;
  path: string;
  skills?: Array<{ id: string; code: string; description: string }>;
};

export type DuplicateQuestion = {
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

export type ImportedQuestionFields = {
  preserveContext?: boolean;
  statement: string;
  alternatives: Record<'A' | 'B' | 'C' | 'D' | 'E', string>;
};

export const alternativeLetters = ['A', 'B', 'C', 'D', 'E'] as const;

export function editableTextFromBlocks(blocks: RichContentBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === 'contextRaw') return block.code;
      if (block.type === 'paragraph') return block.text;
      if (block.type === 'contextFormula')
        return `\\startformula\n${block.code}\n\\stopformula`;
      if (block.type === 'contextInline') return block.code;
      if (block.type === 'romanList')
        return `\\startitemize[I]\n${block.items.map((item) => `\\item ${item}`).join('\n')}\n\\stopitemize`;
      if (block.type === 'math')
        return block.display
          ? `\\startformula\n${block.tex}\n\\stopformula`
          : `\\m{${block.tex}}`;
      if (block.type === 'chemical') return `\\chemical{${block.formula}}`;
      if (block.type === 'thermochemicalEquation') return block.equation;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export function splitImportedQuestion(
  rawText: string,
  judgment = false,
): ImportedQuestionFields {
  const parsed = parsePastedQuestion(rawText);
  return {
    preserveContext: rawText.startsWith(CONTEXT_PASTE_MARKER),
    statement: editableTextFromBlocks(parsed.statementBlocks),
    alternatives: Object.fromEntries(
      alternativeLetters.map((letter) => [
        letter,
        editableTextFromBlocks(
          judgment ? [] : parsed.alternatives[letter] || [],
        ),
      ]),
    ) as ImportedQuestionFields['alternatives'],
  };
}

export function joinImportedQuestion(
  fields: ImportedQuestionFields,
  judgment = false,
) {
  return [
    ...(fields.preserveContext ? [CONTEXT_PASTE_MARKER] : []),
    fields.statement.trim(),
    ...(judgment
      ? []
      : alternativeLetters.map((letter) =>
          fields.preserveContext && !fields.alternatives[letter].trim()
            ? ''
            : `${letter}) ${fields.alternatives[letter].trim()}`,
        )),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const defaultBulkSettings: BulkSettings = {
  grade: '',
  difficulty: 'Média',
  skill: '',
  pedagogicalDisciplineId: '',
  objectId: '',
  topicId: '',
  detailId: '',
};

export function candidateReadiness(candidate: ExamImportCandidate) {
  const reasons: string[] = [];
  if (!candidate.selected) reasons.push('não selecionada');
  if (candidate.status === 'completed') reasons.push('já cadastrada');
  if (candidate.status === 'duplicate') reasons.push('questão duplicada');
  if (candidate.status === 'ignored') reasons.push('questão ignorada');
  if (
    candidate.aiSuggestion &&
    !(
      candidate.aiReview?.acceptedFields.includes('rawText') ||
      candidate.aiReview?.rejectedFields.includes('rawText')
    )
  )
    reasons.push('conversão da IA exige revisão individual');
  if (
    candidate.extractionMethod === 'pasted-text' &&
    !candidate.editorialReviewed
  )
    reasons.push('confirme a revisão desta questão');
  if (
    candidate.questionType === 'essay' &&
    candidate.extractionMethod !== 'pasted-text'
  )
    reasons.push('discursiva exige revisão individual');
  const labels = Object.keys(
    parsePastedQuestion(candidate.rawText).alternatives,
  )
    .sort()
    .join('');
  if (
    (candidate.questionType === 'single_choice' ||
      candidate.questionType === 'multiple_choice') &&
    labels !== 'ABCDE'
  )
    reasons.push('alternativas A–E incompletas');
  if (
    candidate.questionType !== 'essay' &&
    candidate.answerStatus !== 'confirmed'
  )
    reasons.push('gabarito não confirmado');
  if (candidate.questionType === 'essay' && !candidate.resolution?.trim())
    reasons.push('informe a resolução ou resposta esperada');
  const answerCount = candidate.correctAnswers?.length || 0;
  if (candidate.questionType === 'single_choice' && answerCount !== 1)
    reasons.push('selecione uma resposta correta');
  if (candidate.questionType === 'multiple_choice' && answerCount < 2)
    reasons.push('selecione pelo menos duas respostas corretas');
  if (candidate.questionType === 'true_false' && answerCount !== 1)
    reasons.push('selecione Certo ou Errado como gabarito');
  return { ready: reasons.length === 0, reasons };
}

export function candidateEditorialChecks(candidate: ExamImportCandidate) {
  const parsed = parsePastedQuestion(candidate.rawText);
  const labels = Object.keys(parsed.alternatives).sort().join('');
  const bracesBalanced =
    (candidate.rawText.match(/\{/g)?.length || 0) ===
    (candidate.rawText.match(/\}/g)?.length || 0);
  return [
    {
      label:
        candidate.questionType === 'essay'
          ? 'Discursiva'
          : candidate.questionType === 'true_false'
            ? 'Afirmação C/E'
            : 'Alternativas A–E',
      ok:
        candidate.questionType === 'essay' ||
        candidate.questionType === 'true_false' ||
        labels === 'ABCDE',
    },
    {
      label:
        candidate.questionType === 'essay'
          ? 'Correção individual'
          : candidate.questionType === 'true_false'
            ? 'Gabarito C/E'
            : 'Gabarito',
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

export function candidateMatchesReviewFilters(
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

export function blockPlainText(block: RichContentBlock) {
  if (block.type === 'paragraph' || block.type === 'adoteNote')
    return block.text;
  if (block.type === 'romanList') return block.items.join(' ');
  if (
    block.type === 'contextFormula' ||
    block.type === 'contextInline' ||
    block.type === 'contextRaw' ||
    block.type === 'metapost'
  )
    return block.code;
  if (block.type === 'math') return block.tex;
  if (block.type === 'chemical') return block.formula;
  if (block.type === 'thermochemicalEquation') return block.equation;
  if (block.type === 'chemicalStructure')
    return block.caption || block.smiles || 'Estrutura química';
  return block.alt || block.caption || 'Imagem da questão';
}

export const statusLabels: Record<string, string> = {
  uploaded: 'Documentos recebidos',
  queued: 'Na fila',
  extracting: 'Extraindo',
  extracted: 'Extração concluída',
  needs_review: 'Aguardando revisão',
  completed: 'Importação concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

export const rightsLabels: Record<string, string> = {
  pending_review: 'Direitos pendentes',
  authorized: 'Uso autorizado',
  public_license: 'Licença pública',
  citation_only: 'Somente citação',
  restricted: 'Uso interno',
  blocked: 'Uso bloqueado',
};

export const questionTypeLabels: Record<
  ExamImportCandidate['questionType'],
  string
> = {
  single_choice: 'Múltipla escolha · uma resposta',
  multiple_choice: 'Múltipla escolha · várias respostas',
  true_false: 'Certo ou errado · uma afirmação',
  essay: 'Discursiva',
};

export function summarizeAiText(value?: string | null) {
  if (!value) return 'Não informado';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 217)}...`
    : normalized;
}

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Não foi possível ler o PDF.'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
