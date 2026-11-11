export type SchoolClass = {
  id: string;
  name: string;
  grade: string;
  schoolYear: number;
  students: number;
  schoolId?: string | null;
  schoolName?: string | null;
};

export type AcademicPanel =
  | 'years'
  | 'classes'
  | 'students'
  | 'applications'
  | 'correction'
  | 'results';

export const studentStatuses = [
  ['ativo', 'Ativo'],
  ['transferido', 'Transferido'],
  ['remanejado', 'Remanejado'],
  ['atestado', 'Atestado'],
  ['regime_domiciliar', 'Regime domiciliar'],
] as const;

export type StudentStatus = (typeof studentStatuses)[number][0];

export type Student = {
  id: string;
  registration: string;
  name: string;
  access_code?: string;
  linkedAccountName?: string | null;
  linkedAccountEmail?: string | null;
  selfieDataUrl?: string;
  active: boolean;
  status: StudentStatus | null;
  adaptedExam: boolean;
  enrollments?: { classId: string; number: number | null }[];
};

export type Assessment = { id: string; title: string; grade: string };

export type Application = {
  id: string;
  title: string;
  className: string;
  students: number;
  completed: number;
  scheduledAt: string;
  status: string;
  classId?: string;
  corrected?: number;
};

export type Assignment = {
  id: string;
  studentName: string;
  registration: string;
  number?: number;
  versionCode: string;
  renderJobId: string;
  status: string;
};

export type ApplicationAssignment = Assignment & {
  renderStatus: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  downloads?: { prova: string; gabarito: string } | null;
};

export type ApplicationDetail = Application & {
  grade: string;
  schoolYear: number;
  canCancel: boolean;
  assignments: ApplicationAssignment[];
};

export type CardScan = {
  id: string;
  status: string;
  applicationId?: string | null;
  assessmentTitle?: string | null;
  className?: string | null;
  createdAt?: string;
  studentName?: string;
  versionCode?: string;
  submissionId?: string;
  score?: number | null;
  maxScore?: number | null;
  sourcePage?: number;
  sourcePages?: number;
  result?: {
    answers: Array<{
      questionNumber: number;
      selectedLabels: string[];
      status: string;
    }>;
  };
  error?: string;
  imageAvailable?: boolean;
};

export type ScanReviewCandidate = {
  id: string;
  studentName: string;
  registration: string;
  number?: number;
  versionCode: string;
  assessmentTitle: string;
  className: string;
  questions: Array<{
    number: number;
    type: string;
    labels: string[];
  }>;
};

export type ScanReview = {
  id: string;
  status: string;
  error?: string;
  applicationStudentId?: string;
  imageAvailable: boolean;
  detectedAnswers: Array<{
    questionNumber: number;
    selectedLabels: string[];
    status?: string;
  }>;
  candidates: ScanReviewCandidate[];
};

// Por que a leitura automática não teve certeza da questão.
export const DETECTION_DOUBTS: Record<string, string> = {
  uncertain: 'Marcação duvidosa',
  multiple: 'Mais de uma marcação detectada',
  blank: 'Nenhuma marcação detectada',
};

// Mesma divisão em colunas do cartão impresso: até 15 linhas por coluna,
// no máximo 6 colunas (Certo/Errado) ou 4 (A–E).
export function cardColumns<T extends { type: string }>(questions: T[]) {
  const maxColumns = questions.every(
    (question) => question.type === 'true_false',
  )
    ? 6
    : 4;
  const columns = Math.min(maxColumns, Math.ceil(questions.length / 15)) || 1;
  const rows = Math.ceil(questions.length / columns);
  return Array.from({ length: columns }, (_, index) =>
    questions.slice(index * rows, (index + 1) * rows),
  ).filter((column) => column.length);
}

export type ScanTab = 'review' | 'processing' | 'completed';

export function scanTabOf(scan: CardScan): ScanTab {
  if (scan.status === 'queued' || scan.status === 'processing')
    return 'processing';
  return scan.status === 'completed' ? 'completed' : 'review';
}

// Cartão com erro que não identificou o aluno: não gerou resultado.
// O administrador descarta qualquer cartão (exceto em leitura); se ele já
// gerou nota, a nota do aluno é zerada no servidor.
export const canDiscardScan = (
  scan: { status: string; studentName?: string },
  canPurge = false,
) =>
  canPurge
    ? !['discarded', 'processing'].includes(scan.status)
    : ['review', 'failed'].includes(scan.status) && !scan.studentName;

