'use client';
// Minhas Redações (portal do aluno): ler a proposta, escrever com salvamento
// automático no servidor ou enviar fotos/PDF da folha, acompanhar a situação
// e ver a correção publicada pelo professor.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  essayModeLabels,
  essayStatusLabels,
  essayStatusTone,
  type EssayEntryStatus,
} from '@/lib/essay-status';
import { prepareEssayFile } from '@/lib/essay-upload';

type StudentEssay = {
  id: string;
  title: string;
  theme: string;
  className: string;
  appliedOn: string;
  dueAt: string | null;
  status: 'open' | 'closed';
  submissionStatus: EssayEntryStatus;
  canWrite: boolean;
  total: number | null;
  maxScore: number | null;
};

type Block =
  | { type: 'paragraph' | 'heading' | 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: boolean; rows: string[][] };

type Detail = {
  id: string;
  status: EssayEntryStatus;
  className: string;
  teacherName: string;
  dueAt: string | null;
  opensAt: string | null;
  submissionModes: Array<'typed' | 'upload'>;
  canWrite: boolean;
  writeBlock: string;
  limits: { maxChars: number; maxFiles: number; charsPerLine: number };
  prompt: {
    title: string;
    theme: string;
    productionCommand: string;
    studentGuidance: string;
    minLines: number;
    maxLines: number;
    motivatingTexts: Array<{
      title: string;
      author: string;
      source: string;
      blocks: Block[];
      hasImages: boolean;
    }>;
  };
  submission: null | {
    attempt: number;
    mode: 'typed' | 'upload' | 'teacher_scan';
    typedText: string;
    wordCount: number;
    lineCount: number;
    status: 'draft' | 'submitted' | 'returned';
    revision: number;
    returnReason: string;
    submittedAt: string | null;
    updatedAt: string;
    files: Array<{
      id: string;
      position: number;
      mimeType: string;
      byteSize: number;
    }>;
  };
  attempts: Array<{
    attempt: number;
    mode: string;
    status: string;
    returnReason: string;
    submittedAt: string | null;
  }>;
  result: null | {
    total: number;
    maxScore: number;
    annulmentReason: string;
    publishedAt: string;
    comments: string;
    strengths: string;
    improvements: string;
    rewriteSuggestions: string;
    aiFeedback: string;
    criteria: Array<{
      id: string;
      numeral: string;
      title: string;
      maxScore: number;
      score: number | null;
      level: string;
      feedback: string;
      observations: string[];
      aiFeedback: string;
    }>;
  };
};

const formatDate = (value: string) =>
  new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString('pt-BR');
const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
function countLines(text: string, perLine: number) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)),
      0,
    );
}

