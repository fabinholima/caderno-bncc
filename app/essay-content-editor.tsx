'use client';

import { useRef } from 'react';
import Image from 'next/image';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Heading,
  ImagePlus,
  Italic,
  List,
  Pilcrow,
  Quote,
  Table,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type EssayImageWidth = 'small' | 'medium' | 'large' | 'full';
export type EssayContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: boolean; rows: string[][] }
  | {
      type: 'image';
      dataUrl: string;
      alt: string;
      caption: string;
      width: EssayImageWidth;
    };

export const imageWidthLabels: Record<EssayImageWidth, string> = {
  small: 'Pequena (35%)',
  medium: 'Média (55%)',
  large: 'Grande (75%)',
  full: 'Largura total',
};

const MAX_IMAGE_BYTES = 1_500_000;
const dataUrlBytes = (value: string) =>
  Math.floor(((value.length - value.indexOf(',') - 1) * 3) / 4);

// Reencoda a imagem no navegador: remove metadados, limita a 1800 px e
// garante PNG/JPEG de até 1,5 MB, os únicos formatos aceitos pela API.
export async function prepareEssayImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type))
    throw new Error('Use imagens PNG, JPEG, WebP ou GIF.');
  if (file.size > 15_000_000)
    throw new Error('A imagem original deve ter no máximo 15 MB.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível ler a imagem.');
  });
  try {
    const attempts: Array<[number, string, number]> = [
      [1800, 'image/png', 1],
      [1800, 'image/jpeg', 0.88],
      [1400, 'image/jpeg', 0.8],
      [1000, 'image/jpeg', 0.72],
    ];
    for (const [side, type, quality] of attempts) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) break;
      if (type === 'image/jpeg') {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const value = canvas.toDataURL(type, quality);
      if (dataUrlBytes(value) <= MAX_IMAGE_BYTES) return value;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('Não foi possível reduzir a imagem para 1,5 MB.');
}

export function ImagePicker({
  label,
  onPick,
  onError,
}: {
  label: string;
  onPick: (dataUrl: string) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label={label}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            onPick(await prepareEssayImage(file));
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => input.current?.click()}
      >
        <ImagePlus aria-hidden="true" /> {label}
      </Button>
    </>
  );
}

function wrapSelection(
  element: HTMLTextAreaElement | null,
  marker: string,
  onChange: (value: string) => void,
) {
  if (!element) return;
  const { selectionStart: start, selectionEnd: end, value } = element;
  const selected = value.slice(start, end) || 'texto';
  onChange(
    `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`,
  );
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(
      start + marker.length,
      start + marker.length + selected.length,
    );
  });
}

function TextBlockEditor({
  block,
  onChange,
}: {
  block: Extract<EssayContentBlock, { text: string }>;
  onChange: (block: EssayContentBlock) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const label =
    block.type === 'heading'
      ? 'Título'
      : block.type === 'quote'
        ? 'Citação'
        : 'Parágrafo';
  if (block.type === 'heading')
    return (
      <Input
        aria-label={label}
        value={block.text}
        maxLength={300}
        placeholder="Subtítulo do texto"
        className="font-semibold"
        onChange={(event) => onChange({ ...block, text: event.target.value })}
      />
    );
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Negrito"
          title="Negrito (**texto**)"
          onClick={() =>
            wrapSelection(area.current, '**', (text) =>
              onChange({ ...block, text }),
            )
          }
        >
          <Bold aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Itálico"
          title="Itálico (*texto*)"
          onClick={() =>
            wrapSelection(area.current, '*', (text) =>
              onChange({ ...block, text }),
            )
          }
        >
          <Italic aria-hidden="true" />
        </Button>
      </div>
      <Textarea
        ref={area}
        aria-label={label}
        value={block.text}
        maxLength={block.type === 'quote' ? 4000 : 8000}
        rows={block.type === 'quote' ? 3 : 4}
        className={block.type === 'quote' ? 'border-l-4 italic' : ''}
        onChange={(event) => onChange({ ...block, text: event.target.value })}
      />
    </div>
  );
}

