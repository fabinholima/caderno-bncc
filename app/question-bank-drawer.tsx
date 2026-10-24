'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { questionBankSummary } from '@/lib/question-bank-summary.mjs';
import { QuestionStatusControl } from './question-status-control';
import {
  Eye,
  Pencil,
  FileOutput,
  BookOpenCheck,
  History,
  Tags,
  X,
} from 'lucide-react';

type BankQuestion = {
  id: string;
  code: string;
  status: string;
  subject: string;
  grade: string;
  revision?: number;
  skill?: string;
  knowledgeTopic?: string;
  sourceInstitution?: string;
  sourceYear?: number;
  difficulty?: string;
  statement: string;
};
type Detail = {
  statement: Array<{
    type: string;
    text?: string;
    code?: string;
    tex?: string;
    formula?: string;
  }>;
  explanation?: Array<unknown>;
  alternatives: Array<{
    stableKey: string;
    content: unknown[];
    isCorrect: boolean;
    position: number;
  }>;
  skills?: Array<{ code: string; description?: string }>;
  pedagogicalTopicId?: string;
  knowledgeTopic?: string;
  type: string;
};
export function QuestionBankDrawer({
  question,
  apiUrl,
  reviewer,
  canManage,
  canEdit,
  onClose,
  onEdit,
  onChanged,
}: {
  question: BankQuestion;
  apiUrl: string;
  reviewer: boolean;
  canManage: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState('preview');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [pdf, setPdf] = useState('');
  const [pdfMode, setPdfMode] = useState('');
  const alive = useRef(true);
  const url = useRef('');
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    apiFetch(`${apiUrl}/api/questions/${question.id}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const b = await r.json() as { data: Detail; error?: string };
        if (!r.ok) throw new Error(b.error || 'Falha ao carregar a questão.');
        if (alive.current) setDetail(b.data);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
      controller.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [apiUrl, question.id]);
  async function preview(mode: 'student' | 'answer-key') {
    if (!detail || compiling) return;
    setError('');
    setCompiling(true);
    try {
      const r = await apiFetch(`${apiUrl}/api/questions/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewMode: mode,
          type: detail.type,
          statement: detail.statement
            .map((n) => n.text || n.code || n.tex || n.formula || '')
            .join('\n'),
          statementBlocks: detail.statement,
          subject: question.subject,
          grade: question.grade,
          sourceInstitution: question.sourceInstitution,
          sourceYear: question.sourceYear,
          skill: question.skill || detail.skills?.[0]?.code || '',
          pedagogicalTopicId: detail.pedagogicalTopicId || '',
          knowledgeTopic: detail.knowledgeTopic || '',
          difficulty: question.difficulty,
          alternatives: detail.alternatives.map((a) => ({
            ...a,
            content: 'Conteúdo estruturado',
            contentBlocks: a.content,
          })),
          ...(detail.explanation?.length
            ? { answerBlocks: detail.explanation }
            : {}),
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error || 'Não foi possível compilar a prévia.');
      }
      const blob = await r.blob();
      if (!alive.current) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      setPdf(url.current);
      setPdfMode(mode);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'Falha na prévia.');
    } finally {
      if (alive.current) setCompiling(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-0 right-0 left-auto flex h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-3xl"
      >
        <header className="relative border-b bg-slate-50 px-6 py-5 pr-14">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar detalhes"
            className="absolute right-4 top-4"
            onClick={onClose}
          >
            <X />
          </Button>
          <p className="font-mono text-xs font-semibold text-blue-700">
            {question.code}
          </p>
          <DialogTitle className="mt-1 text-xl">
            Detalhes da questão
          </DialogTitle>
          <DialogDescription className="mt-1">
            {question.subject} · {question.grade} · {question.sourceInstitution}{' '}
            {question.sourceYear}
          </DialogDescription>
          <div className="mt-3 flex items-center justify-between">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-slate-200">
              {question.status}
            </span>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil /> Editar questão
              </Button>
            )}
          </div>
        </header>
        <nav
          aria-label="Detalhes da questão"
          className="flex gap-1 overflow-x-auto border-b px-4 py-3"
        >
          {[
            ['preview', 'Prévia', Eye],
            ['classification', 'Classificação', Tags],
            ['resolution', 'Resolução', BookOpenCheck],
            ['history', 'Histórico', History],
          ].map(([id, label, Icon]) => {
            const TabIcon = Icon as typeof Eye;
            return (
              <Button
                key={id as string}
                variant={tab === id ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={tab === id}
                onClick={() => setTab(id as string)}
              >
                <TabIcon />
                {label as string}
              </Button>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && (
            <p aria-live="polite" className="text-sm text-slate-500">
              Carregando questão…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mb-4 whitespace-pre-wrap rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          {tab === 'classification' && (
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Disciplina', question.subject],
                ['Série', question.grade],
                [
                  'Habilidade BNCC',
                  detail?.skills?.map((s) => s.code).join(', ') ||
                    question.skill ||
                    'Não vinculada',
                ],
                [
                  'Tópico',
                  detail?.knowledgeTopic ||
                    question.knowledgeTopic ||
                    'Não vinculado',
                ],
                ['Dificuldade', question.difficulty],
                [
                  'Origem',
                  `${question.sourceInstitution || ''} ${question.sourceYear || ''}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-4">
                  <dt className="text-xs font-semibold text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
              {detail?.skills?.map((s) => (
                <p
                  key={s.code}
                  className="text-sm text-slate-600 sm:col-span-2"
                >
                  {s.description}
                </p>
              ))}
            </dl>
          )}
          {tab === 'history' && (
            <section>
              <h3 className="mb-3 font-semibold">Situação e histórico</h3>
              <QuestionStatusControl
                apiUrl={apiUrl}
                question={question}
                reviewer={reviewer}
                canManage={canManage}
                defaultExpanded
                onChanged={onChanged}
              />
            </section>
          )}
          {(tab === 'preview' || tab === 'resolution') && (
            <section className="space-y-4">
              {tab === 'preview' && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {questionBankSummary(question.statement)}
                </p>
              )}
              {tab === 'resolution' &&
              !loading &&
              !detail?.explanation?.length ? (
                <p className="text-sm text-slate-500">
                  Esta questão ainda não tem resolução cadastrada.
                </p>
              ) : (
                <Button
                  disabled={!detail || compiling}
                  onClick={() =>
                    void preview(
                      tab === 'resolution' ? 'answer-key' : 'student',
                    )
                  }
                >
                  <FileOutput />
                  {compiling
                    ? 'Compilando…'
                    : tab === 'resolution'
                      ? 'Gerar gabarito comentado'
                      : 'Gerar prévia da questão'}
                </Button>
              )}
              <p className="text-xs text-slate-500">
                A prévia em PDF preserva a formatação ConTeXt e as ilustrações.
              </p>
              {pdf &&
                pdfMode ===
                  (tab === 'resolution' ? 'answer-key' : 'student') && (
                  <iframe
                    title={`PDF de ${tab === 'resolution' ? 'resolução' : 'questão'} ${question.code}`}
                    src={pdf}
                    className="h-[65vh] min-h-96 w-full rounded-xl border bg-white"
                  />
                )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
