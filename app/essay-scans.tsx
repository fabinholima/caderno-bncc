'use client';

// Envio em lote das folhas de redação escaneadas: o professor envia o PDF da
// turma (ou fotos); o servidor lê o QR de cada folha e separa as páginas por
// aluno. Páginas sem QR legível ficam aqui para atribuição manual.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  QrCode,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { essayStatusLabels, type EssayEntryStatus } from '@/lib/essay-status';
import { ESSAY_MAX_SCAN_PDF_BYTES, prepareEssayFile } from '@/lib/essay-upload';

type ScanPage = {
  id: string;
  status:
    | 'queued'
    | 'processing'
    | 'attached'
    | 'unmatched'
    | 'failed'
    | 'discarded';
  originalName: string;
  sourcePage: number | null;
  sourcePages: number | null;
  message: string;
  entryId: string | null;
  studentName: string | null;
  studentNumber: number | null;
  hasImage: boolean;
  createdAt: string;
};
type ScanStudent = {
  id: string;
  number: number | null;
  name: string;
  status: EssayEntryStatus;
  scanPages: number;
};
type ScanState = {
  application: {
    id: string;
    promptTitle: string;
    className: string;
    classGrade: string;
    status: string;
    yearLocked: boolean;
  };
  pages: ScanPage[];
  students: ScanStudent[];
};

const fieldClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange)]/30 disabled:bg-slate-100 disabled:text-slate-500';

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

const pageLabel = (page: ScanPage) =>
  [
    page.originalName || 'Arquivo enviado',
    page.sourcePages && page.sourcePages > 1
      ? `página ${page.sourcePage} de ${page.sourcePages}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

const studentLabel = (student: { number: number | null; name: string }) =>
  student.number ? `${student.number}. ${student.name}` : student.name;

function PageImage({ apiUrl, pageId }: { apiUrl: string; pageId: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let created = '';
    apiFetch(`${apiUrl}/api/essay-scan-pages/${pageId}/image`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        created = URL.createObjectURL(await response.blob());
        if (active) setUrl(created);
        else URL.revokeObjectURL(created);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [apiUrl, pageId]);
  if (failed)
    return (
      <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
        Imagem indisponível
      </div>
    );
  if (!url)
    return <div className="h-40 animate-pulse rounded-lg bg-slate-100" />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Abrir em tamanho real"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- blob privado */}
      <img
        src={url}
        alt="Página escaneada"
        className="h-40 w-full rounded-lg border border-slate-200 bg-white object-contain"
      />
    </a>
  );
}

function PendingPage({
  apiUrl,
  page,
  students,
  locked,
  onChange,
  onError,
}: {
  apiUrl: string;
  page: ScanPage;
  students: ScanStudent[];
  locked: boolean;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const request = useApi(apiUrl);
  const [entryId, setEntryId] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(path: string, body?: unknown) {
    setBusy(true);
    onError('');
    try {
      await request(`essay-scan-pages/${page.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  // Quem ainda não entregou aparece primeiro.
  const options = [...students].sort(
    (a, b) =>
      Number(!['pending', 'draft', 'absent'].includes(a.status)) -
      Number(!['pending', 'draft', 'absent'].includes(b.status)),
  );
  return (
    <li className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 sm:grid-cols-[10rem_1fr]">
      {page.hasImage ? (
        <PageImage apiUrl={apiUrl} pageId={page.id} />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
          Sem imagem
        </div>
      )}
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-semibold text-[var(--navy)]">{pageLabel(page)}</p>
        {page.studentName && (
          <p className="text-xs font-semibold text-slate-600">
            QR de{' '}
            {studentLabel({
              number: page.studentNumber,
              name: page.studentName,
            })}
          </p>
        )}
        <p className="text-amber-900">{page.message}</p>
        {page.status === 'unmatched' && page.hasImage && !locked && (
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Aluno desta página"
              className={`${fieldClass} sm:max-w-xs`}
              value={entryId}
              onChange={(event) => setEntryId(event.target.value)}
            >
              <option value="">Escolha o aluno</option>
              {options.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentLabel(student)} —{' '}
                  {essayStatusLabels[student.status] || student.status}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={busy || !entryId}
              onClick={() => act('assign', { entryId })}
            >
              <CheckCircle2 /> Atribuir
            </Button>
          </div>
        )}
        {!locked && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => act('discard')}
          >
            <Trash2 /> Descartar página
          </Button>
        )}
      </div>
    </li>
  );
}

