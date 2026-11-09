'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  EssayContentEditor,
  ImageFields,
  type EssayContentBlock,
  type EssayImageWidth,
} from './essay-content-editor';

export const essayViews = [
  'Banco de Temas',
  'Cadastrar Tema',
  'Gerar Folha',
  'Minhas Propostas',
  'Aplicar Redação',
  'Histórico',
] as const;
export type EssayView = (typeof essayViews)[number];

type MotivatingText = {
  title: string;
  content: EssayContentBlock[];
  author: string;
  source: string;
  bibliographicReference: string;
  url: string;
  imageDataUrl: string;
  imageAlt: string;
  imageCaption: string;
  imageWidth: EssayImageWidth;
};
type PromptStatus = 'draft' | 'published' | 'archived';
type EssayPrompt = {
  id?: string;
  title: string;
  theme: string;
  thematicAxis: string;
  category: string;
  referenceInstitution: string;
  referenceYear: number | null;
  essayType: string;
  productionCommand: string;
  studentGuidance: string;
  minLines: number;
  maxLines: number;
  keywords: string[];
  status: PromptStatus;
  revision?: number;
  canEdit?: boolean;
  owned?: boolean;
  authorName?: string;
  motivatingTexts: MotivatingText[];
};
type PromptSummary = Omit<EssayPrompt, 'motivatingTexts'> & {
  id: string;
  textsCount: number;
  applicationsCount: number;
  updatedAt: string;
};
type SheetTemplate = { id: string; label: string; description: string };
type Filters = {
  categories: string[];
  institutions: string[];
  years: number[];
  templates: SheetTemplate[];
};
type SchoolClass = {
  id: string;
  name: string;
  grade: string;
  schoolYear: number;
  students: number;
  schoolName?: string | null;
};
type ApplicationStatus = 'scheduled' | 'open' | 'closed' | 'cancelled';
type EssayApplication = {
  id: string;
  promptId: string;
  promptTitle: string;
  promptTheme: string;
  classId: string;
  className: string;
  classGrade: string;
  schoolYear: number;
  appliedOn: string;
  dueAt: string | null;
  status: ApplicationStatus;
  availableToStudents: boolean;
  sheetOptions: {
    template?: string;
    includeCriteria?: boolean;
    includeProposal?: boolean;
  };
  studentsCount: number;
  submittedCount: number;
  createdByName: string;
  canEdit: boolean;
  students?: Array<{
    id: string;
    studentId: string;
    number: number | null;
    name: string;
    status: string;
  }>;
};
type SheetOptions = {
  template: string;
  includeProposal: boolean;
  includeCriteria: boolean;
  duplex: boolean;
};