export const canReviewScan = (scan: CardScan) =>
  scanTabOf(scan) === 'review' && Boolean(scan.imageAvailable);

// Uma questão de múltiplas respostas pode ter várias bolhas marcadas.
export function readWithCertainty(
  status: string | undefined,
  questionType = '',
) {
  return (
    status === 'recognized' ||
    (status === 'multiple' && questionType === 'multiple_choice')
  );
}

export type ApiBody<T> = { data?: T; error?: string };

export type ApplicationReport = {
  application: {
    id: string;
    title: string;
    className: string;
    grade: string;
    schoolYear: number;
  };
  summary: {
    students: number;
    corrected: number;
    review: number;
    awaiting: number;
    averagePercentage: number;
    medianPercentage: number;
    standardDeviation: number;
  };
  students: Array<{
    id: string;
    name: string;
    number?: number;
    versionCode: string;
    status: 'corrected' | 'manual_review' | 'review' | 'awaiting';
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
  }>;
  skills: Array<{
    code: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
  competencies: Array<{
    sourceKey: string;
    number: number;
    description: string;
    area: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
  saebDescriptors: Array<{
    code: string;
    topic: string;
    correct: number;
    validAnswers: number;
    total: number;
    percentage: number;
    classification: string;
  }>;
  topics: Array<{
    code: string;
    topic: string;
    correct: number;
    validAnswers: number;
    total: number;
    percentage: number;
    classification: string;
  }>;
  priorities: Array<{
    dimension: string;
    code: string;
    label: string;
    correct: number;
    validAnswers: number;
    percentage: number;
    classification: string;
    priority: 'Alta' | 'Atenção';
  }>;
  questions: Array<{
    questionNumber: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    total: number;
    validAnswers: number;
    percentage: number;
    classification: string;
    selectedDistribution: Record<string, number>;
    discriminationIndex: number | null;
    discriminationClassification: string;
    discriminationSampleSize: number;
    needsReview: boolean;
    reviewReasons: string[];
    dominantDistractor: string | null;
  }>;
};

export type StudentApplicationReport = {
  application: ApplicationReport['application'];
  student: {
    id: string;
    name: string;
    registration: string;
    number?: number;
    versionCode: string;
    selfieDataUrl?: string | null;
  };
  summary: {
    score: number;
    maxScore: number;
    percentage: number;
    classAveragePercentage: number;
    differenceFromClass: number;
    correct: number;
    incorrect: number;
    unanswered: number;
  };
  skills: ApplicationReport['skills'];
  competencies: ApplicationReport['competencies'];
  saebDescriptors: ApplicationReport['saebDescriptors'];
  topics: ApplicationReport['topics'];
  priorities: ApplicationReport['priorities'];
  questions: Array<{
    questionNumber: number;
    status: 'correct' | 'incorrect' | 'unanswered';
    selectedLabels: string[];
    correctLabels: string[];
    skills: Array<{ code: string }>;
    saebDescriptors: Array<{ code: string }>;
    knowledgeTopic: string;
  }>;
};

export type StudentProgress = {
  student: Student;
  summary: {
    assessments: number;
    averagePercentage: number;
    bestPercentage: number;
    currentPercentage: number;
    trend: number;
  };
  timeline: Array<{
    applicationId: string;
    title: string;
    className: string;
    scheduledAt: string;
    score: number;
    maxScore: number;
    percentage: number;
    change: number | null;
  }>;
  skills: Array<{
    code: string;
    correct: number;
    total: number;
    assessments: number;
    percentage: number;
    classification: string;
  }>;
  competencies: Array<{
    sourceKey: string;
    code: string;
    number: number;
    description: string;
    area: string;
    percentage: number;
    assessments: number;
  }>;
  saebDescriptors: Array<{
    code: string;
    topic: string;
    correct: number;
    validAnswers: number;
    assessments: number;
    percentage: number;
    classification: string;
  }>;
  topics: Array<{
    code: string;
    topic: string;
    correct: number;
    validAnswers: number;
    assessments: number;
    percentage: number;
    classification: string;
  }>;
};
