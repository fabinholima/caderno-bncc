'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  RichContentEditor,
  type RichContentBlock,
} from './rich-content-editor';

export type SharedTextSummary = {
  id: string;
  title: string;
  source: string;
  preview: string;
  questionCount: number;
  keepLineBreaks?: boolean;
  lineNumbering?: boolean;
  fullWidth?: boolean;
};

type SharedTextDetail = SharedTextSummary & { content: RichContentBlock[] };

const contentField = 'sharedTextContentBlocks';

// O seletor fica dentro do formulário da questão: Enter não pode salvá-la.
const keepFormOpen = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.preventDefault();
};

// Mesma limpeza aplicada ao enunciado: descarta blocos vazios do editor.
function meaningfulBlocks(blocks: RichContentBlock[]) {
  return blocks.filter((block) => {
    if (block.type === 'paragraph' || block.type === 'contextRaw')
      return Boolean(('text' in block ? block.text : block.code)?.trim());
    if (block.type === 'romanList')
      return block.items.some((item) => item.trim());
    return true;
  });
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      error?: string;
      issues?: Array<{ message: string }>;
    };
    return (
      [body.error, ...(body.issues || []).map((issue) => issue.message)]
        .filter(Boolean)
        .join('\n') || fallback
    );
  } catch {
    return fallback;
  }
}

/**
 * Vínculo opcional do item a um texto-base compartilhado. Desmarcado (o caso
 * mais comum), o formulário fica exatamente como antes.
 */
