// Situações de uma produção de redação (essay_application_students.status).
export type EssayEntryStatus =
  | 'pending'
  | 'draft'
  | 'submitted'
  | 'awaiting_ocr'
  | 'awaiting_ai'
  | 'awaiting_grading'
  | 'grading'
  | 'awaiting_approval'
  | 'published'
  | 'returned'
  | 'absent';

export const essayStatusLabels: Record<EssayEntryStatus, string> = {
  pending: 'Aguardando entrega',
  draft: 'Rascunho',
  submitted: 'Enviada',
  awaiting_ocr: 'Aguardando OCR',
  awaiting_ai: 'Aguardando IA',
  awaiting_grading: 'Aguardando correção',
  grading: 'Em correção',
  awaiting_approval: 'Aguardando aprovação',
  published: 'Publicada',
  returned: 'Devolvida para revisão',
  absent: 'Ausente',
};

export const essayStatusTone: Record<EssayEntryStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-sky-100 text-sky-800',
  awaiting_ocr: 'bg-violet-100 text-violet-800',
  awaiting_ai: 'bg-violet-100 text-violet-800',
  awaiting_grading: 'bg-amber-100 text-amber-900',
  grading: 'bg-amber-100 text-amber-900',
  awaiting_approval: 'bg-indigo-100 text-indigo-800',
  published: 'bg-emerald-100 text-emerald-800',
  returned: 'bg-rose-100 text-rose-800',
  absent: 'bg-slate-200 text-slate-600',
};

export const essayModeLabels: Record<string, string> = {
  typed: 'Texto digitado',
  upload: 'Foto ou PDF do aluno',
  teacher_scan: 'Digitalizada pelo professor',
};