export function EssayScanUpload({
  apiUrl,
  applicationId,
  onBack,
  onGrade,
}: {
  apiUrl: string;
  applicationId: string;
  onBack: () => void;
  onGrade: () => void;
}) {
  const request = useApi(apiUrl);
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ScanState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const load = useCallback(async () => {
    try {
      setState(
        await request<ScanState>(`essay-applications/${applicationId}/scans`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [applicationId, request]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  const working = Boolean(
    state?.pages.some((page) => ['queued', 'processing'].includes(page.status)),
  );
  // Acompanha a leitura dos QR enquanto há arquivos na fila.
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load, working]);

  async function upload(files: FileList | File[] | null) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setError('');
    setNotice('');
    try {
      for (const [index, file] of list.entries()) {
        setProgress(
          `Enviando ${index + 1} de ${list.length}: ${file.name || 'arquivo'}`,
        );
        const dataUrl = await prepareEssayFile(file, {
          maxPdfBytes: ESSAY_MAX_SCAN_PDF_BYTES,
        });
        await request(`essay-applications/${applicationId}/scans`, {
          method: 'POST',
          body: JSON.stringify({ dataUrl, name: file.name.slice(0, 200) }),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress('');
      if (input.current) input.current.value = '';
      await load();
    }
  }

  const [discarding, setDiscarding] = useState(false);
  async function discardWithoutQr(pages: ScanPage[]) {
    setDiscarding(true);
    setError('');
    try {
      for (const page of pages)
        await request(`essay-scan-pages/${page.id}/discard`, {
          method: 'POST',
          body: '{}',
        });
      setNotice(`${pages.length} página(s) sem QR descartada(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscarding(false);
      await load();
    }
  }

  async function receiveAll() {
    setReceiving(true);
    setError('');
    setNotice('');
    try {
      const result = await request<{ received: number; errors: string[] }>(
        `essay-applications/${applicationId}/scans/receive`,
        { method: 'POST' },
      );
      setNotice(
        `${result.received} redação(ões) registrada(s) e enviada(s) para a correção.`,
      );
      if (result.errors.length) setError(result.errors.join(' '));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReceiving(false);
    }
  }

  const locked =
    !state ||
    state.application.yearLocked ||
    state.application.status === 'cancelled';
  const ready =
    state?.students.filter((student) => student.scanPages > 0) || [];
  const pending =
    state?.pages.filter((page) =>
      ['unmatched', 'failed'].includes(page.status),
    ) || [];
  const attached =
    state?.pages.filter((page) => page.status === 'attached') || [];
  const queued =
    state?.pages.filter((page) =>
      ['queued', 'processing'].includes(page.status),
    ) || [];
  const withoutQr = pending.filter(
    (page) => page.status === 'unmatched' && !page.entryId,
  );
  const missing =
    state?.students.filter(
      (student) => student.status === 'pending' && !student.scanPages,
    ) || [];

  return (
    <div>
      <Button size="sm" variant="ghost" className="mb-3" onClick={onBack}>
        <ArrowLeft /> Voltar
      </Button>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">
          Redação
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold text-[var(--navy)]">
          Enviar redações escaneadas
        </h1>
        {state && (
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {state.application.promptTitle} · {state.application.classGrade} —{' '}
            {state.application.className}
          </p>
        )}
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Cada folha nominal impressa pelo Histórico tem um QR do aluno.
          Escaneie as folhas da turma num único PDF (ou envie as fotos): o
          sistema lê o QR e separa as páginas por aluno, como no corretor de
          provas.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          aria-live="polite"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {!state ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <div className="space-y-6">
          {locked ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {state.application.status === 'cancelled'
                ? 'Aplicação cancelada: não recebe novas folhas.'
                : 'O ano letivo desta turma está encerrado: as redações ficam somente para consulta.'}
            </p>
          ) : (
            <section
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void upload(event.dataTransfer.files);
              }}
              className={`rounded-2xl border-2 border-dashed p-6 text-center ${dragging ? 'border-[var(--orange)] bg-orange-50' : 'border-slate-300 bg-white'}`}
            >
              <QrCode className="mx-auto size-8 text-slate-400" />
              <p className="mt-2 font-semibold text-[var(--navy)]">
                Arraste o PDF ou as fotos das folhas
              </p>
              <p className="mt-1 text-xs text-slate-500">
                PDF de até 25 MB (até 200 páginas) ou fotos JPEG/PNG. Folhas de
                vários alunos podem ir no mesmo arquivo, em qualquer ordem.
              </p>
              <input
                ref={input}
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => void upload(event.target.files)}
              />
              <Button
                className="mt-4"
                disabled={Boolean(progress)}
                onClick={() => input.current?.click()}
              >
                {progress ? <Loader2 className="animate-spin" /> : <Upload />}{' '}
                {progress || 'Escolher arquivos'}
              </Button>
            </section>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Lendo QR', queued.length, 'text-sky-700'],
              ['Prontas para registrar', ready.length, 'text-emerald-700'],
              ['Precisam de atenção', pending.length, 'text-amber-700'],
              ['Sem folha recebida', missing.length, 'text-slate-600'],
            ].map(([label, value, tone]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <p className={`text-2xl font-bold ${tone}`}>{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          {working && (
            <p className="flex items-center gap-2 text-sm text-sky-800">
              <Loader2 className="size-4 animate-spin" /> Lendo o QR das folhas…
            </p>
          )}

          {ready.length > 0 && (
            <section className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-[var(--navy)]">
                  Prontas para registrar
                </h2>
                {!locked && (
                  <Button disabled={receiving} onClick={receiveAll}>
                    <CheckCircle2 />{' '}
                    {receiving
                      ? 'Registrando…'
                      : `Registrar recebimento de ${ready.length}`}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Ao registrar, as redações entram na fila de correção (e na
                transcrição automática, quando a IA estiver ligada).
              </p>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {ready.map((student) => (
                  <li
                    key={student.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span>{studentLabel(student)}</span>
                    <span className="text-xs text-slate-500">
                      {student.scanPages} página(s)
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pending.length > 0 && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-[var(--navy)]">
                  Precisam de atenção
                </h2>
                {!locked && withoutQr.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={discarding}
                    onClick={() => discardWithoutQr(withoutQr)}
                  >
                    <Trash2 />{' '}
                    {discarding
                      ? 'Descartando…'
                      : `Descartar as ${withoutQr.length} páginas sem aluno`}
                  </Button>
                )}
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Páginas da proposta e da grade de critérios não têm QR:
                descarte-as. Se for a folha de um aluno com o QR ilegível,
                escolha o aluno.
              </p>
              <ul className="space-y-3">
                {pending.map((page) => (
                  <PendingPage
                    key={page.id}
                    apiUrl={apiUrl}
                    page={page}
                    students={state.students}
                    locked={locked}
                    onChange={load}
                    onError={setError}
                  />
                ))}
              </ul>
            </section>
          )}

          {attached.length > 0 && (
            <details className="rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--navy)]">
                Páginas identificadas ({attached.length})
              </summary>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {attached.map((page) => (
                  <li
                    key={page.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span>
                      {page.studentName
                        ? studentLabel({
                            number: page.studentNumber,
                            name: page.studentName,
                          })
                        : '—'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {pageLabel(page)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onGrade}>
              Ir para a correção
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
