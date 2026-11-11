'use client';

// Correção de redações (professor): fila de produções, tela de correção em
// três áreas (redação, competências e resumo) e painel de indicadores.
// A nota oficial é calculada e validada no servidor; a IA só sugere.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  essayModeLabels,
  essayStatusLabels,
  essayStatusTone,
  type EssayEntryStatus,
} from '@/lib/essay-status';
import { prepareEssayFile } from '@/lib/essay-upload';
import { EssayScanUpload } from '@/app/essay-scans';

// ---------- Tipos ----------

type Level = { score: number; descriptor: string };
type Option = { id: string; label: string; tone?: string };
type Observation = {
  id: string;
  label: string;
  tone?: string;
  options?: Option[];
};
type Criterion = {
  id: string;
  numeral: string;
  title: string;
  maxScore: number;
  levels: Level[];
  observations: Observation[];
};
type Rubric = {
  id: string;
  name: string;
  maxScore: number;
  criteria: Criterion[];
  annulmentReasons: Array<{ id: string; label: string }>;
};
type Score = {
  criterionId: string;
  score: number | null;
  observations: Record<string, true | string>;
  note: string;
  evidence: string[];
  feedback: string;
  justification?: string;
  problems?: string[];
  suggestions?: string[];
};
type Grading = {
  id: string;
  kind: 'ai' | 'teacher';
  status: string;
  scores: Score[];
  annulmentReason: string;
  total: number | null;
  maxScore: number;
  comments: string;
  strengths: string;
  improvements: string;
  rewriteSuggestions: string;
  basedOnGradingId: string | null;
  provider: string;
  model: string;
  warnings: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  finalizedAt: string | null;
  finalizedByName: string | null;
};
type Transcription = {
  id: string;
  version: number;
  source: 'ai' | 'teacher';
  text: string;
  confidence: number | null;
  needsReview: boolean;
  warnings: string[];
  createdAt: string;
  createdByName: string | null;
};
type EssayFile = {
  id: string;
  position: number;
  mimeType: string;
  byteSize: number;
};
type Entry = {
  id: string;
  applicationId: string;
  status: EssayEntryStatus;
  student: {
    id: string;
    name: string;
    number: number | null;
    registration: string;
  };
  className: string;
  schoolYear: number;
  yearLocked: boolean;
  dueAt: string | null;
  submissionModes: string[];
  aiAssist: boolean;
  aiAvailable: boolean;
  prompt: {
    title: string;
    theme: string;
    productionCommand: string;
    minLines: number;
    maxLines: number;
  };
  rubric: Rubric;
  submission: null | {
    id: string;
    attempt: number;
    mode: 'typed' | 'upload' | 'teacher_scan';
    typedText: string;
    wordCount: number;
    lineCount: number;
    status: 'draft' | 'submitted' | 'returned';
    returnReason: string;
    submittedAt: string | null;
    files: EssayFile[];
  };
  attempts: Array<{
    id: string;
    attempt: number;
    mode: string;
    status: string;
    returnReason: string;
    submittedAt: string | null;
  }>;
  transcriptions: Transcription[];
  aiGrading: Grading | null;
  teacherGrading: Grading | null;
  gradingHistory: Grading[];
  jobs: Array<{
    id: string;
    kind: 'ocr' | 'ai_grading';
    status: string;
    attempts: number;
    maxAttempts: number;
    error: string;
  }>;
  publication: { publishedAt: string | null };
  history: Array<{
    action: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    userName: string | null;
  }>;
};
type QueueItem = {
  id: string;
  status: EssayEntryStatus;
  studentName: string;
  studentNumber: number | null;
  applicationId: string;
  promptTitle: string;
  className: string;
  mode: string | null;
  attempt: number | null;
  submittedAt: string | null;
  teacherTotal: number | null;
  aiTotal: number | null;
  maxScore: number | null;
};
type QueuePage = {
  items: QueueItem[];
  page: number;
  pages: number;
  total: number;
};
type Option2 = { id: string; label: string };
type Dashboard = {
  byStatus: Record<EssayEntryStatus, number>;
  students: number;
  received: number;
  toGrade: number;
  awaitingApproval: number;
  published: number;
  returned: number;
  averageTotal: number | null;
  minTotal: number | null;
  maxTotal: number | null;
  criteriaAverages: Array<{ criterionId: string; average: number }>;
  options: {
    classes: Option2[];
    teachers: Option2[];
    prompts: Option2[];
    schools: Option2[];
    years: Option2[];
  };
};

const fieldClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange)]/30 disabled:bg-slate-100 disabled:text-slate-500';

const formatDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

const actionLabels: Record<string, string> = {
  'essay.submit': 'Enviada pelo aluno',
  'essay.scan.upload': 'Página digitalizada enviada',
  'essay.scan.receive': 'Recebimento registrado pelo professor',
  'essay.absent': 'Marcada como ausência',
  'essay.absent.undo': 'Ausência desfeita',
  'essay.transcription.save': 'Transcrição revisada',
  'essay.ocr.request': 'OCR solicitado',
  'essay.ai.request': 'Sugestão da IA solicitada',
  'essay.grading.save': 'Correção salva (rascunho)',
  'essay.grading.finalize': 'Correção finalizada',
  'essay.grading.reopen': 'Correção reaberta',
  'essay.publish': 'Nota publicada',
  'essay.unpublish': 'Publicação desfeita para revisão',
  'essay.return': 'Devolvida ao aluno para revisão',
};

function useApi(apiUrl: string) {
  return useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await apiFetch(`${apiUrl}/api/${path}`, {
        ...init,
        headers: init?.body
          ? { 'content-type': 'application/json' }
          : undefined,
      });
      const body = (await response.json().catch(() => ({}))) as {
        data: T;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível concluir a operação.');
      return body.data;
    },
    [apiUrl],
  );
}