function TableEditor({
  block,
  onChange,
}: {
  block: Extract<EssayContentBlock, { type: 'table' }>;
  onChange: (block: EssayContentBlock) => void;
}) {
  const columns = Math.max(...block.rows.map((row) => row.length));
  const setCell = (rowIndex: number, column: number, value: string) =>
    onChange({
      ...block,
      rows: block.rows.map((row, index) =>
        index === rowIndex
          ? Array.from({ length: columns }, (_, c) =>
              c === column ? value : (row[c] ?? ''),
            )
          : row,
      ),
    });
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }, (_, column) => (
                  <td key={column} className="border border-slate-200 p-1">
                    <input
                      aria-label={`Linha ${rowIndex + 1}, coluna ${column + 1}`}
                      value={row[column] ?? ''}
                      maxLength={500}
                      onChange={(event) =>
                        setCell(rowIndex, column, event.target.value)
                      }
                      className={`w-full rounded px-1 py-1 outline-none focus:bg-blue-50 ${rowIndex === 0 && block.header ? 'font-semibold' : ''}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={block.rows.length >= 40}
          onClick={() =>
            onChange({
              ...block,
              rows: [...block.rows, Array(columns).fill('')],
            })
          }
        >
          + Linha
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={block.rows.length <= 1}
          onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}
        >
          − Linha
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={columns >= 8}
          onClick={() =>
            onChange({ ...block, rows: block.rows.map((row) => [...row, '']) })
          }
        >
          + Coluna
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={columns <= 1}
          onClick={() =>
            onChange({
              ...block,
              rows: block.rows.map((row) => row.slice(0, columns - 1)),
            })
          }
        >
          − Coluna
        </Button>
        <label className="ml-auto flex items-center gap-1">
          <input
            type="checkbox"
            checked={block.header}
            onChange={(event) =>
              onChange({ ...block, header: event.target.checked })
            }
          />
          Primeira linha é cabeçalho
        </label>
      </div>
    </div>
  );
}

export function ImageFields({
  dataUrl,
  alt,
  caption,
  width,
  onChange,
  onError,
}: {
  dataUrl: string;
  alt: string;
  caption: string;
  width: EssayImageWidth;
  onChange: (value: {
    dataUrl: string;
    alt: string;
    caption: string;
    width: EssayImageWidth;
  }) => void;
  onError: (message: string) => void;
}) {
  const value = { dataUrl, alt, caption, width };
  return (
    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
      <div className="grid min-h-28 place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
        {dataUrl ? (
          <Image
            src={dataUrl}
            alt={alt || 'Pré-visualização da imagem'}
            width={320}
            height={200}
            unoptimized
            className="max-h-40 w-full object-contain"
          />
        ) : (
          <span className="px-2 text-center text-xs text-slate-500">
            Nenhuma imagem
          </span>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <ImagePicker
            label={dataUrl ? 'Trocar imagem' : 'Enviar imagem'}
            onPick={(next) => onChange({ ...value, dataUrl: next })}
            onError={onError}
          />
          {dataUrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...value, dataUrl: '' })}
            >
              Remover imagem
            </Button>
          )}
        </div>
        <Input
          aria-label="Descrição da imagem (acessibilidade)"
          placeholder="Descrição da imagem (acessibilidade)"
          value={alt}
          maxLength={300}
          onChange={(event) => onChange({ ...value, alt: event.target.value })}
        />
        <Input
          aria-label="Legenda"
          placeholder="Legenda impressa abaixo da imagem"
          value={caption}
          maxLength={400}
          onChange={(event) =>
            onChange({ ...value, caption: event.target.value })
          }
        />
        <select
          aria-label="Largura da imagem na folha"
          value={width}
          onChange={(event) =>
            onChange({ ...value, width: event.target.value as EssayImageWidth })
          }
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
        >
          {Object.entries(imageWidthLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const blockLabels: Record<EssayContentBlock['type'], string> = {
  paragraph: 'Parágrafo',
  heading: 'Título',
  quote: 'Citação',
  list: 'Lista',
  table: 'Tabela',
  image: 'Imagem',
};

export function EssayContentEditor({
  blocks,
  onChange,
  onError,
}: {
  blocks: EssayContentBlock[];
  onChange: (blocks: EssayContentBlock[]) => void;
  onError: (message: string) => void;
}) {
  const update = (index: number, block: EssayContentBlock) =>
    onChange(blocks.map((item, i) => (i === index ? block : item)));
  const move = (index: number, offset: number) => {
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    onChange(next);
  };
  const add = (block: EssayContentBlock) => onChange([...blocks, block]);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <div className="mb-2 flex items-center gap-1">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {blockLabels[block.type]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="ml-auto"
              aria-label="Mover bloco para cima"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Mover bloco para baixo"
              disabled={index === blocks.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remover bloco"
              onClick={() => onChange(blocks.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          {block.type === 'list' ? (
            <div className="space-y-2">
              <Textarea
                aria-label="Itens da lista, um por linha"
                rows={3}
                value={block.items.join('\n')}
                onChange={(event) =>
                  update(index, {
                    ...block,
                    items: event.target.value.split('\n'),
                  })
                }
              />
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={block.ordered}
                  onChange={(event) =>
                    update(index, { ...block, ordered: event.target.checked })
                  }
                />
                Lista numerada (um item por linha)
              </label>
            </div>
          ) : block.type === 'table' ? (
            <TableEditor
              block={block}
              onChange={(next) => update(index, next)}
            />
          ) : block.type === 'image' ? (
            <ImageFields
              {...block}
              onError={onError}
              onChange={(value) => update(index, { ...block, ...value })}
            />
          ) : (
            <TextBlockEditor
              block={block}
              onChange={(next) => update(index, next)}
            />
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2" aria-label="Adicionar bloco">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => add({ type: 'paragraph', text: '' })}
        >
          <Pilcrow aria-hidden="true" /> Parágrafo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => add({ type: 'heading', text: '' })}
        >
          <Heading aria-hidden="true" /> Título
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => add({ type: 'quote', text: '' })}
        >
          <Quote aria-hidden="true" /> Citação
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => add({ type: 'list', ordered: false, items: [''] })}
        >
          <List aria-hidden="true" /> Lista
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            add({
              type: 'table',
              header: true,
              rows: [
                ['', ''],
                ['', ''],
              ],
            })
          }
        >
          <Table aria-hidden="true" /> Tabela
        </Button>
        <ImagePicker
          label="Imagem"
          onError={onError}
          onPick={(dataUrl) =>
            add({
              type: 'image',
              dataUrl,
              alt: '',
              caption: '',
              width: 'large',
            })
          }
        />
      </div>
    </div>
  );
}