function useStudentApi(apiUrl: string) {
  return useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await apiFetch(`${apiUrl}/api/student/${path}`, {
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
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${essayStatusTone[status]}`}
    >
      {essayStatusLabels[status]}
    </span>
  );
}

// Minhas Redações: propostas liberadas pelo professor para a turma do aluno.
export function StudentEssays({ apiUrl }: { apiUrl: string }) {
  const request = useStudentApi(apiUrl);
  const [essays, setEssays] = useState<StudentEssay[]>([]);
  const [openId, setOpenId] = useState('');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    request<StudentEssay[]>('essays')
      .then((items) => {
        setEssays(items);
        setMessage('');
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setLoaded(true));
  }, [request]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  if (openId)
    return (
      <EssayWorkspace
        apiUrl={apiUrl}
        applicationId={openId}
        onBack={() => {
          setOpenId('');
          load();
        }}
      />
    );
  return (
    <>
      <h2 className="mt-6 font-semibold">Minhas redações</h2>
      {message && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {message}
        </p>
      )}
      {loaded && !essays.length && !message && (
        <p className="mt-2 text-sm">Nenhuma proposta de redação disponível.</p>
      )}
      {essays.map((essay) => (
        <article key={essay.id} className="mt-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <b>{essay.title}</b>
              <p className="text-sm">{essay.theme}</p>
            </div>
            <StatusBadge status={essay.submissionStatus} />
          </div>
          <p className="text-sm text-slate-600">
            {essay.className} · aplicada em {formatDate(essay.appliedOn)}
            {essay.dueAt ? ` · entrega até ${formatDateTime(essay.dueAt)}` : ''}
            {essay.status === 'closed' ? ' · encerrada' : ''}
          </p>
          {essay.total !== null && (
            <p className="mt-1 text-sm font-semibold text-emerald-800">
              Nota: {essay.total}/{essay.maxScore}
            </p>
          )}
          <Button
            className="mt-2"
            size="sm"
            variant={essay.canWrite ? 'default' : 'outline'}
            onClick={() => setOpenId(essay.id)}
          >
            {essay.canWrite
              ? essay.submissionStatus === 'returned'
                ? 'Reescrever'
                : 'Escrever ou enviar'
              : essay.total !== null
                ? 'Ver correção'
                : 'Abrir'}
          </Button>
        </article>
      ))}
    </>
  );
}

function PromptView({
  apiUrl,
  applicationId,
  prompt,
}: {
  apiUrl: string;
  applicationId: string;
  prompt: Detail['prompt'];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openPdf() {
    setBusy(true);
    setError('');
    // Abre a aba antes do download para o navegador não bloquear o pop-up.
    const tab = window.open('', '_blank');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/student/essays/${applicationId}/proposal.pdf`,
      );
      if (!response.ok) throw Error('Não foi possível abrir a proposta.');
      const url = URL.createObjectURL(await response.blob());
      (tab ?? window).location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-3 rounded-xl border bg-white p-3" open>
      <summary className="cursor-pointer font-semibold">Proposta</summary>
      <p className="mt-2 text-sm font-semibold">{prompt.theme}</p>
      {prompt.productionCommand && (
        <p className="mt-2 text-sm whitespace-pre-line">
          {prompt.productionCommand}
        </p>
      )}
      {prompt.studentGuidance && (
        <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">
          {prompt.studentGuidance}
        </p>
      )}
      {prompt.motivatingTexts.map((item, index) => (
        <section key={index} className="mt-3 border-t pt-2 text-sm">
          <p className="font-semibold">
            Texto {index + 1}
            {item.title ? ` — ${item.title}` : ''}
          </p>
          {item.blocks.map((block, position) =>
            block.type === 'list' ? (
              <ul key={position} className="list-disc pl-5">
                {block.items.map((value, key) => (
                  <li key={key}>{value}</li>
                ))}
              </ul>
            ) : block.type === 'table' ? (
              <table key={position} className="my-2 text-xs">
                <tbody>
                  {block.rows.map((row, key) => (
                    <tr key={key}>
                      {row.map((cell, cellKey) => (
                        <td key={cellKey} className="border px-2 py-1">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p
                key={position}
                className={`mt-1 whitespace-pre-line ${block.type === 'quote' ? 'border-l-2 pl-3 italic' : block.type === 'heading' ? 'font-semibold' : ''}`}
              >
                {block.text.replace(/\*\*/g, '')}
              </p>
            ),
          )}
          {item.hasImages && (
            <p className="mt-1 text-xs text-slate-500">
              Este texto tem imagem: veja no PDF da proposta.
            </p>
          )}
          {(item.author || item.source) && (
            <p className="mt-1 text-xs text-slate-500">
              {[item.author, item.source].filter(Boolean).join(' · ')}
            </p>
          )}
        </section>
      ))}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={openPdf}
      >
        {busy ? 'Gerando PDF…' : 'Abrir proposta e folha em PDF'}
      </Button>
    </details>
  );
}

function FileThumb({
  apiUrl,
  applicationId,
  file,
  onRemove,
}: {
  apiUrl: string;
  applicationId: string;
  file: { id: string; position: number; mimeType: string };
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let created = '';
    apiFetch(`${apiUrl}/api/student/essays/${applicationId}/files/${file.id}`)
      .then(async (response) => {
        if (!response.ok) return;
        created = URL.createObjectURL(await response.blob());
        if (active) setUrl(created);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [apiUrl, applicationId, file.id]);
  return (
    <li className="rounded-lg border p-2 text-xs">
      {file.mimeType === 'application/pdf' ? (
        <a
          href={url || undefined}
          target="_blank"
          rel="noreferrer"
          className="flex h-28 items-center justify-center rounded bg-slate-100 font-semibold"
        >
          PDF
        </a>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Página ${file.position}`}
          className="h-28 w-full rounded object-cover"
        />
      ) : (
        <div className="h-28 rounded bg-slate-100" />
      )}
      <div className="mt-1 flex items-center justify-between">
        <span>Página {file.position}</span>
        {onRemove && (
          <button
            type="button"
            className="font-semibold text-rose-700"
            onClick={onRemove}
          >
            Remover
          </button>
        )}
      </div>
    </li>
  );
}

function EssayWorkspace({
  apiUrl,
  applicationId,
  onBack,
}: {
  apiUrl: string;
  applicationId: string;
  onBack: () => void;
}) {
  const request = useStudentApi(apiUrl);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'typed' | 'upload'>('typed');
  const [save, setSave] = useState<{
    state: 'idle' | 'saving' | 'saved' | 'error';
    at?: string;
    message?: string;
  }>({ state: 'idle' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const revision = useRef<number | undefined>(undefined);
  const lastSaved = useRef('');
  const fileInput = useRef<HTMLInputElement>(null);
  const applyDetail = useCallback((data: Detail) => {
    setDetail(data);
    // Após devolução, a reescrita digitada parte do texto anterior.
    const typed =
      data.submission?.mode === 'typed' ? data.submission.typedText : '';
    setText(typed);
    lastSaved.current = typed;
    revision.current =
      data.submission?.status === 'draft'
        ? data.submission.revision
        : undefined;
    setMode(
      data.submission?.status === 'draft' && data.submission.mode === 'upload'
        ? 'upload'
        : data.submissionModes.includes('typed')
          ? 'typed'
          : 'upload',
    );
  }, []);
  const reload = useCallback(
    () =>
      request<Detail>(`essays/${applicationId}`)
        .then(applyDetail)
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [applicationId, applyDetail, request],
  );
  useEffect(() => {
    let active = true;
    request<Detail>(`essays/${applicationId}`)
      .then((data) => active && applyDetail(data))
      .catch(
        (e) => active && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      active = false;
    };
  }, [applicationId, applyDetail, request]);
  const persist = useCallback(
    async (value: string) => {
      if (value === lastSaved.current) return true;
      setSave({ state: 'saving' });
      try {
        const saved = await request<{ revision: number; savedAt: string }>(
          `essays/${applicationId}/draft`,
          {
            method: 'PUT',
            body: JSON.stringify({ text: value, revision: revision.current }),
          },
        );
        revision.current = saved.revision;
        lastSaved.current = value;
        setSave({ state: 'saved', at: saved.savedAt });
        return true;
      } catch (e) {
        setSave({
          state: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
        return false;
      }
    },
    [applicationId, request],
  );
  // Salvamento automático no servidor, 1,5 s depois da última digitação.
  useEffect(() => {
    if (!detail?.canWrite || mode !== 'typed' || text === lastSaved.current)
      return;
    const timer = setTimeout(() => void persist(text), 1500);
    return () => clearTimeout(timer);
  }, [detail?.canWrite, mode, persist, text]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (text !== lastSaved.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [text]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await prepareEssayFile(file);
        await request(`essays/${applicationId}/files`, {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await reload();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function remove(fileId: string) {
    setBusy(true);
    setError('');
    try {
      await request(`essays/${applicationId}/files/${fileId}`, {
        method: 'DELETE',
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'typed' && !(await persist(text)))
        throw new Error('Não foi possível salvar o texto antes do envio.');
      applyDetail(
        await request<Detail>(`essays/${applicationId}/submit`, {
          method: 'POST',
        }),
      );
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const back = async () => {
    if (mode === 'typed' && detail?.canWrite) await persist(text);
    onBack();
  };
  if (!detail)
    return (
      <section className="mt-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Minhas redações
        </Button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {error}
          </p>
        ) : (
          <p className="mt-2 text-sm">Carregando…</p>
        )}
      </section>
    );
  const perLine = detail.limits.charsPerLine;
  const lines = countLines(text, perLine);
  const words = countWords(text);
  const { minLines, maxLines } = detail.prompt;
  const draftFiles =
    detail.submission?.status === 'draft' && detail.submission.mode === 'upload'
      ? detail.submission.files
      : [];
  const submittedFiles =
    detail.submission?.status === 'submitted' ? detail.submission.files : [];
  const lineProblem =
    mode === 'typed' && text.trim() && (lines < minLines || lines > maxLines);
  return (
    <section className="mt-6">
      <Button variant="ghost" size="sm" onClick={back}>
        ← Minhas redações
      </Button>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">
          {detail.prompt.title}
        </h2>
        <StatusBadge status={detail.status} />
      </div>
      <p className="text-sm text-slate-600">
        {detail.className} · {detail.teacherName}
        {detail.dueAt ? ` · entrega até ${formatDateTime(detail.dueAt)}` : ''}
      </p>
      <PromptView
        apiUrl={apiUrl}
        applicationId={applicationId}
        prompt={detail.prompt}
      />
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {detail.status === 'returned' && detail.submission?.returnReason && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>O professor pediu uma revisão:</b> {detail.submission.returnReason}
        </p>
      )}
      {detail.canWrite ? (
        <div className="mt-3 rounded-xl border bg-white p-3">
          {detail.submissionModes.length > 1 && (
            <div
              role="tablist"
              className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm"
            >
              {detail.submissionModes.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded-md px-3 py-1.5 font-semibold ${mode === value ? 'bg-white shadow-sm' : 'text-slate-500'}`}
                >
                  {value === 'typed' ? 'Digitar' : 'Enviar foto ou PDF'}
                </button>
              ))}
            </div>
          )}
          {mode === 'typed' ? (
            <>
              <Textarea
                aria-label="Texto da redação"
                value={text}
                maxLength={detail.limits.maxChars}
                disabled={draftFiles.length > 0}
                onChange={(event) => setText(event.target.value)}
                className="min-h-96 font-serif text-[15px] leading-7"
                placeholder={
                  draftFiles.length
                    ? 'Remova as fotos enviadas para digitar o texto.'
                    : 'Escreva sua redação aqui. O texto é salvo automaticamente.'
                }
              />
              <p
                className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-600"
                aria-live="polite"
              >
                <span>{words} palavras</span>
                <span
                  className={lineProblem ? 'font-semibold text-rose-700' : ''}
                >
                  cerca de {lines} linhas (de {minLines} a {maxLines})
                </span>
                <span>
                  {save.state === 'saving'
                    ? 'Salvando…'
                    : save.state === 'saved' && save.at
                      ? `Salvo às ${new Date(save.at).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}`
                      : ''}
                </span>
              </p>
              {save.state === 'error' && (
                <p role="alert" className="mt-1 text-xs text-rose-700">
                  {save.message}{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => void reload()}
                  >
                    Recarregar
                  </button>
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                A contagem de linhas é uma estimativa da folha oficial (cerca de{' '}
                {perLine} caracteres por linha).
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Fotografe cada página da folha com boa luz, sem sombras e sem
                cortar as bordas. Até {detail.limits.maxFiles} páginas.
              </p>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => upload(event.target.files)}
              />
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !!text.trim() ||
                  draftFiles.length >= detail.limits.maxFiles
                }
                onClick={() => fileInput.current?.click()}
              >
                {busy ? 'Enviando…' : 'Adicionar páginas'}
              </Button>
              {!!text.trim() && (
                <p className="mt-1 text-xs text-amber-800">
                  Apague o texto digitado para enviar fotos.
                </p>
              )}
              {draftFiles.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {draftFiles.map((file) => (
                    <FileThumb
                      key={file.id}
                      apiUrl={apiUrl}
                      applicationId={applicationId}
                      file={file}
                      onRemove={() => remove(file.id)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
          {confirming ? (
            <div
              aria-label="Confirmar envio"
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
            >
              <p className="font-semibold">Enviar a redação ao professor?</p>
              <p className="text-xs">
                Depois do envio não é possível editar, a menos que o professor
                devolva para revisão.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={submit}>
                  {busy ? 'Enviando…' : 'Confirmar envio'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  Continuar editando
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="mt-3"
              disabled={
                busy ||
                (mode === 'typed'
                  ? !text.trim() || Boolean(lineProblem)
                  : !draftFiles.length)
              }
              onClick={() => setConfirming(true)}
            >
              Enviar redação
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border bg-white p-3 text-sm">
          {detail.writeBlock && detail.status !== 'published' && (
            <p className="text-slate-600">{detail.writeBlock}</p>
          )}
          {detail.submission?.status === 'submitted' && (
            <>
              <p className="mt-1 text-slate-600">
                {essayModeLabels[detail.submission.mode]}
                {detail.submission.submittedAt
                  ? ` · enviada em ${formatDateTime(detail.submission.submittedAt)}`
                  : ''}
              </p>
              {detail.submission.mode === 'typed' ? (
                <p className="mt-2 rounded-lg bg-slate-50 p-3 font-serif whitespace-pre-wrap">
                  {detail.submission.typedText}
                </p>
              ) : (
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {submittedFiles.map((file) => (
                    <FileThumb
                      key={file.id}
                      apiUrl={apiUrl}
                      applicationId={applicationId}
                      file={file}
                    />
                  ))}
                </ul>
              )}
              {!detail.result && (
                <p className="mt-2 text-slate-600">
                  A correção aparece aqui quando o professor publicar a nota.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {detail.result && <ResultView result={detail.result} />}
      {detail.attempts.length > 1 && (
        <details className="mt-3 rounded-xl border bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            Histórico de versões
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {detail.attempts.map((attempt) => (
              <li key={attempt.attempt}>
                {attempt.attempt}ª versão · {essayModeLabels[attempt.mode]}
                {attempt.submittedAt
                  ? ` · enviada em ${formatDateTime(attempt.submittedAt)}`
                  : ' · rascunho'}
                {attempt.returnReason
                  ? ` · devolvida: ${attempt.returnReason}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ResultView({ result }: { result: NonNullable<Detail['result']> }) {
  return (
    <section
      aria-label="Correção"
      className="mt-3 rounded-xl border border-emerald-200 bg-white p-3"
    >
      <p className="text-xs font-semibold text-slate-500">
        Nota publicada em {formatDateTime(result.publishedAt)}
      </p>
      <p className="text-3xl font-bold text-emerald-800">
        {result.total}
        <span className="text-base font-normal text-slate-500">
          /{result.maxScore}
        </span>
      </p>
      {result.annulmentReason && (
        <p className="text-sm text-rose-700">
          Redação anulada: {result.annulmentReason}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {result.criteria.map((criterion) => (
          <li key={criterion.id} className="rounded-lg border p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-semibold">
                Competência {criterion.numeral}
              </span>
              <span className="ml-auto font-bold">
                {criterion.score ?? '—'}/{criterion.maxScore}
              </span>
            </div>
            <p className="text-xs text-slate-600">{criterion.title}</p>
            {criterion.level && (
              <p className="mt-1 text-xs italic text-slate-600">
                {criterion.level}
              </p>
            )}
            {criterion.feedback && (
              <p className="mt-2 whitespace-pre-line">{criterion.feedback}</p>
            )}
            {criterion.observations.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1">
                {criterion.observations.map((item) => (
                  <li
                    key={item}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {criterion.aiFeedback && (
              <p className="mt-2 rounded bg-violet-50 p-2 text-xs text-violet-900">
                <b>
                  Retorno complementar gerado por IA (liberado pelo professor):
                </b>{' '}
                {criterion.aiFeedback}
              </p>
            )}
          </li>
        ))}
      </ul>
      {(
        [
          ['Comentário do professor', result.comments],
          ['Pontos fortes', result.strengths],
          ['Pontos a melhorar', result.improvements],
          ['Sugestões de reescrita', result.rewriteSuggestions],
        ] as const
      )
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="mt-3 text-sm">
            <p className="font-semibold">{label}</p>
            <p className="whitespace-pre-line">{value}</p>
          </div>
        ))}
      {result.aiFeedback && (
        <div className="mt-3 rounded bg-violet-50 p-2 text-sm text-violet-900">
          <p className="font-semibold">Retorno complementar da IA</p>
          <p className="whitespace-pre-line">{result.aiFeedback}</p>
        </div>
      )}
    </section>
  );
}