const statusLabels: Record<PromptStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};
const applicationLabels: Record<ApplicationStatus, string> = {
  scheduled: 'Agendada',
  open: 'Em andamento',
  closed: 'Encerrada',
  cancelled: 'Cancelada',
};
const defaultTemplates: SheetTemplate[] = [
  {
    id: 'enem-30-v1',
    label: 'Folha ENEM — 30 linhas',
    description:
      'Reprodução do modelo de referência: cabeçalho, informações e 30 linhas numeradas.',
  },
];
const essayTypes = [
  'dissertativo-argumentativo',
  'dissertativo-expositivo',
  'narrativo',
  'carta argumentativa',
  'artigo de opinião',
  'crônica',
  'relato',
];
const roman = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
];
const fieldClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function emptyText(): MotivatingText {
  return {
    title: '',
    content: [{ type: 'paragraph', text: '' }],
    author: '',
    source: '',
    bibliographicReference: '',
    url: '',
    imageDataUrl: '',
    imageAlt: '',
    imageCaption: '',
    imageWidth: 'large',
  };
}
function emptyPrompt(): EssayPrompt {
  return {
    title: '',
    theme: '',
    thematicAxis: '',
    category: '',
    referenceInstitution: '',
    referenceYear: new Date().getFullYear(),
    essayType: 'dissertativo-argumentativo',
    productionCommand: '',
    studentGuidance: '',
    minLines: 7,
    maxLines: 30,
    keywords: [],
    status: 'draft',
    motivatingTexts: [emptyText()],
  };
}
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formatDate = (value: string | null) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T12:00:00` : value,
      ).toLocaleDateString('pt-BR')
    : '—';

// Envia somente o que a API valida (sem campos de leitura como canEdit).
function promptPayload(prompt: EssayPrompt, status = prompt.status) {
  return {
    title: prompt.title,
    theme: prompt.theme,
    thematicAxis: prompt.thematicAxis,
    category: prompt.category,
    referenceInstitution: prompt.referenceInstitution,
    referenceYear: prompt.referenceYear || null,
    essayType: prompt.essayType,
    productionCommand: prompt.productionCommand,
    studentGuidance: prompt.studentGuidance,
    minLines: prompt.minLines,
    maxLines: prompt.maxLines,
    keywords: prompt.keywords,
    status: status === 'archived' ? 'draft' : status,
    revision: prompt.revision,
    motivatingTexts: prompt.motivatingTexts.map((text) => ({
      ...text,
      content: text.content
        .map((block) =>
          block.type === 'list'
            ? { ...block, items: block.items.filter((item) => item.trim()) }
            : block,
        )
        .filter((block) =>
          block.type === 'image'
            ? block.dataUrl
            : block.type === 'list'
              ? block.items.length
              : block.type === 'table'
                ? true
                : block.text.trim(),
        ),
    })),
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function printBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(frame);
}

function useEssayApi(apiUrl: string) {
  const request = useCallback(
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
  const pdf = useCallback(
    async (path: string, init?: RequestInit): Promise<Blob> => {
      const response = await apiFetch(`${apiUrl}/api/${path}`, {
        ...init,
        headers: init?.body
          ? { 'content-type': 'application/json' }
          : undefined,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || 'Não foi possível gerar o PDF.');
      }
      return response.blob();
    },
    [apiUrl],
  );
  return { request, pdf };
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

function Alert({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: 'error' | 'success';
}) {
  if (!message) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
    >
      {message}
    </p>
  );
}

function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-semibold text-slate-700">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

function PdfViewer({ blob, title }: { blob: Blob | null; title: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (!url) return null;
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-blue-700 underline"
      >
        Abrir em tela inteira
      </a>
      <iframe
        title={title}
        src={url}
        className="h-[70vh] min-h-[480px] w-full rounded-xl border border-slate-200 bg-white"
      />
    </div>
  );
}

function PreviewDialog({
  blob,
  onClose,
}: {
  blob: Blob | null;
  onClose: () => void;
}) {
  if (!blob) return null;
  return (
    <dialog
      open
      aria-modal="true"
      aria-label="Pré-visualização do PDF"
      className="fixed inset-0 z-50 m-0 flex size-full max-h-none max-w-none items-center justify-center border-0 bg-slate-950/40 p-0 sm:p-4"
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
    >
      <div className="max-h-dvh w-full max-w-5xl overflow-y-auto bg-white p-4 sm:rounded-2xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[var(--navy)]">
            Pré-visualização
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <PdfViewer blob={blob} title="Pré-visualização da folha de redação" />
      </div>
    </dialog>
  );
}

// ---------- Biblioteca ----------

function PromptLibrary({
  apiUrl,
  scope,
  onEdit,
  onSheet,
  onApply,
  onNew,
}: {
  apiUrl: string;
  scope: 'bank' | 'mine';
  onEdit: (id: string) => void;
  onSheet: (id: string) => void;
  onApply: (id: string) => void;
  onNew: () => void;
}) {
  const { request, pdf } = useEssayApi(apiUrl);
  const [items, setItems] = useState<PromptSummary[]>([]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [query, setQuery] = useState({
    q: '',
    keyword: '',
    category: '',
    institution: '',
    year: '',
    status: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Blob | null>(null);
  const [busyId, setBusyId] = useState('');
  const search = useMemo(() => {
    const params = new URLSearchParams({ scope });
    for (const [key, value] of Object.entries(query))
      if (value) params.set(key, value);
    return params.toString();
  }, [query, scope]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await request<PromptSummary[]>(`essay-prompts?${search}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [request, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    request<Filters>('essay-prompts/filters')
      .then(setFilters)
      .catch(() => undefined);
  }, [request]);
  async function act(
    id: string,
    action: () => Promise<unknown>,
    message: string,
  ) {
    setBusyId(id);
    setNotice('');
    setError('');
    try {
      await action();
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId('');
    }
  }
  const select = (
    key: keyof typeof query,
    label: string,
    options: Array<string | number>,
  ) => (
    <select
      aria-label={label}
      value={query[key]}
      onChange={(event) => setQuery({ ...query, [key]: event.target.value })}
      className={fieldClass}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Header
          title={scope === 'mine' ? 'Minhas propostas' : 'Banco de temas'}
          description={
            scope === 'mine'
              ? 'Temas que você cadastrou, incluindo rascunhos e arquivados. Edite, duplique, arquive ou gere folhas.'
              : 'Biblioteca de temas publicados na instituição. Pesquise, visualize, duplique para adaptar ou gere folhas a partir de um tema.'
          }
        />
        <Button onClick={onNew} className="mb-6">
          <Plus /> Cadastrar tema
        </Button>
      </div>
      <section
        aria-label="Filtros"
        className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div className="relative lg:col-span-2">
          <Search
            className="absolute top-2.5 left-2.5 size-4 text-slate-400"
            aria-hidden="true"
          />
          <Input
            aria-label="Pesquisar por título ou tema"
            value={query.q}
            onChange={(event) => setQuery({ ...query, q: event.target.value })}
            placeholder="Título ou tema"
            className="h-9 pl-8"
          />
        </div>
        <Input
          aria-label="Palavra-chave"
          value={query.keyword}
          onChange={(event) =>
            setQuery({ ...query, keyword: event.target.value })
          }
          placeholder="Palavra-chave"
          className="h-9"
        />
        {select('category', 'Categoria', filters?.categories || [])}
        {select('institution', 'Instituição', filters?.institutions || [])}
        {select('year', 'Ano', filters?.years || [])}
        {scope === 'mine' && (
          <select
            aria-label="Situação"
            value={query.status}
            onChange={(event) =>
              setQuery({ ...query, status: event.target.value })
            }
            className={fieldClass}
          >
            <option value="">Ativos (rascunho e publicados)</option>
            <option value="draft">Rascunhos</option>
            <option value="published">Publicados</option>
            <option value="archived">Arquivados</option>
          </select>
        )}
      </section>
      <Alert message={error} />
      <Alert message={notice} tone="success" />
      {loading && !items.length ? (
        <p className="text-sm text-slate-500">Carregando temas…</p>
      ) : !items.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold text-slate-700">
            Nenhum tema encontrado.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Ajuste os filtros ou cadastre um novo tema.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge
                  variant={
                    item.status === 'published' ? 'default' : 'secondary'
                  }
                >
                  {statusLabels[item.status]}
                </Badge>
                {item.referenceInstitution && (
                  <span>{item.referenceInstitution}</span>
                )}
                {item.referenceYear && <span>· {item.referenceYear}</span>}
                {item.category && <span>· {item.category}</span>}
              </div>
              <h2 className="font-display mt-2 text-lg font-bold text-[var(--navy)]">
                {item.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{item.theme}</p>
              <p className="mt-2 text-xs text-slate-500">
                {item.textsCount}{' '}
                {item.textsCount === 1
                  ? 'texto motivador'
                  : 'textos motivadores'}{' '}
                · {item.minLines}–{item.maxLines} linhas · {item.essayType}
                {item.applicationsCount
                  ? ` · aplicado ${item.applicationsCount}×`
                  : ''}{' '}
                · por {item.owned ? 'você' : item.authorName}
              </p>
              {item.keywords.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {item.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {keyword}
                    </span>
                  ))}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id}
                  onClick={() =>
                    act(
                      item.id,
                      async () =>
                        setPreview(
                          await pdf('essay-sheets/pdf', {
                            method: 'POST',
                            body: JSON.stringify({
                              promptId: item.id,
                              includeProposal: true,
                              includeCriteria: false,
                            }),
                          }),
                        ),
                      '',
                    )
                  }
                >
                  <Eye /> Visualizar
                </Button>
                {item.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSheet(item.id)}
                  >
                    <FileText /> Gerar folha
                  </Button>
                )}
                {item.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApply(item.id)}
                  >
                    <Send /> Aplicar
                  </Button>
                )}
                {item.canEdit && item.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(item.id)}
                  >
                    <Pencil /> Editar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id}
                  onClick={() =>
                    act(
                      item.id,
                      () =>
                        request(`essay-prompts/${item.id}/duplicate`, {
                          method: 'POST',
                        }),
                      'Tema duplicado como rascunho em Minhas propostas.',
                    )
                  }
                >
                  <Copy /> Duplicar
                </Button>
                {item.canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === item.id}
                    onClick={() =>
                      act(
                        item.id,
                        () =>
                          request(`essay-prompts/${item.id}/status`, {
                            method: 'POST',
                            body: JSON.stringify({
                              status:
                                item.status === 'archived'
                                  ? 'draft'
                                  : 'archived',
                            }),
                          }),
                        item.status === 'archived'
                          ? 'Tema restaurado como rascunho.'
                          : 'Tema arquivado.',
                      )
                    }
                  >
                    {item.status === 'archived' ? (
                      <ArchiveRestore />
                    ) : (
                      <Archive />
                    )}
                    {item.status === 'archived' ? 'Restaurar' : 'Arquivar'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <PreviewDialog blob={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

// ---------- Cadastro ----------

function PromptEditor({
  apiUrl,
  promptId,
  onSaved,
  onNew,
  onSheet,
  onApply,
}: {
  apiUrl: string;
  promptId: string;
  onSaved: (id: string) => void;
  onNew: () => void;
  onSheet: (id: string) => void;
  onApply: (id: string) => void;
}) {
  const { request, pdf } = useEssayApi(apiUrl);
  const [prompt, setPrompt] = useState<EssayPrompt>(emptyPrompt);
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(Boolean(promptId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Blob | null>(null);
  useEffect(() => {
    if (!promptId) return;
    let active = true;
    request<EssayPrompt>(`essay-prompts/${promptId}`)
      .then((data) => {
        if (!active) return;
        setPrompt(data);
        setKeywords(data.keywords.join(', '));
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [promptId, request]);
  const readOnly =
    Boolean(prompt.id && !prompt.canEdit) || prompt.status === 'archived';
  const set = <K extends keyof EssayPrompt>(key: K, value: EssayPrompt[K]) =>
    setPrompt((current) => ({ ...current, [key]: value }));
  const setText = (index: number, value: Partial<MotivatingText>) =>
    setPrompt((current) => ({
      ...current,
      motivatingTexts: current.motivatingTexts.map((text, i) =>
        i === index ? { ...text, ...value } : text,
      ),
    }));
  const moveText = (index: number, offset: number) =>
    setPrompt((current) => {
      const texts = [...current.motivatingTexts];
      const [item] = texts.splice(index, 1);
      texts.splice(index + offset, 0, item);
      return { ...current, motivatingTexts: texts };
    });
  const current = () => ({
    ...prompt,
    keywords: keywords
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  });
  async function save(status: PromptStatus) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = JSON.stringify(promptPayload(current(), status));
      const saved = prompt.id
        ? await request<EssayPrompt>(`essay-prompts/${prompt.id}`, {
            method: 'PUT',
            body,
          })
        : await request<EssayPrompt>('essay-prompts', { method: 'POST', body });
      setPrompt(saved);
      setKeywords(saved.keywords.join(', '));
      setNotice(
        status === 'published'
          ? 'Tema salvo e publicado no banco de temas.'
          : 'Rascunho salvo.',
      );
      onSaved(saved.id!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  async function showPreview() {
    setSaving(true);
    setError('');
    try {
      setPreview(
        await pdf('essay-sheets/pdf', {
          method: 'POST',
          body: JSON.stringify({
            prompt: promptPayload(current()),
            includeProposal: true,
            includeCriteria: true,
          }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return <p className="text-sm text-slate-500">Carregando tema…</p>;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Header
          title={prompt.id ? 'Editar tema' : 'Cadastrar tema'}
          description="Dados da proposta, comando de produção, orientações e textos motivadores. A folha em PDF usa exatamente este conteúdo."
        />
        {prompt.id && (
          <Button variant="outline" className="mb-6" onClick={onNew}>
            <Plus /> Novo tema
          </Button>
        )}
      </div>
      <Alert message={error} />
      <Alert message={notice} tone="success" />
      {readOnly && (
        <Alert
          message={
            prompt.status === 'archived'
              ? 'Este tema está arquivado. Restaure-o em Minhas propostas para editar.'
              : 'Somente o autor ou a coordenação pode editar este tema. Use “Duplicar” no banco de temas para criar sua versão.'
          }
        />
      )}
      <fieldset disabled={readOnly || saving} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="font-display mb-4 text-lg font-bold text-[var(--navy)]">
            Dados da proposta
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Título *">
              <Input
                value={prompt.title}
                maxLength={200}
                onChange={(event) => set('title', event.target.value)}
                className="h-9"
                required
              />
            </Field>
            <Field label="Tema central *">
              <Input
                value={prompt.theme}
                maxLength={400}
                onChange={(event) => set('theme', event.target.value)}
                className="h-9"
                required
              />
            </Field>
            <Field label="Eixo temático">
              <Input
                value={prompt.thematicAxis}
                maxLength={160}
                onChange={(event) => set('thematicAxis', event.target.value)}
                className="h-9"
                placeholder="Ex.: Meio ambiente"
              />
            </Field>
            <Field label="Categoria">
              <Input
                value={prompt.category}
                maxLength={120}
                onChange={(event) => set('category', event.target.value)}
                className="h-9"
                placeholder="Ex.: Sociedade"
              />
            </Field>
            <Field label="Instituição de referência">
              <Input
                value={prompt.referenceInstitution}
                maxLength={160}
                onChange={(event) =>
                  set('referenceInstitution', event.target.value)
                }
                className="h-9"
                placeholder="Ex.: ENEM, FUVEST, autoral"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Ano">
                <Input
                  type="number"
                  min={1900}
                  max={2100}
                  value={prompt.referenceYear ?? ''}
                  onChange={(event) =>
                    set(
                      'referenceYear',
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  className="h-9"
                />
              </Field>
              <Field label="Tipo de redação">
                <select
                  value={prompt.essayType}
                  onChange={(event) => set('essayType', event.target.value)}
                  className={fieldClass}
                >
                  {[...new Set([prompt.essayType, ...essayTypes])].map(
                    (type) => (
                      <option key={type}>{type}</option>
                    ),
                  )}
                </select>
              </Field>
            </div>
            <Field
              label="Comando de produção textual"
              className="md:col-span-2"
              hint="Obrigatório para publicar. Use **negrito** e *itálico* para destacar trechos."
            >
              <Textarea
                rows={5}
                maxLength={6000}
                value={prompt.productionCommand}
                onChange={(event) =>
                  set('productionCommand', event.target.value)
                }
              />
            </Field>
            <Field
              label="Orientações ao estudante"
              className="md:col-span-2"
              hint="Uma orientação por linha. O limite de linhas é acrescentado automaticamente."
            >
              <Textarea
                rows={4}
                maxLength={4000}
                value={prompt.studentGuidance}
                onChange={(event) => set('studentGuidance', event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mínimo de linhas">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={prompt.minLines}
                  onChange={(event) =>
                    set('minLines', Number(event.target.value))
                  }
                  className="h-9"
                />
              </Field>
              <Field label="Máximo de linhas">
                <Input
                  type="number"
                  min={5}
                  max={90}
                  value={prompt.maxLines}
                  onChange={(event) =>
                    set('maxLines', Number(event.target.value))
                  }
                  className="h-9"
                />
              </Field>
            </div>
            <Field
              label="Palavras-chave"
              hint="Separadas por vírgula; usadas na pesquisa do banco de temas."
            >
              <Input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                className="h-9"
                placeholder="cidadania, tecnologia"
              />
            </Field>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-[var(--navy)]">
              Textos motivadores
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={prompt.motivatingTexts.length >= 12}
              onClick={() =>
                set('motivatingTexts', [...prompt.motivatingTexts, emptyText()])
              }
            >
              <Plus /> Adicionar texto
            </Button>
          </div>
          {!prompt.motivatingTexts.length && (
            <p className="text-sm text-slate-500">
              Nenhum texto motivador. A proposta terá apenas o comando e as
              orientações.
            </p>
          )}
          <ol className="space-y-4">
            {prompt.motivatingTexts.map((text, index) => (
              <li
                key={index}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4"
              >
                <div className="mb-3 flex items-center gap-1">
                  <h3 className="font-bold text-[var(--navy)]">
                    Texto {roman[index] || index + 1}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Mover texto ${index + 1} para cima`}
                    disabled={index === 0}
                    onClick={() => moveText(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Mover texto ${index + 1} para baixo`}
                    disabled={index === prompt.motivatingTexts.length - 1}
                    onClick={() => moveText(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover texto ${index + 1}`}
                    onClick={() =>
                      set(
                        'motivatingTexts',
                        prompt.motivatingTexts.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Título">
                    <Input
                      value={text.title}
                      maxLength={200}
                      onChange={(event) =>
                        setText(index, { title: event.target.value })
                      }
                      className="h-9 bg-white"
                    />
                  </Field>
                  <Field label="Autor">
                    <Input
                      value={text.author}
                      maxLength={200}
                      onChange={(event) =>
                        setText(index, { author: event.target.value })
                      }
                      className="h-9 bg-white"
                    />
                  </Field>
                  <Field label="Fonte">
                    <Input
                      value={text.source}
                      maxLength={300}
                      onChange={(event) =>
                        setText(index, { source: event.target.value })
                      }
                      className="h-9 bg-white"
                      placeholder="Veículo, livro ou órgão"
                    />
                  </Field>
                  <Field label="URL">
                    <Input
                      type="url"
                      value={text.url}
                      maxLength={1000}
                      onChange={(event) =>
                        setText(index, { url: event.target.value })
                      }
                      className="h-9 bg-white"
                      placeholder="https://"
                    />
                  </Field>
                  <Field
                    label="Referência bibliográfica"
                    className="md:col-span-2"
                  >
                    <Input
                      value={text.bibliographicReference}
                      maxLength={1000}
                      onChange={(event) =>
                        setText(index, {
                          bibliographicReference: event.target.value,
                        })
                      }
                      className="h-9 bg-white"
                      placeholder="SOBRENOME, Nome. Título. Cidade: Editora, ano."
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-slate-700">
                    Conteúdo
                  </p>
                  <EssayContentEditor
                    blocks={text.content}
                    onError={setError}
                    onChange={(content) => setText(index, { content })}
                  />
                </div>
                <details className="mt-4" open={Boolean(text.imageDataUrl)}>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    Imagem opcional (gráfico, charge, infográfico)
                  </summary>
                  <div className="mt-3">
                    <ImageFields
                      dataUrl={text.imageDataUrl}
                      alt={text.imageAlt}
                      caption={text.imageCaption}
                      width={text.imageWidth}
                      onError={setError}
                      onChange={(value) =>
                        setText(index, {
                          imageDataUrl: value.dataUrl,
                          imageAlt: value.alt,
                          imageCaption: value.caption,
                          imageWidth: value.width,
                        })
                      }
                    />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>
      </fieldset>
      <div className="sticky bottom-20 z-10 mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
        <Button variant="outline" disabled={saving} onClick={showPreview}>
          <Eye /> Pré-visualizar PDF
        </Button>
        {!readOnly && (
          <>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => save('draft')}
            >
              Salvar rascunho
            </Button>
            <Button disabled={saving} onClick={() => save('published')}>
              {saving ? 'Salvando…' : 'Salvar e publicar'}
            </Button>
          </>
        )}
        {prompt.id && prompt.status !== 'archived' && (
          <span className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="ghost" onClick={() => onSheet(prompt.id!)}>
              <FileText /> Gerar folha
            </Button>
            <Button variant="ghost" onClick={() => onApply(prompt.id!)}>
              <Send /> Aplicar à turma
            </Button>
          </span>
        )}
      </div>
      <PreviewDialog blob={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

// ---------- Seleção de tema e modelo ----------

function usePromptOptions(apiUrl: string) {
  const { request } = useEssayApi(apiUrl);
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [templates, setTemplates] = useState<SheetTemplate[]>(defaultTemplates);
  useEffect(() => {
    request<PromptSummary[]>('essay-prompts?scope=bank')
      .then(setPrompts)
      .catch(() => undefined);
    request<Filters>('essay-prompts/filters')
      .then((data) => setTemplates(data.templates))
      .catch(() => undefined);
  }, [request]);
  return { prompts, templates };
}

function SheetOptionsFields({
  templates,
  value,
  onChange,
  maxLines,
  stacked = false,
}: {
  templates: SheetTemplate[];
  value: SheetOptions;
  onChange: (value: SheetOptions) => void;
  maxLines?: number;
  stacked?: boolean;
}) {
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">
          Modelo da folha
        </legend>
        <div className={`grid gap-2 ${stacked ? '' : 'md:grid-cols-2'}`}>
          {templates.map((template) => (
            <label
              key={template.id}
              aria-label={template.label}
              htmlFor={`essay-template-${template.id}`}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${value.template === template.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}
            >
              <input
                id={`essay-template-${template.id}`}
                type="radio"
                name="essay-template"
                checked={value.template === template.id}
                onChange={() => onChange({ ...value, template: template.id })}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold">{template.label}</span>
                <span className="text-xs text-slate-500">
                  {template.description}
                  {template.id === 'linhas-do-tema-v1' && maxLines
                    ? ` Este tema: ${maxLines} linhas.`
                    : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.includeProposal}
            onChange={(event) =>
              onChange({ ...value, includeProposal: event.target.checked })
            }
          />
          Incluir a proposta (textos motivadores e comando)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.includeCriteria}
            onChange={(event) =>
              onChange({ ...value, includeCriteria: event.target.checked })
            }
          />
          Incluir critérios de avaliação (competências ENEM)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.duplex}
            disabled={!value.includeProposal}
            onChange={(event) =>
              onChange({ ...value, duplex: event.target.checked })
            }
          />
          Impressão frente e verso (folha começa em página ímpar)
        </label>
      </div>
    </div>
  );
}

function SheetGenerator({
  apiUrl,
  promptId,
  teacherName,
}: {
  apiUrl: string;
  promptId: string;
  teacherName: string;
}) {
  const { request, pdf } = useEssayApi(apiUrl);
  const { prompts, templates } = usePromptOptions(apiUrl);
  const [selectedId, setSelectedId] = useState(promptId);
  const [detail, setDetail] = useState<EssayPrompt | null>(null);
  const [options, setOptions] = useState<SheetOptions>({
    template: 'enem-30-v1',
    includeProposal: true,
    includeCriteria: true,
    duplex: false,
  });
  const [header, setHeader] = useState({
    teacherName,
    className: '',
    date: '',
    studentName: '',
  });
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobKey, setBlobKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    request<EssayPrompt>(`essay-prompts/${selectedId}`)
      .then((data) => active && setDetail(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [request, selectedId]);
  const body = JSON.stringify({ promptId: selectedId, ...options, ...header });
  const stale = Boolean(blob) && blobKey !== body;
  async function generate() {
    if (!selectedId) return setError('Selecione um tema.');
    setBusy(true);
    setError('');
    try {
      const result = await pdf('essay-sheets/pdf', { method: 'POST', body });
      setBlob(result);
      setBlobKey(body);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const current = async () => (blob && !stale ? blob : generate());
  const lines = options.template === 'enem-30-v1' ? 30 : detail?.maxLines || 30;
  const step = (number: number, title: string, children: React.ReactNode) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-[var(--navy)]">
        <span className="grid size-6 place-items-center rounded-full bg-[var(--navy)] text-xs text-white">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
  return (
    <div>
      <Header
        title="Gerar folha"
        description="Escolha o tema e o modelo, confira a pré-visualização — que é o próprio PDF final — e baixe ou imprima."
      />
      <Alert message={error} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          {step(
            1,
            'Tema',
            <select
              aria-label="Tema"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Selecione um tema</option>
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.title}
                  {prompt.status === 'draft' ? ' (rascunho)' : ''}
                </option>
              ))}
            </select>,
          )}
          {step(
            2,
            'Modelo e conteúdo',
            <SheetOptionsFields
              stacked
              templates={templates}
              value={options}
              onChange={setOptions}
              maxLines={detail?.maxLines}
            />,
          )}
          {step(
            3,
            'Cabeçalho (opcional)',
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Estudante">
                <Input
                  value={header.studentName}
                  maxLength={160}
                  onChange={(event) =>
                    setHeader({ ...header, studentName: event.target.value })
                  }
                  className="h-9"
                  placeholder="Em branco para preencher à mão"
                />
              </Field>
              <Field label="Professor(a)">
                <Input
                  value={header.teacherName}
                  maxLength={160}
                  onChange={(event) =>
                    setHeader({ ...header, teacherName: event.target.value })
                  }
                  className="h-9"
                />
              </Field>
              <Field label="Série/Turma">
                <Input
                  value={header.className}
                  maxLength={120}
                  onChange={(event) =>
                    setHeader({ ...header, className: event.target.value })
                  }
                  className="h-9"
                />
              </Field>
              <Field label="Data">
                <Input
                  type="date"
                  value={header.date}
                  onChange={(event) =>
                    setHeader({ ...header, date: event.target.value })
                  }
                  className="h-9"
                />
              </Field>
            </div>,
          )}
          {step(
            4,
            'Conferir e gerar',
            <div className="space-y-3 text-sm">
              <ul className="space-y-1 text-slate-600">
                <li>
                  ✓ Proposta:{' '}
                  {options.includeProposal
                    ? `${detail?.motivatingTexts.length ?? 0} texto(s) motivador(es), comando e orientações`
                    : 'não incluída'}
                </li>
                <li>
                  ✓ Folha pautada: {lines} linhas numeradas
                  {lines > 30
                    ? ` (${Math.ceil((lines - 30) / 39) + 1} páginas)`
                    : ''}
                </li>
                <li>
                  ✓ Critérios de avaliação:{' '}
                  {options.includeCriteria
                    ? 'incluídos (competências I a V)'
                    : 'não incluídos'}
                </li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !selectedId} onClick={generate}>
                  <Eye />{' '}
                  {busy
                    ? 'Gerando…'
                    : blob && !stale
                      ? 'Atualizar pré-visualização'
                      : 'Visualizar documento'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !selectedId}
                  onClick={async () => {
                    const result = await current();
                    if (result) downloadBlob(result, 'folha-de-redacao.pdf');
                  }}
                >
                  <Download /> Baixar PDF
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !selectedId}
                  onClick={async () => {
                    const result = await current();
                    if (result) printBlob(result);
                  }}
                >
                  <Printer /> Imprimir
                </Button>
              </div>
              {stale && (
                <p className="text-xs text-amber-700">
                  As opções mudaram: o download e a impressão vão gerar o PDF
                  novamente.
                </p>
              )}
            </div>,
          )}
        </div>
        <div className="min-w-0">
          {blob ? (
            <PdfViewer
              blob={blob}
              title="Pré-visualização da folha de redação"
            />
          ) : (
            <div className="grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              A pré-visualização mostra o PDF exatamente como será baixado e
              impresso.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Aplicação ----------

function ApplyEssay({
  apiUrl,
  promptId,
  teacherName,
  onHistory,
}: {
  apiUrl: string;
  promptId: string;
  teacherName: string;
  onHistory: () => void;
}) {
  const { request, pdf } = useEssayApi(apiUrl);
  const { prompts, templates } = usePromptOptions(apiUrl);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [form, setForm] = useState({
    promptId,
    classId: '',
    appliedOn: today(),
    dueAt: '',
    availableToStudents: true,
    teacherName,
  });
  const [options, setOptions] = useState<SheetOptions>({
    template: 'enem-30-v1',
    includeProposal: true,
    includeCriteria: true,
    duplex: false,
  });
  const [result, setResult] = useState<EssayApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    request<SchoolClass[]>('classes')
      .then(setClasses)
      .catch((e) => setError(e.message));
  }, [request]);
  const selectedPrompt = prompts.find((prompt) => prompt.id === form.promptId);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      setResult(
        await request<EssayApplication>('essay-applications', {
          method: 'POST',
          body: JSON.stringify({ ...form, ...options }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function sheets() {
    if (!result) return;
    setBusy(true);
    try {
      downloadBlob(
        await pdf(`essay-applications/${result.id}/sheets.pdf`),
        `folhas-redacao-${result.className}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <div>
        <Header title="Aplicar redação" description="Aplicação registrada." />
        <Alert message={error} />
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-display text-lg font-bold text-emerald-900">
            {result.promptTitle}
          </h2>
          <p className="mt-1 text-sm text-emerald-900">
            Turma {result.classGrade} — {result.className} · aplicação em{' '}
            {formatDate(result.appliedOn)}
            {result.dueAt ? ` · prazo ${formatDate(result.dueAt)}` : ''} ·{' '}
            {result.studentsCount} aluno(s)
            {result.availableToStudents
              ? ' · disponível no portal do aluno'
              : ''}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={sheets}>
              <Download />{' '}
              {busy ? 'Gerando folhas…' : 'Baixar folhas individuais'}
            </Button>
            <Button variant="outline" onClick={onHistory}>
              Ver histórico
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Nova aplicação
            </Button>
          </div>
        </section>
      </div>
    );
  return (
    <div>
      <Header
        title="Aplicar redação"
        description="Escolha a turma e o tema. Cada aluno ativo recebe uma folha nominal; a proposta fica congelada para o histórico, mesmo que o tema seja editado depois."
      />
      <Alert message={error} />
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tema *">
            <select
              value={form.promptId}
              onChange={(event) =>
                setForm({ ...form, promptId: event.target.value })
              }
              className={fieldClass}
            >
              <option value="">Selecione um tema</option>
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.title}
                  {prompt.status === 'draft' ? ' (rascunho)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Turma *"
            hint={
              classes.length ? undefined : 'Cadastre turmas em Turmas e alunos.'
            }
          >
            <select
              value={form.classId}
              onChange={(event) =>
                setForm({ ...form, classId: event.target.value })
              }
              className={fieldClass}
            >
              <option value="">Selecione uma turma</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.grade} — {item.name} ({item.schoolYear}) ·{' '}
                  {item.students} aluno(s)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data de aplicação *">
            <Input
              type="date"
              value={form.appliedOn}
              onChange={(event) =>
                setForm({ ...form, appliedOn: event.target.value })
              }
              className="h-9"
            />
          </Field>
          <Field label="Prazo de entrega">
            <Input
              type="date"
              value={form.dueAt}
              min={form.appliedOn}
              onChange={(event) =>
                setForm({ ...form, dueAt: event.target.value })
              }
              className="h-9"
            />
          </Field>
          <Field label="Professor(a) no cabeçalho">
            <Input
              value={form.teacherName}
              maxLength={160}
              onChange={(event) =>
                setForm({ ...form, teacherName: event.target.value })
              }
              className="h-9"
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={form.availableToStudents}
              onChange={(event) =>
                setForm({ ...form, availableToStudents: event.target.checked })
              }
            />
            Disponibilizar a proposta no portal do aluno
          </label>
        </div>
        <SheetOptionsFields
          templates={templates}
          value={options}
          onChange={setOptions}
          maxLines={selectedPrompt?.maxLines}
        />
        <Button
          disabled={busy || !form.promptId || !form.classId || !form.appliedOn}
          onClick={submit}
        >
          <Send /> {busy ? 'Registrando…' : 'Registrar aplicação'}
        </Button>
      </section>
    </div>
  );
}

// ---------- Histórico ----------

function ApplicationHistory({ apiUrl }: { apiUrl: string }) {
  const { request, pdf } = useEssayApi(apiUrl);
  const [items, setItems] = useState<EssayApplication[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<EssayApplication | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setItems(
        await request<EssayApplication[]>(
          `essay-applications${classId ? `?classId=${classId}` : ''}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId, request]);
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
    request<SchoolClass[]>('classes')
      .then(setClasses)
      .catch(() => undefined);
  }, [request]);
  const detailRequest = useRef(0);
  async function toggle(id: string) {
    if (openId === id) return setOpenId('');
    setOpenId(id);
    setDetail(null);
    const ticket = ++detailRequest.current;
    try {
      const data = await request<EssayApplication>(`essay-applications/${id}`);
      if (ticket === detailRequest.current) setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function update(
    item: EssayApplication,
    body: Partial<Pick<EssayApplication, 'status' | 'availableToStudents'>>,
  ) {
    if (
      body.status === 'cancelled' &&
      !window.confirm(
        'Cancelar esta aplicação? As folhas deixam de ser geradas e o aluno não verá mais a proposta.',
      )
    )
      return;
    setBusy(item.id);
    setError('');
    try {
      const data = await request<EssayApplication>(
        `essay-applications/${item.id}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      if (openId === item.id) setDetail(data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }
  async function download(
    item: EssayApplication,
    studentId?: string,
    name?: string,
  ) {
    setBusy(studentId || item.id);
    setError('');
    try {
      downloadBlob(
        await pdf(
          `essay-applications/${item.id}/sheets.pdf${studentId ? `?studentId=${studentId}` : ''}`,
        ),
        `folha-redacao-${(name || item.className).replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div>
      <Header
        title="Histórico"
        description="Aplicações anteriores por turma, com folhas individuais para reimpressão e situação de cada aluno."
      />
      <div className="mb-4 max-w-sm">
        <select
          aria-label="Filtrar por turma"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className={fieldClass}
        >
          <option value="">Todas as turmas</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.grade} — {item.name} ({item.schoolYear})
            </option>
          ))}
        </select>
      </div>
      <Alert message={error} />
      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !items.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma redação aplicada ainda.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-slate-200 bg-white"
            >
              <button
                type="button"
                aria-expanded={openId === item.id}
                onClick={() => toggle(item.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--navy)]">
                    {item.promptTitle}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {item.classGrade} — {item.className} ({item.schoolYear}) ·
                    aplicada em {formatDate(item.appliedOn)}
                    {item.dueAt
                      ? ` · prazo ${formatDate(item.dueAt)}`
                      : ''} ·
                    por {item.createdByName}
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {item.studentsCount} aluno(s)
                </span>
                {item.availableToStudents && (
                  <Badge variant="outline">No portal do aluno</Badge>
                )}
                <Badge
                  variant={
                    item.status === 'cancelled'
                      ? 'destructive'
                      : item.status === 'open'
                        ? 'default'
                        : 'secondary'
                  }
                >
                  {applicationLabels[item.status]}
                </Badge>
              </button>
              {openId === item.id && (
                <div className="border-t border-slate-100 p-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {item.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        disabled={busy === item.id}
                        onClick={() => download(item)}
                      >
                        <Download /> Folhas da turma
                      </Button>
                    )}
                    {item.canEdit && item.status !== 'cancelled' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === item.id}
                          onClick={() =>
                            update(item, {
                              availableToStudents: !item.availableToStudents,
                            })
                          }
                        >
                          {item.availableToStudents
                            ? 'Ocultar do portal do aluno'
                            : 'Disponibilizar ao aluno'}
                        </Button>
                        {item.status !== 'closed' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === item.id}
                            onClick={() => update(item, { status: 'closed' })}
                          >
                            Encerrar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === item.id}
                            onClick={() => update(item, { status: 'open' })}
                          >
                            Reabrir
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === item.id}
                          onClick={() => update(item, { status: 'cancelled' })}
                        >
                          Cancelar aplicação
                        </Button>
                      </>
                    )}
                  </div>
                  {!detail ? (
                    <p className="text-sm text-slate-500">Carregando alunos…</p>
                  ) : !detail.students?.length ? (
                    <p className="text-sm text-slate-500">
                      Nenhum aluno ativo na turma no momento da aplicação.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {detail.students.map((student) => (
                        <li
                          key={student.id}
                          className="flex items-center gap-3 py-2"
                        >
                          <span className="w-8 text-xs text-slate-500">
                            {student.number ?? '—'}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {student.name}
                          </span>
                          <span className="hidden text-xs text-slate-500 sm:inline">
                            {student.status === 'pending'
                              ? 'Aguardando entrega'
                              : student.status}
                          </span>
                          {item.status !== 'cancelled' && (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy === student.studentId}
                              onClick={() =>
                                download(item, student.studentId, student.name)
                              }
                            >
                              <Download /> Folha
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EssayManager({
  apiUrl,
  view,
  teacherName,
  onNavigate,
}: {
  apiUrl: string;
  view: EssayView;
  teacherName: string;
  onNavigate: (view: EssayView) => void;
}) {
  const [editingId, setEditingId] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const go = (next: EssayView) => {
    onNavigate(next);
    window.scrollTo({ top: 0 });
  };
  const edit = (id: string) => {
    setEditingId(id);
    setEditorKey((key) => key + 1);
    go('Cadastrar Tema');
  };
  const sheet = (id: string) => {
    setSelectedId(id);
    go('Gerar Folha');
  };
  const apply = (id: string) => {
    setSelectedId(id);
    go('Aplicar Redação');
  };
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      {view === 'Banco de Temas' || view === 'Minhas Propostas' ? (
        <PromptLibrary
          key={view}
          apiUrl={apiUrl}
          scope={view === 'Minhas Propostas' ? 'mine' : 'bank'}
          onEdit={edit}
          onSheet={sheet}
          onApply={apply}
          onNew={() => edit('')}
        />
      ) : view === 'Cadastrar Tema' ? (
        <PromptEditor
          key={editorKey}
          apiUrl={apiUrl}
          promptId={editingId}
          onSaved={setEditingId}
          onNew={() => edit('')}
          onSheet={sheet}
          onApply={apply}
        />
      ) : view === 'Gerar Folha' ? (
        <SheetGenerator
          key={selectedId}
          apiUrl={apiUrl}
          promptId={selectedId}
          teacherName={teacherName}
        />
      ) : view === 'Aplicar Redação' ? (
        <ApplyEssay
          key={selectedId}
          apiUrl={apiUrl}
          promptId={selectedId}
          teacherName={teacherName}
          onHistory={() => go('Histórico')}
        />
      ) : (
        <ApplicationHistory apiUrl={apiUrl} />
      )}
    </div>
  );
}