function StatusBadge({ status }: { status: EssayEntryStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${essayStatusTone[status]}`}
    >
      {essayStatusLabels[status]}
    </span>
  );
}

function Notice({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: 'error' | 'success' | 'info';
}) {
  if (!message) return null;
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  };
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {message}
    </p>
  );
}

function Header({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">
        Redação
      </p>
      <h1 className="font-display mt-1 text-3xl font-bold text-[var(--navy)]">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p>
    </header>
  );
}

// ---------- Fila de correção ----------

export function EssayGradingQueue({
  apiUrl,
  applicationId = '',
  initialStatus = '',
}: {
  apiUrl: string;
  applicationId?: string;
  initialStatus?: string;
}) {
  const request = useApi(apiUrl);
  const [openId, setOpenId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [filters, setFilters] = useState({
    applicationId,
    status: initialStatus,
    q: '',
    page: 1,
  });
  const [data, setData] = useState<QueuePage | null>(null);
  const [applications, setApplications] = useState<
    Array<{
      id: string;
      promptTitle: string;
      className: string;
      classGrade: string;
      appliedOn: string;
    }>
  >([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== '' && value !== 1)
          .map(([key, value]) => [key, String(value)]),
      );
      setData(await request<QueuePage>(`essay-entries?${params}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters, request]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    request<typeof applications>('essay-applications')
      .then(setApplications)
      .catch(() => undefined);
  }, [request]);
  const ids = data?.items.map((item) => item.id) || [];
  if (openId)
    return (
      <EssayGradingScreen
        key={openId}
        apiUrl={apiUrl}
        entryId={openId}
        onBack={() => {
          setOpenId('');
          void load();
        }}
        onPrevious={
          ids.indexOf(openId) > 0
            ? () => setOpenId(ids[ids.indexOf(openId) - 1])
            : undefined
        }
        onNext={
          ids.indexOf(openId) >= 0 && ids.indexOf(openId) < ids.length - 1
            ? () => setOpenId(ids[ids.indexOf(openId) + 1])
            : undefined
        }
      />
    );
  if (scanning && filters.applicationId)
    return (
      <EssayScanUpload
        apiUrl={apiUrl}
        applicationId={filters.applicationId}
        onBack={() => {
          setScanning(false);
          void load();
        }}
        onGrade={() => {
          setScanning(false);
          setFilters({ ...filters, status: '', page: 1 });
        }}
      />
    );
  return (
    <div>
      <Header
        title="Corrigir redações"
        description="Produções recebidas das suas turmas. Abra uma redação para corrigir por competência; a sugestão da IA (quando ligada) aparece ao lado e só vale depois da sua revisão."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Upload className="size-5 shrink-0" />
        <p className="min-w-0 flex-1">
          <strong>Redações em papel:</strong>{' '}
          {filters.applicationId
            ? 'envie o PDF da turma escaneada: o QR de cada folha identifica o aluno. Para um aluno só, abra-o na lista.'
            : 'escolha a aplicação no filtro abaixo para enviar o PDF da turma escaneada; o QR de cada folha identifica o aluno.'}
        </p>
        {filters.applicationId && (
          <Button size="sm" onClick={() => setScanning(true)}>
            <Upload /> Enviar folhas escaneadas
          </Button>
        )}
        <Button
          size="sm"
          variant={filters.status === 'pending' ? 'default' : 'outline'}
          onClick={() =>
            setFilters({
              ...filters,
              status: filters.status === 'pending' ? '' : 'pending',
              page: 1,
            })
          }
        >
          {filters.status === 'pending'
            ? 'Mostrar todas'
            : 'Ver quem falta entregar'}
        </Button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          aria-label="Aplicação"
          className={fieldClass}
          value={filters.applicationId}
          onChange={(event) =>
            setFilters({
              ...filters,
              applicationId: event.target.value,
              page: 1,
            })
          }
        >
          <option value="">Todas as aplicações</option>
          {applications.map((item) => (
            <option key={item.id} value={item.id}>
              {item.promptTitle} — {item.classGrade} {item.className}
            </option>
          ))}
        </select>
        <select
          aria-label="Situação"
          className={fieldClass}
          value={filters.status}
          onChange={(event) =>
            setFilters({ ...filters, status: event.target.value, page: 1 })
          }
        >
          <option value="">Todas as situações</option>
          {Object.entries(essayStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <Input
            aria-label="Buscar aluno"
            placeholder="Buscar aluno"
            className="h-9 pl-9"
            value={filters.q}
            maxLength={120}
            onChange={(event) =>
              setFilters({ ...filters, q: event.target.value, page: 1 })
            }
          />
        </div>
      </div>
      <Notice message={error} />
      {loading && !data ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !data?.items.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma produção encontrada com esses filtros.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--navy)]">
                      {item.studentNumber ? `${item.studentNumber}. ` : ''}
                      {item.studentName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {item.promptTitle} · {item.className}
                      {item.mode ? ` · ${essayModeLabels[item.mode]}` : ''}
                      {item.attempt && item.attempt > 1
                        ? ` · ${item.attempt}ª versão`
                        : ''}
                      {item.submittedAt
                        ? ` · enviada ${formatDateTime(item.submittedAt)}`
                        : ''}
                    </span>
                  </span>
                  {item.aiTotal !== null && (
                    <span className="inline-flex items-center gap-1 text-xs text-violet-700">
                      <Bot className="size-3.5" /> IA {item.aiTotal}
                    </span>
                  )}
                  {item.teacherTotal !== null && (
                    <span className="text-sm font-bold text-[var(--navy)]">
                      {item.teacherTotal}
                      <span className="text-xs font-normal text-slate-500">
                        /{item.maxScore}
                      </span>
                    </span>
                  )}
                  {item.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                      <Upload className="size-3.5" /> Enviar escaneada
                    </span>
                  )}
                  <StatusBadge status={item.status} />
                </button>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Paginação"
            className="mt-4 flex items-center justify-between text-sm text-slate-600"
          >
            <span>
              {data.total} produção(ões) · página {data.page} de {data.pages}
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => setFilters({ ...filters, page: data.page - 1 })}
              >
                <ChevronLeft /> Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.page >= data.pages}
                onClick={() => setFilters({ ...filters, page: data.page + 1 })}
              >
                Próxima <ChevronRight />
              </Button>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}