export function SharedTextPicker({
  apiUrl,
  value,
  onChange,
  linkedQuestionId = '',
  judgment = false,
}: {
  apiUrl: string;
  value: SharedTextSummary | null;
  onChange: (value: SharedTextSummary | null) => void;
  /** Questão em edição: não conta como "outro item" que usa o texto. */
  linkedQuestionId?: string;
  /** Itens Certo/Errado ("itens") ou demais tipos ("questões"). */
  judgment?: boolean;
}) {
  const words = judgment
    ? {
        one: 'item',
        many: 'itens',
        other: 'outro item',
        others: 'outros itens',
        this: 'Este item',
        twoOrMore: 'dois ou mais itens',
        heading: 'Texto para os itens X a Y',
        exclusive: 'deste item fica na contextualização abaixo',
      }
    : {
        one: 'questão',
        many: 'questões',
        other: 'outra questão',
        others: 'outras questões',
        this: 'Esta questão',
        twoOrMore: 'duas ou mais questões',
        heading: 'Texto para as questões X a Y',
        exclusive: 'desta questão fica no próprio enunciado',
      };
  const count = (total: number) =>
    `${total} ${total === 1 ? words.one : words.many}`;
  const [enabled, setEnabled] = useState(Boolean(value));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SharedTextSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{
    id: string;
    title: string;
    source: string;
    content: RichContentBlock[];
    keepLineBreaks: boolean;
    lineNumbering: boolean;
    fullWidth: boolean;
    otherQuestions: number;
  } | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // oxlint-disable-next-line react-compiler -- Reabre o vínculo ao carregar uma questão ou rascunho.
    if (value) setEnabled(true);
  }, [value]);

  useEffect(() => {
    if (!enabled || value || editor) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await apiFetch(
          `${apiUrl}/api/questions/shared-texts?q=${encodeURIComponent(query)}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok)
          throw new Error(
            await readError(response, 'Não foi possível buscar textos-base.'),
          );
        const body = (await response.json()) as { data: SharedTextSummary[] };
        setResults(body.data);
        setError('');
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Não foi possível buscar textos-base.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [apiUrl, enabled, value, editor, query]);

  const usedBy = value
    ? Math.max(0, value.questionCount - (linkedQuestionId ? 1 : 0))
    : 0;

  function openEditor(detail?: SharedTextDetail) {
    setError('');
    setEditor({
      id: detail?.id || '',
      title: detail?.title || '',
      source: detail?.source || '',
      content: detail?.content || [],
      keepLineBreaks: detail?.keepLineBreaks === true,
      lineNumbering: detail?.lineNumbering === true,
      fullWidth: detail?.fullWidth === true,
      otherQuestions: detail
        ? Math.max(0, detail.questionCount - (linkedQuestionId ? 1 : 0))
        : 0,
    });
    setEditorKey((key) => key + 1);
  }

  async function editCurrent() {
    if (!value) return;
    setError('');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/questions/shared-texts/${value.id}`,
        { cache: 'no-store' },
      );
      if (!response.ok)
        throw new Error(
          await readError(response, 'Não foi possível abrir o texto-base.'),
        );
      const body = (await response.json()) as { data: SharedTextDetail };
      openEditor(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível abrir o texto-base.',
      );
    }
  }

  async function saveEditor() {
    if (!editor) return;
    const raw = editorRef.current?.querySelector<HTMLInputElement>(
      `input[name="${contentField}"]`,
    )?.value;
    const content = meaningfulBlocks(
      JSON.parse(raw || '[]') as RichContentBlock[],
    );
    if (!content.length) {
      setError('Escreva o conteúdo do texto-base antes de salvar.');
      return;
    }
    if (
      editor.id &&
      editor.otherQuestions > 0 &&
      !window.confirm(
        `Esta alteração aparece também em ${editor.otherQuestions} ${editor.otherQuestions === 1 ? words.other : words.others} que usam este texto-base. Provas já geradas não mudam. Continuar?`,
      )
    )
      return;
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        editor.id
          ? `${apiUrl}/api/questions/shared-texts/${editor.id}`
          : `${apiUrl}/api/questions/shared-texts`,
        {
          method: editor.id ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: editor.title,
            source: editor.source,
            content,
            keepLineBreaks: editor.keepLineBreaks,
            lineNumbering: editor.lineNumbering,
            fullWidth: editor.fullWidth,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          await readError(response, 'Não foi possível salvar o texto-base.'),
        );
      const body = (await response.json()) as { data: SharedTextSummary };
      onChange(body.data);
      setEditor(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível salvar o texto-base.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <input type="hidden" name="sharedTextId" value={value?.id || ''} />
      <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            if (!event.target.checked) {
              onChange(null);
              setEditor(null);
            }
          }}
        />
        <span>
          {words.this} faz parte de um grupo com texto-base comum
          <span className="block text-xs font-normal text-slate-500">
            Use só quando o mesmo texto servir a {words.twoOrMore}. Texto
            exclusivo {words.exclusive}.
          </span>
        </span>
      </label>

      {enabled && editor && (
        <div
          ref={editorRef}
          className="space-y-3 rounded-lg border border-blue-200 bg-white p-3"
        >
          <p className="text-sm font-semibold text-slate-900">
            {editor.id ? 'Editar texto-base' : 'Novo texto-base'}
          </p>
          {editor.id && editor.otherQuestions > 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              Este texto é usado por mais {count(editor.otherQuestions)}. A
              alteração aparece em {judgment ? 'todos eles' : 'todas elas'}.
            </p>
          )}
          <label className="block text-xs font-medium text-slate-600">
            Título (opcional)
            <input
              className="mt-1 w-full rounded-lg border p-2 text-sm"
              maxLength={300}
              onKeyDown={keepFormOpen}
              value={editor.title}
              onChange={(event) =>
                setEditor({ ...editor, title: event.target.value })
              }
              placeholder="Ex.: De próprio punho"
            />
          </label>
          <RichContentEditor
            apiUrl={apiUrl}
            name={contentField}
            label="Conteúdo do texto-base"
            allowRawContext
            rawOnly
            initialBlocks={editor.content}
            resetKey={editorKey}
          />
          <label className="block text-xs font-medium text-slate-600">
            Fonte / crédito (opcional)
            <input
              className="mt-1 w-full rounded-lg border p-2 text-sm"
              maxLength={500}
              onKeyDown={keepFormOpen}
              value={editor.source}
              onChange={(event) =>
                setEditor({ ...editor, source: event.target.value })
              }
              placeholder="Ex.: Disponível em: ... Acesso em: ..."
            />
          </label>
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
            <legend className="px-1 font-medium text-slate-600">
              Linhas e largura
            </legend>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={editor.keepLineBreaks}
                onChange={(event) =>
                  setEditor({ ...editor, keepLineBreaks: event.target.checked })
                }
              />
              <span>
                Manter as quebras de linha do original
                <span className="block text-slate-500">
                  Cada linha digitada vira uma linha impressa. Use para poemas e
                  para textos transcritos linha a linha. Linha em branco separa
                  estrofes ou parágrafos.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={editor.lineNumbering}
                onChange={(event) =>
                  setEditor({ ...editor, lineNumbering: event.target.checked })
                }
              />
              <span>
                Numerar as linhas
                <span className="block text-slate-500">
                  Para {words.many} que citam linhas, como &quot;(l. 3-4)&quot;.
                  O texto sai em largura total, mesmo em provas de duas colunas.
                </span>
              </span>
            </label>
            {editor.lineNumbering && !editor.keepLineBreaks && (
              <p role="note" className="rounded bg-amber-50 p-2 text-amber-900">
                Sem manter as quebras do original, a numeração segue a largura
                da página e pode não coincidir com as linhas citadas nas{' '}
                {words.many}. Para provas como o ENEM, marque também a opção
                acima e digite o texto linha a linha.
              </p>
            )}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={editor.fullWidth || editor.lineNumbering}
                disabled={editor.lineNumbering}
                onChange={(event) =>
                  setEditor({ ...editor, fullWidth: event.target.checked })
                }
              />
              <span>
                Sempre em largura total (uma coluna)
                <span className="block text-slate-500">
                  {editor.lineNumbering
                    ? 'Texto com linhas numeradas já sai em largura total.'
                    : `Em provas de duas colunas, o texto ocupa a largura da página e as ${words.many} seguem nas colunas. Use para textos longos, tabelas e figuras largas. Também é possível escolher isso só em uma prova, na montagem.`}
                </span>
              </span>
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveEditor}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Salvar texto-base'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditor(null);
                setError('');
              }}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {enabled && !editor && value && (
        <div className="rounded-lg border border-blue-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">
            Texto-base: {value.title || 'Sem título'}
            {value.source ? (
              <span className="font-normal text-slate-500">
                {' '}
                · {value.source}
              </span>
            ) : null}
          </p>
          <p className="mt-1 line-clamp-3 text-xs text-slate-600">
            {value.preview}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {usedBy
              ? `Usado também por ${count(usedBy)}.`
              : `Ainda não usado por ${words.others}.`}{' '}
            Na prova, o texto sai uma vez antes do grupo, com o título &quot;
            {words.heading}&quot;.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={editCurrent}
              className="rounded-md border px-2 py-1"
            >
              Ver / editar texto
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-md border px-2 py-1"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setEnabled(false);
              }}
              className="rounded-md border px-2 py-1 text-red-700"
            >
              Desvincular
            </button>
          </div>
        </div>
      )}

      {enabled && !editor && !value && (
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <input
            type="search"
            onKeyDown={keepFormOpen}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar texto-base (título, fonte ou trecho)…"
            aria-label="Buscar texto-base"
            className="w-full rounded-lg border p-2 text-sm"
          />
          {loading && <p className="text-xs text-slate-500">Buscando…</p>}
          {!loading && !results.length && (
            <p className="text-xs text-slate-500">
              Nenhum texto-base encontrado.
            </p>
          )}
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {results.map((text) => (
              <li key={text.id}>
                <button
                  type="button"
                  onClick={() => onChange(text)}
                  className="w-full rounded-md border border-transparent p-2 text-left hover:border-blue-200 hover:bg-blue-50"
                >
                  <span className="block text-sm font-medium text-slate-900">
                    {text.title || 'Sem título'}
                    <span className="font-normal text-slate-500">
                      {text.source ? ` · ${text.source}` : ''} ·{' '}
                      {count(text.questionCount)}
                    </span>
                  </span>
                  <span className="line-clamp-2 block text-xs text-slate-600">
                    {text.preview}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => openEditor()}
            className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700"
          >
            + Criar novo texto-base
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="whitespace-pre-line text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