// ---------- Área A: redação ----------

function FileViewer({ apiUrl, files }: { apiUrl: string; files: EssayFile[] }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const current = files[Math.min(page, files.length - 1)];
  const loaded = current ? urls[current.id] : '';
  useEffect(() => {
    if (!current || loaded) return;
    let active = true;
    apiFetch(`${apiUrl}/api/essay-files/${current.id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível abrir a página.');
        const url = URL.createObjectURL(await response.blob());
        if (active) setUrls((items) => ({ ...items, [current.id]: url }));
        else URL.revokeObjectURL(url);
      })
      .catch(
        (e) => active && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      active = false;
    };
  }, [apiUrl, current, loaded]);
  const urlsRef = useRef(urls);
  useEffect(() => {
    urlsRef.current = urls;
  }, [urls]);
  useEffect(
    () => () => {
      for (const url of Object.values(urlsRef.current))
        URL.revokeObjectURL(url);
    },
    [],
  );
  if (!files.length)
    return <p className="text-sm text-slate-500">Nenhuma página enviada.</p>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Página anterior"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span>
          Página {page + 1} de {files.length}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Próxima página"
          disabled={page >= files.length - 1}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </Button>
        {current?.mimeType !== 'application/pdf' && (
          <span className="ml-auto flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Diminuir zoom"
              disabled={zoom <= 0.5}
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              <ZoomOut />
            </Button>
            <span className="w-12 text-center text-xs">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Aumentar zoom"
              disabled={zoom >= 3}
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            >
              <ZoomIn />
            </Button>
          </span>
        )}
      </div>
      <Notice message={error} />
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100">
        {!loaded ? (
          <p className="p-6 text-sm text-slate-500">Carregando página…</p>
        ) : current.mimeType === 'application/pdf' ? (
          <iframe
            title={`Página ${page + 1}`}
            src={loaded}
            className="h-[75vh] w-full"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={loaded}
            alt={`Redação, página ${page + 1}`}
            style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
            className="block"
          />
        )}
      </div>
    </div>
  );
}

function NumberedText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <ol className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-white p-3 font-serif text-[15px] leading-7">
      {lines.map((line, index) => (
        <li key={index} className="flex gap-3">
          <span className="w-6 shrink-0 text-right font-sans text-xs leading-7 text-slate-400 select-none">
            {index + 1}
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words">
            {line || ' '}
          </span>
        </li>
      ))}
    </ol>
  );
}

function EssayArea({
  apiUrl,
  entry,
  editable,
  run,
}: {
  apiUrl: string;
  entry: Entry;
  editable: boolean;
  run: (action: () => Promise<Entry>, success?: string) => Promise<void>;
}) {
  const request = useApi(apiUrl);
  const submission = entry.submission;
  const transcription = entry.transcriptions[0] || null;
  const handwritten = submission && submission.mode !== 'typed';
  const [tab, setTab] = useState<'original' | 'text'>(
    handwritten ? 'original' : 'text',
  );
  const [draft, setDraft] = useState(transcription?.text || '');
  const [editing, setEditing] = useState(false);
  const ocrJob = entry.jobs.find((job) => job.kind === 'ocr');
  if (!submission || submission.status !== 'submitted')
    return <ScanReceiver apiUrl={apiUrl} entry={entry} run={run} />;
  return (
    <div>
      {handwritten && (
        <div
          role="tablist"
          className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm"
        >
          {(
            [
              ['original', 'Original'],
              ['text', 'Transcrição'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex-1 rounded-md px-3 py-1.5 font-semibold ${tab === value ? 'bg-white text-[var(--navy)] shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {handwritten && tab === 'original' ? (
        <FileViewer apiUrl={apiUrl} files={submission.files} />
      ) : !handwritten ? (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {submission.wordCount} palavras · cerca de {submission.lineCount}{' '}
            linhas (limite {entry.prompt.minLines}–{entry.prompt.maxLines})
          </p>
          <NumberedText text={submission.typedText} />
        </>
      ) : (
        <div className="space-y-3">
          {transcription ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Versão {transcription.version} ·{' '}
              {transcription.source === 'ai'
                ? `reconhecida automaticamente${transcription.confidence !== null ? ` (confiança ${Math.round(transcription.confidence * 100)}%)` : ''}`
                : `revisada por ${transcription.createdByName || 'professor(a)'}`}{' '}
              · {formatDateTime(transcription.createdAt)}
              {transcription.needsReview && (
                <p className="mt-2 font-semibold text-amber-800">
                  Confiança baixa: revise o texto antes de usar a IA. A correção
                  automática fica bloqueada até a revisão.
                </p>
              )}
              {transcription.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-amber-800">
                  {transcription.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <Notice
              tone="info"
              message={
                ocrJob && ['queued', 'running'].includes(ocrJob.status)
                  ? 'O texto está sendo reconhecido. Você já pode corrigir pela imagem original.'
                  : 'Ainda não há transcrição. Corrija pela imagem, digite a transcrição ou peça o reconhecimento automático.'
              }
            />
          )}
          {ocrJob?.status === 'failed' && (
            <Notice message={`O reconhecimento falhou: ${ocrJob.error}`} />
          )}
          {editing ? (
            <>
              <Textarea
                aria-label="Transcrição"
                value={draft}
                maxLength={20000}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-96 font-serif text-[15px] leading-7"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={() =>
                    run(
                      () =>
                        request<Entry>(
                          `essay-entries/${entry.id}/transcription`,
                          {
                            method: 'PUT',
                            body: JSON.stringify({ text: draft }),
                          },
                        ),
                      'Transcrição salva.',
                    ).then(() => setEditing(false))
                  }
                >
                  <Save /> Salvar transcrição
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <>
              {transcription && <NumberedText text={transcription.text} />}
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft(transcription?.text || '');
                      setEditing(true);
                    }}
                  >
                    {transcription
                      ? 'Revisar transcrição'
                      : 'Digitar transcrição'}
                  </Button>
                  {entry.aiAvailable && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        ocrJob
                          ? ['queued', 'running'].includes(ocrJob.status)
                          : false
                      }
                      onClick={() =>
                        run(
                          () =>
                            request<Entry>(`essay-entries/${entry.id}/ocr`, {
                              method: 'POST',
                            }),
                          'Reconhecimento solicitado. Atualize em alguns instantes.',
                        )
                      }
                    >
                      <FileText /> Reconhecer texto (OCR)
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Sem produção recebida: o professor digitaliza a folha em papel. */
function ScanReceiver({
  apiUrl,
  entry,
  run,
}: {
  apiUrl: string;
  entry: Entry;
  run: (action: () => Promise<Entry>, success?: string) => Promise<void>;
}) {
  const request = useApi(apiUrl);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scanDraft =
    entry.submission?.status === 'draft' &&
    entry.submission.mode === 'teacher_scan'
      ? entry.submission
      : null;
  const studentDraft =
    entry.submission?.status === 'draft' &&
    entry.submission.mode !== 'teacher_scan';
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await prepareEssayFile(file);
        await request(`essay-entries/${entry.id}/files`, {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        });
      }
      await run(() => request<Entry>(`essay-entries/${entry.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  if (entry.yearLocked)
    return <p className="text-sm text-slate-500">Nenhuma produção recebida.</p>;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        {entry.status === 'absent'
          ? 'Aluno marcado como ausente.'
          : entry.status === 'returned'
            ? `Produção devolvida ao aluno: ${entry.submission?.returnReason}`
            : studentDraft
              ? 'O aluno está com um rascunho em andamento no portal.'
              : 'Nenhuma produção recebida ainda.'}
      </p>
      {!studentDraft && entry.status !== 'absent' && (
        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <p className="font-semibold text-[var(--navy)]">
            Digitalizar folha em papel
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Fotos ou PDF da folha deste aluno (até 10 páginas, 8 MB cada).
          </p>
          <Notice message={error} />
          {scanDraft && scanDraft.files.length > 0 && (
            <ul className="my-3 space-y-1 text-xs">
              {scanDraft.files.map((file) => (
                <li key={file.id} className="flex items-center gap-2">
                  Página {file.position} · {Math.round(file.byteSize / 1024)} KB
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      run(async () => {
                        await request(
                          `essay-entries/${entry.id}/files/${file.id}`,
                          {
                            method: 'DELETE',
                          },
                        );
                        return request<Entry>(`essay-entries/${entry.id}`);
                      })
                    }
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            onChange={(event) => upload(event.target.files)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload /> {busy ? 'Enviando…' : 'Adicionar páginas'}
            </Button>
            {scanDraft && scanDraft.files.length > 0 && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      request<Entry>(`essay-entries/${entry.id}/receive`, {
                        method: 'POST',
                      }),
                    'Recebimento registrado.',
                  )
                }
              >
                <CheckCircle2 /> Registrar recebimento
              </Button>
            )}
          </div>
        </div>
      )}
      {['pending', 'draft', 'absent'].includes(entry.status) && !scanDraft && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            run(() =>
              request<Entry>(`essay-entries/${entry.id}/absent`, {
                method: 'POST',
                body: JSON.stringify({ absent: entry.status !== 'absent' }),
              }),
            )
          }
        >
          {entry.status === 'absent' ? 'Desfazer ausência' : 'Marcar ausência'}
        </Button>
      )}
    </div>
  );
}

// ---------- Áreas B e C: correção ----------

type Form = {
  scores: Score[];
  annulmentReason: string;
  comments: string;
  strengths: string;
  improvements: string;
  rewriteSuggestions: string;
  basedOnGradingId: string | null;
};

function emptyScore(criterionId: string): Score {
  return {
    criterionId,
    score: null,
    observations: {},
    note: '',
    evidence: [],
    feedback: '',
  };
}

function formFrom(
  rubric: Rubric,
  grading: Grading | null,
  fromAi = false,
): Form {
  return {
    scores: rubric.criteria.map((criterion) => {
      const score = grading?.scores.find(
        (item) => item.criterionId === criterion.id,
      );
      if (!score) return emptyScore(criterion.id);
      return {
        criterionId: criterion.id,
        score: score.score,
        observations: fromAi ? {} : score.observations || {},
        note: fromAi ? '' : score.note || '',
        evidence: score.evidence || [],
        feedback: score.feedback || '',
      };
    }),
    annulmentReason: fromAi ? '' : grading?.annulmentReason || '',
    comments: grading?.comments || '',
    strengths: grading?.strengths || '',
    improvements: grading?.improvements || '',
    rewriteSuggestions: grading?.rewriteSuggestions || '',
    basedOnGradingId: fromAi
      ? grading?.id || null
      : grading?.basedOnGradingId || null,
  };
}

function CriterionCard({
  criterion,
  score,
  ai,
  editable,
  onChange,
}: {
  criterion: Criterion;
  score: Score;
  ai: Score | null;
  editable: boolean;
  onChange: (score: Score) => void;
}) {
  const [showAi, setShowAi] = useState(false);
  const differs = ai && score.score !== null && ai.score !== score.score;
  return (
    <section
      aria-labelledby={`criterion-${criterion.id}`}
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <header className="flex items-start gap-3">
        <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--navy)] text-sm font-bold text-white">
          {criterion.numeral}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={`criterion-${criterion.id}`}
            className="text-sm font-semibold text-[var(--navy)]"
          >
            {criterion.title}
          </h3>
          {ai && (
            <button
              type="button"
              onClick={() => setShowAi(!showAi)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700"
              aria-expanded={showAi}
            >
              <Bot className="size-3.5" /> Sugestão da IA: {ai.score ?? '—'}
              {differs ? ` · você: ${score.score}` : ''}
            </button>
          )}
        </div>
        <span className="text-lg font-bold text-[var(--navy)]">
          {score.score ?? '—'}
          <span className="text-xs font-normal text-slate-500">
            /{criterion.maxScore}
          </span>
        </span>
      </header>
      {ai && showAi && (
        <div className="mt-3 space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
          {ai.justification && (
            <p>
              <b>Interpretação:</b> {ai.justification}
            </p>
          )}
          {ai.evidence.length > 0 && (
            <div>
              <b>Evidências no texto:</b>
              <ul className="mt-1 list-disc pl-4">
                {ai.evidence.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {!!ai.problems?.length && (
            <p>
              <b>Problemas:</b> {ai.problems.join('; ')}
            </p>
          )}
          {!!ai.suggestions?.length && (
            <p>
              <b>Sugestões:</b> {ai.suggestions.join('; ')}
            </p>
          )}
          {ai.feedback && (
            <p>
              <b>Retorno sugerido:</b> {ai.feedback}
            </p>
          )}
          {editable && (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                onChange({
                  ...score,
                  score: ai.score,
                  evidence: ai.evidence,
                  feedback: score.feedback || ai.feedback,
                })
              }
            >
              Usar a sugestão nesta competência
            </Button>
          )}
        </div>
      )}
      <fieldset className="mt-3 space-y-1" disabled={!editable}>
        <legend className="sr-only">
          Nível da competência {criterion.numeral}
        </legend>
        {criterion.levels.map((level) => (
          <label
            key={level.score}
            className={`flex cursor-pointer gap-3 rounded-lg border p-2 text-xs ${score.score === level.score ? 'border-[var(--orange)] bg-orange-50' : 'border-slate-200 hover:bg-slate-50'} ${ai?.score === level.score ? 'ring-1 ring-violet-300' : ''}`}
          >
            <input
              type="radio"
              name={`level-${criterion.id}`}
              checked={score.score === level.score}
              onChange={() => onChange({ ...score, score: level.score })}
              className="mt-0.5"
            />
            <span className="w-8 shrink-0 font-bold">{level.score}</span>
            <span className="text-slate-700">{level.descriptor}</span>
          </label>
        ))}
      </fieldset>
      {criterion.observations.length > 0 && (
        <fieldset className="mt-3" disabled={!editable}>
          <legend className="mb-1 text-xs font-semibold text-slate-600">
            Marcações para o retorno (não alteram a nota)
          </legend>
          <div className="flex flex-wrap gap-2">
            {criterion.observations.map((observation) =>
              observation.options?.length ? (
                <label
                  key={observation.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="font-semibold">{observation.label}</span>
                  <select
                    className="h-7 rounded-md border border-slate-200 bg-white px-1 text-xs"
                    value={String(score.observations[observation.id] || '')}
                    onChange={(event) => {
                      const observations = { ...score.observations };
                      if (event.target.value)
                        observations[observation.id] = event.target.value;
                      else delete observations[observation.id];
                      onChange({ ...score, observations });
                    }}
                  >
                    <option value="">—</option>
                    {observation.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label
                  key={observation.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${score.observations[observation.id] ? (observation.tone === 'positive' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900') : 'border-slate-200 text-slate-600'}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={Boolean(score.observations[observation.id])}
                    onChange={(event) => {
                      const observations = { ...score.observations };
                      if (event.target.checked)
                        observations[observation.id] = true;
                      else delete observations[observation.id];
                      onChange({ ...score, observations });
                    }}
                  />
                  {observation.label}
                </label>
              ),
            )}
          </div>
        </fieldset>
      )}
      <div className="mt-3 grid gap-2">
        <Textarea
          aria-label={`Trechos (evidências) da competência ${criterion.numeral}`}
          placeholder="Trechos do texto que justificam a nota (um por linha)"
          disabled={!editable}
          value={score.evidence.join('\n')}
          maxLength={6000}
          onChange={(event) =>
            onChange({
              ...score,
              evidence: event.target.value.split('\n').slice(0, 20),
            })
          }
          className="min-h-16 text-xs"
        />
        <Textarea
          aria-label={`Retorno ao aluno na competência ${criterion.numeral}`}
          placeholder="Retorno ao aluno nesta competência"
          disabled={!editable}
          value={score.feedback}
          maxLength={3000}
          onChange={(event) =>
            onChange({ ...score, feedback: event.target.value })
          }
          className="min-h-16 text-xs"
        />
        <Input
          aria-label={`Anotação interna da competência ${criterion.numeral}`}
          placeholder="Anotação interna (não aparece ao aluno)"
          disabled={!editable}
          value={score.note}
          maxLength={2000}
          onChange={(event) => onChange({ ...score, note: event.target.value })}
          className="h-8 text-xs"
        />
      </div>
    </section>
  );
}

function ConfirmBox({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  disabled,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      aria-label={title}
      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
    >
      <p className="font-semibold text-amber-950">{title}</p>
      <div className="mt-1 text-xs text-amber-900">{children}</div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy || disabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function EssayGradingScreen({
  apiUrl,
  entryId,
  onBack,
  onPrevious,
  onNext,
}: {
  apiUrl: string;
  entryId: string;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const request = useApi(apiUrl);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirming, setConfirming] = useState<
    '' | 'publish' | 'return' | 'reopen'
  >('');
  const [reason, setReason] = useState('');
  const apply = useCallback((data: Entry, resetForm = true) => {
    setEntry(data);
    if (resetForm) {
      setForm(formFrom(data.rubric, data.teacherGrading));
      setDirty(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    request<Entry>(`essay-entries/${entryId}`)
      .then((data) => active && apply(data))
      .catch(
        (e) => active && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      active = false;
    };
  }, [apply, entryId, request]);
  // Enquanto OCR/IA estão na fila, atualiza a situação sem perder o que foi digitado.
  const pending = entry?.jobs.some((job) =>
    ['queued', 'running'].includes(job.status),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      request<Entry>(`essay-entries/${entryId}`)
        .then((data) => apply(data, !dirty))
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [apply, dirty, entryId, pending, request]);
  const run = useCallback(
    async (action: () => Promise<Entry>, message = '') => {
      setBusy(true);
      setError('');
      setSuccess('');
      try {
        apply(await action());
        setSuccess(message);
        setConfirming('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );
  const total = useMemo(() => {
    if (!form || !entry) return null;
    if (form.annulmentReason) return 0;
    const scored = form.scores.filter((item) => item.score !== null);
    return scored.length
      ? scored.reduce((sum, item) => sum + (item.score || 0), 0)
      : null;
  }, [entry, form]);
  if (!entry || !form)
    return (
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Voltar à fila
        </Button>
        <Notice message={error} />
        {!error && (
          <p className="mt-4 text-sm text-slate-500">Carregando redação…</p>
        )}
      </div>
    );
  const received = entry.submission?.status === 'submitted';
  const editable =
    received &&
    !entry.yearLocked &&
    !['awaiting_approval', 'published', 'returned'].includes(entry.status);
  const complete =
    form.annulmentReason || form.scores.every((item) => item.score !== null);
  const aiJob = entry.jobs.find((job) => job.kind === 'ai_grading');
  const ai = entry.aiGrading;
  const payload = () =>
    JSON.stringify({
      ...form,
      scores: form.scores.map((item) => ({
        ...item,
        evidence: item.evidence.map((line) => line.trim()).filter(Boolean),
      })),
      revision: entry.teacherGrading?.revision,
    });
  const update = (next: Form) => {
    setForm(next);
    setDirty(true);
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Fila
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Redação anterior"
          disabled={!onPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Próxima redação"
          disabled={!onNext}
          onClick={onNext}
        >
          <ChevronRight />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-xl font-bold text-[var(--navy)]">
            {entry.student.number ? `${entry.student.number}. ` : ''}
            {entry.student.name}
          </h1>
          <p className="truncate text-xs text-slate-500">
            {entry.prompt.title} · {entry.className} · {entry.rubric.name}
            {entry.submission
              ? ` · ${essayModeLabels[entry.submission.mode]} · ${entry.submission.attempt}ª versão`
              : ''}
            {entry.submission?.submittedAt
              ? ` · enviada ${formatDateTime(entry.submission.submittedAt)}`
              : ''}
          </p>
        </div>
        <StatusBadge status={entry.status} />
      </div>
      {entry.yearLocked && (
        <Notice
          tone="info"
          message="O ano letivo desta turma foi encerrado: a correção fica somente para consulta."
        />
      )}
      <Notice message={error} />
      <Notice tone="success" message={success} />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-12">
        {/* Área A — redação do aluno */}
        <section aria-label="Redação do aluno" className="2xl:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4">
            <EssayArea
              key={`${entry.submission?.id}-${entry.transcriptions[0]?.id}`}
              apiUrl={apiUrl}
              entry={entry}
              editable={Boolean(editable)}
              run={run}
            />
          </div>
        </section>
        {/* Área B — competências */}
        <section aria-label="Competências" className="space-y-3 2xl:col-span-4">
          {received && entry.aiAvailable && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
              {ai ? (
                <>
                  <p className="flex items-center gap-1 font-semibold">
                    <Sparkles className="size-3.5" /> Sugestão da IA:{' '}
                    {ai.total ?? '—'}/{ai.maxScore}
                    <span className="font-normal">
                      · {formatDateTime(ai.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1">
                    É apenas uma sugestão: revise cada competência. A nota
                    oficial é a sua.
                  </p>
                  {ai.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-4">
                      {ai.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {editable && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="mt-2"
                      onClick={() => update(formFrom(entry.rubric, ai, true))}
                    >
                      Partir da sugestão da IA
                    </Button>
                  )}
                </>
              ) : aiJob && ['queued', 'running'].includes(aiJob.status) ? (
                <p>
                  A IA está analisando o texto. A sugestão aparece aqui quando
                  ficar pronta.
                </p>
              ) : (
                <>
                  {aiJob?.status === 'failed' && (
                    <p className="mb-2">
                      A última tentativa falhou: {aiJob.error}
                    </p>
                  )}
                  {editable && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            request<Entry>(
                              `essay-entries/${entry.id}/ai-grading`,
                              { method: 'POST' },
                            ),
                          'Sugestão solicitada. Ela aparece aqui quando ficar pronta.',
                        )
                      }
                    >
                      <Bot /> Gerar sugestão da IA
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {entry.rubric.criteria.map((criterion, index) => (
            <CriterionCard
              key={criterion.id}
              criterion={criterion}
              score={form.scores[index]}
              ai={
                ai?.scores.find((item) => item.criterionId === criterion.id) ||
                null
              }
              editable={Boolean(editable) && !form.annulmentReason}
              onChange={(score) =>
                update({
                  ...form,
                  scores: form.scores.map((item, position) =>
                    position === index ? score : item,
                  ),
                })
              }
            />
          ))}
        </section>
        {/* Área C — resumo, comentários e ações */}
        <section
          aria-label="Resumo da correção"
          className="lg:col-span-2 2xl:col-span-3"
        >
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 2xl:sticky 2xl:top-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Nota total</p>
              <p className="font-display text-4xl font-bold text-[var(--navy)]">
                {total ?? '—'}
                <span className="text-base font-normal text-slate-500">
                  /{entry.rubric.maxScore}
                </span>
              </p>
              {ai && (
                <p className="text-xs text-violet-700">
                  Sugestão da IA: {ai.total ?? '—'}
                </p>
              )}
              {entry.teacherGrading?.finalizedAt && (
                <p className="text-xs text-slate-500">
                  Finalizada por {entry.teacherGrading.finalizedByName} em{' '}
                  {formatDateTime(entry.teacherGrading.finalizedAt)}
                </p>
              )}
              {entry.publication.publishedAt && (
                <p className="text-xs text-emerald-700">
                  Publicada em {formatDateTime(entry.publication.publishedAt)}
                </p>
              )}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="font-medium">Competência</th>
                  {ai && <th className="text-right font-medium">IA</th>}
                  <th className="text-right font-medium">Professor</th>
                </tr>
              </thead>
              <tbody>
                {entry.rubric.criteria.map((criterion, index) => {
                  const aiScore = ai?.scores.find(
                    (item) => item.criterionId === criterion.id,
                  )?.score;
                  const mine = form.annulmentReason
                    ? 0
                    : form.scores[index].score;
                  return (
                    <tr
                      key={criterion.id}
                      className="border-t border-slate-100"
                    >
                      <td className="py-1">{criterion.numeral}</td>
                      {ai && (
                        <td className="py-1 text-right text-violet-700">
                          {aiScore ?? '—'}
                        </td>
                      )}
                      <td
                        className={`py-1 text-right font-semibold ${ai && mine !== null && aiScore !== mine ? 'text-[var(--orange)]' : ''}`}
                      >
                        {mine ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {entry.rubric.annulmentReasons.length > 0 && (
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-600">
                  Anulação
                </span>
                <select
                  className={fieldClass}
                  disabled={!editable}
                  value={form.annulmentReason}
                  onChange={(event) =>
                    update({ ...form, annulmentReason: event.target.value })
                  }
                >
                  <option value="">Não anulada</option>
                  {entry.rubric.annulmentReasons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(
              [
                ['comments', 'Comentário geral', 6000],
                ['strengths', 'Pontos fortes', 4000],
                ['improvements', 'Pontos a melhorar', 4000],
                ['rewriteSuggestions', 'Sugestões de reescrita', 6000],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key} className="block text-xs">
                <span className="mb-1 block font-semibold text-slate-600">
                  {label}
                </span>
                <Textarea
                  disabled={!editable}
                  value={form[key]}
                  maxLength={max}
                  onChange={(event) =>
                    update({ ...form, [key]: event.target.value })
                  }
                  className="min-h-16 text-xs"
                />
              </label>
            ))}
            {dirty && editable && (
              <p className="text-xs text-amber-700">Alterações não salvas.</p>
            )}
            {confirming === 'publish' ? (
              <ConfirmBox
                title="Autorizar publicação?"
                confirmLabel="Publicar nota"
                busy={busy}
                onCancel={() => setConfirming('')}
                onConfirm={() =>
                  run(
                    () =>
                      request<Entry>(`essay-entries/${entry.id}/publish`, {
                        method: 'POST',
                        body: JSON.stringify({ confirm: true }),
                      }),
                    'Nota publicada para o aluno.',
                  )
                }
              >
                O aluno passa a ver a nota {entry.teacherGrading?.total}/
                {entry.rubric.maxScore}, as competências e os comentários. A
                publicação fica registrada no histórico.
              </ConfirmBox>
            ) : confirming === 'return' ? (
              <ConfirmBox
                title="Devolver ao aluno para revisão?"
                confirmLabel="Devolver"
                busy={busy}
                disabled={reason.trim().length < 5}
                onCancel={() => setConfirming('')}
                onConfirm={() =>
                  run(
                    () =>
                      request<Entry>(`essay-entries/${entry.id}/return`, {
                        method: 'POST',
                        body: JSON.stringify({ reason }),
                      }),
                    'Produção devolvida ao aluno.',
                  )
                }
              >
                <Textarea
                  aria-label="O que o aluno deve revisar"
                  placeholder="Explique ao aluno o que revisar"
                  value={reason}
                  maxLength={2000}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-2 min-h-16 bg-white text-xs"
                />
              </ConfirmBox>
            ) : confirming === 'reopen' ? (
              <ConfirmBox
                title="Reabrir a correção?"
                confirmLabel="Reabrir"
                busy={busy}
                onCancel={() => setConfirming('')}
                onConfirm={() =>
                  run(
                    () =>
                      request<Entry>(
                        `essay-entries/${entry.id}/grading/reopen`,
                        { method: 'POST' },
                      ),
                    'Correção reaberta. A versão anterior ficou no histórico.',
                  )
                }
              >
                {entry.status === 'published'
                  ? 'A nota deixa de aparecer para o aluno até ser publicada de novo.'
                  : 'A correção volta para edição.'}
              </ConfirmBox>
            ) : (
              <div className="flex flex-col gap-2">
                {editable && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            request<Entry>(
                              `essay-entries/${entry.id}/grading`,
                              { method: 'PUT', body: payload() },
                            ),
                          'Rascunho salvo.',
                        )
                      }
                    >
                      <Save /> Salvar
                    </Button>
                    <Button
                      disabled={busy || !complete}
                      onClick={() =>
                        run(
                          () =>
                            request<Entry>(
                              `essay-entries/${entry.id}/grading/finalize`,
                              {
                                method: 'POST',
                                body: payload(),
                              },
                            ),
                          'Correção finalizada. Autorize a publicação quando quiser liberar ao aluno.',
                        )
                      }
                    >
                      <CheckCircle2 /> Finalizar correção
                    </Button>
                  </>
                )}
                {entry.status === 'awaiting_approval' && !entry.yearLocked && (
                  <Button
                    disabled={busy}
                    onClick={() => setConfirming('publish')}
                  >
                    <Send /> Autorizar publicação
                  </Button>
                )}
                {['awaiting_approval', 'published'].includes(entry.status) &&
                  !entry.yearLocked && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirming('reopen')}
                    >
                      <RotateCcw /> Reabrir correção
                    </Button>
                  )}
                {received &&
                  entry.status !== 'published' &&
                  !entry.yearLocked && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirming('return')}
                    >
                      <Undo2 /> Devolver para revisão
                    </Button>
                  )}
              </div>
            )}
            {editable && !complete && (
              <p className="text-xs text-slate-500">
                Atribua todas as competências para finalizar.
              </p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-600">
                Histórico
              </summary>
              <ul className="mt-2 space-y-1">
                {entry.history.map((item, index) => (
                  <li key={index}>
                    <span className="text-slate-500">
                      {formatDateTime(item.createdAt)}
                    </span>{' '}
                    · {actionLabels[item.action] || item.action}
                    {typeof item.metadata?.total === 'number'
                      ? ` (${item.metadata.total})`
                      : ''}
                    {item.userName ? ` · ${item.userName}` : ''}
                  </li>
                ))}
                {!entry.history.length && (
                  <li className="text-slate-500">Sem registros.</li>
                )}
              </ul>
              {entry.attempts.length > 1 && (
                <>
                  <p className="mt-3 font-semibold text-slate-600">Versões</p>
                  <ul className="mt-1 space-y-1">
                    {entry.attempts.map((attempt) => (
                      <li key={attempt.id}>
                        {attempt.attempt}ª · {essayModeLabels[attempt.mode]} ·{' '}
                        {formatDateTime(attempt.submittedAt)}
                        {attempt.returnReason
                          ? ` · devolvida: ${attempt.returnReason}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------- Painel ----------

export function EssayDashboard({
  apiUrl,
  onOpenQueue,
}: {
  apiUrl: string;
  onOpenQueue: () => void;
}) {
  const request = useApi(apiUrl);
  const [filters, setFilters] = useState({
    schoolId: '',
    classId: '',
    teacherId: '',
    promptId: '',
    schoolYear: '',
    from: '',
    to: '',
  });
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    );
    request<Dashboard>(`essay-dashboard?${params}`)
      .then((value) => {
        if (!active) return;
        setData(value);
        setError('');
      })
      .catch(
        (e) => active && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      active = false;
    };
  }, [filters, request]);
  const select = (
    key: keyof typeof filters,
    label: string,
    options: Option2[],
  ) => (
    <select
      aria-label={label}
      className={fieldClass}
      value={filters[key]}
      onChange={(event) =>
        setFilters({ ...filters, [key]: event.target.value })
      }
    >
      <option value="">{label}: todas</option>
      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );
  const cards: Array<[string, number | string | null, string]> = data
    ? [
        ['Alunos nas aplicações', data.students, ''],
        ['Produções recebidas', data.received, ''],
        ['A corrigir', data.toGrade, 'text-amber-700'],
        ['Aguardando aprovação', data.awaitingApproval, 'text-indigo-700'],
        ['Publicadas', data.published, 'text-emerald-700'],
        ['Devolvidas para revisão', data.returned, 'text-rose-700'],
        ['Média das publicadas', data.averageTotal, 'text-[var(--navy)]'],
      ]
    : [];
  return (
    <div>
      <Header
        title="Painel de redação"
        description="Indicadores das produções das suas turmas (a coordenação vê a instituição inteira). Médias consideram somente notas publicadas."
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {data && (
          <>
            {select('schoolId', 'Escola', data.options.schools)}
            {select('classId', 'Turma', data.options.classes)}
            {select('teacherId', 'Professor', data.options.teachers)}
            {select('promptId', 'Tema', data.options.prompts)}
            {select('schoolYear', 'Ano letivo', data.options.years)}
          </>
        )}
        <label
          htmlFor="essay-dashboard-from"
          className="flex items-center gap-2 text-xs text-slate-600"
        >
          De
          <Input
            id="essay-dashboard-from"
            type="date"
            className="h-9"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </label>
        <label
          htmlFor="essay-dashboard-to"
          className="flex items-center gap-2 text-xs text-slate-600"
        >
          Até
          <Input
            id="essay-dashboard-to"
            type="date"
            className="h-9"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </label>
      </div>
      <Notice message={error} />
      {!data ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(([label, value, tone]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className={`font-display mt-1 text-3xl font-bold ${tone}`}>
                  {value ?? '—'}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-[var(--navy)]">
                Situação das produções
              </h2>
              <ul className="mt-3 space-y-2">
                {(Object.keys(essayStatusLabels) as EssayEntryStatus[]).map(
                  (status) => {
                    const count = data.byStatus[status] || 0;
                    return (
                      <li key={status} className="text-xs">
                        <div className="flex justify-between">
                          <span>{essayStatusLabels[status]}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                          <div
                            className="h-1.5 rounded-full bg-[var(--navy)]"
                            style={{
                              width: `${data.students ? (count / data.students) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </li>
                    );
                  },
                )}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={onOpenQueue}
              >
                Abrir fila de correção
              </Button>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-[var(--navy)]">
                Média por competência (publicadas)
              </h2>
              {!data.criteriaAverages.length ? (
                <p className="mt-3 text-xs text-slate-500">
                  Nenhuma nota publicada com esses filtros.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.criteriaAverages.map((item) => (
                    <li key={item.criterionId} className="text-xs">
                      <div className="flex justify-between">
                        <span>
                          Competência {item.criterionId.replace(/^c/i, '')}
                        </span>
                        <span className="font-semibold">{item.average}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full bg-[var(--orange)]"
                          style={{
                            width: `${Math.min(100, item.average / 2)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.minTotal !== null && (
                <p className="mt-3 text-xs text-slate-500">
                  Menor nota {data.minTotal} · maior nota {data.maxTotal}
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
