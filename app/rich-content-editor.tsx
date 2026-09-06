'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

export type RichContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'romanList'; items: string[] }
  | { type: 'math'; tex: string; display: boolean }
  | { type: 'contextFormula'; code: string }
  | { type: 'contextInline'; code: string }
  | {
      type: 'chemical';
      formula: string;
      display: boolean;
      conditionAbove: string;
      conditionBelow: string;
    }
  | {
      type: 'thermochemicalEquation';
      equation: string;
      temperature: string;
      enthalpy: string;
    }
  | {
      type: 'chemicalStructure';
      preset?: 'benzene' | 'cyclohexane';
      smiles?: string;
      caption: string;
      approved?: boolean;
      originalDataUrl?: string;
      svgDataUrl?: string;
    }
  | { type: 'image'; dataUrl: string; alt: string; caption: string };

export function RichContentEditor({
  name,
  label,
  required = false,
  compact = false,
  initialBlocks,
  resetKey,
  apiUrl,
}: {
  name: string;
  label?: string;
  required?: boolean;
  compact?: boolean;
  initialBlocks?: RichContentBlock[];
  resetKey?: number;
  apiUrl: string;
}) {
  const [blocks, setBlocks] = useState<RichContentBlock[]>([
    { type: 'paragraph', text: '' },
  ]);
  const [structureLoading, setStructureLoading] = useState<number | null>(null);
  useEffect(() => {
    setBlocks(
      initialBlocks?.length ? initialBlocks : [{ type: 'paragraph', text: '' }],
    );
  }, [initialBlocks, resetKey]);
  const update = (index: number, patch: Partial<RichContentBlock>) =>
    setBlocks((current) =>
      current.map((block, position) =>
        position === index
          ? ({ ...block, ...patch } as RichContentBlock)
          : block,
      ),
    );
  const add = (type: RichContentBlock['type']) =>
    setBlocks((current) => [
      ...current,
      type === 'paragraph'
        ? { type, text: '' }
        : type === 'romanList'
          ? { type, items: [''] }
          : type === 'thermochemicalEquation'
            ? {
                type,
                equation: '2HI(g) -> H_2(g) + I_2(g)',
                temperature: '25 degrees celsius',
                enthalpy: '-51,9 kilo joule',
              }
            : type === 'contextFormula'
              ? { type, code: '\\chemical{} ' }
              : type === 'contextInline'
                ? { type, code: '\\chemical{H_2}' }
                : type === 'math'
                  ? { type, tex: '', display: true }
                  : type === 'chemical'
                    ? {
                        type,
                        formula: '',
                        display: true,
                        conditionAbove: '',
                        conditionBelow: '',
                      }
                    : type === 'chemicalStructure'
                      ? {
                          type,
                          smiles: 'c1ccccc1',
                          caption: '',
                          approved: false,
                        }
                      : { type, dataUrl: '', alt: '', caption: '' },
    ]);

  const previewStructure = async (index: number, smiles: string) => {
    setStructureLoading(index);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/chemistry/structures/preview`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ smiles }),
        },
      );
      const body = (await response.json()) as {
        data?: { canonicalSmiles: string; svgDataUrl: string };
        error?: string;
      };
      if (!response.ok || !body.data)
        throw new Error(body.error || 'Não foi possível desenhar a estrutura.');
      update(index, {
        smiles: body.data.canonicalSmiles,
        svgDataUrl: body.data.svgDataUrl,
        approved: false,
      });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : 'Estrutura química inválida.',
      );
    } finally {
      setStructureLoading(null);
    }
  };

  const selectImage = (index: number, file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      window.alert('Escolha uma imagem PNG ou JPEG.');
      return;
    }
    if (file.size > 400_000) {
      window.alert('A imagem deve ter no máximo 400 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      update(index, {
        dataUrl: typeof reader.result === 'string' ? reader.result : '',
        alt: file.name.replace(/\.[^.]+$/, ''),
      });
    reader.readAsDataURL(file);
  };

  const selectStructureOriginal = (index: number, file?: File) => {
    if (!file) return;
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size > 400_000
    ) {
      window.alert('Escolha uma imagem PNG ou JPEG de até 400 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      update(index, {
        originalDataUrl: typeof reader.result === 'string' ? reader.result : '',
      });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      {label && <span className="block text-sm font-semibold">{label}</span>}
      <input type="hidden" name={name} value={JSON.stringify(blocks)} />
      {blocks.map((block, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 bg-white p-2"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {block.type === 'paragraph'
                ? 'Texto'
                : block.type === 'romanList'
                  ? 'Lista romana'
                  : block.type === 'thermochemicalEquation'
                    ? 'Equação termoquímica'
                    : block.type === 'contextFormula'
                      ? 'ConTeXt da fórmula'
                      : block.type === 'contextInline'
                        ? 'ConTeXt em linha'
                        : block.type === 'math'
                          ? 'Matemática'
                          : block.type === 'chemical'
                            ? 'Química'
                            : block.type === 'chemicalStructure'
                              ? 'Estrutura orgânica'
                              : 'Imagem'}
            </span>
            {blocks.length > 1 && (
              <button
                type="button"
                aria-label="Remover bloco"
                onClick={() =>
                  setBlocks((current) => current.filter((_, i) => i !== index))
                }
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          {block.type === 'paragraph' && (
            <textarea
              aria-label={
                required && index === 0
                  ? 'Texto inicial opcional quando houver outro bloco'
                  : undefined
              }
              value={block.text}
              onChange={(event) => update(index, { text: event.target.value })}
              rows={compact ? 3 : 7}
              className="w-full resize-y rounded-lg border-0 p-2 text-sm leading-6 outline-none ring-1 ring-slate-200 focus:ring-blue-400"
              placeholder="Digite o texto..."
            />
          )}
          {block.type === 'paragraph' && (
            <p className="mt-1 text-xs text-slate-500">
              No próprio texto: <code>\\chemical{'{C\\ell_{2}}'}</code>,{' '}
              <code>\\unit{'{kilo joule inverse mol}'}</code> e{' '}
              <code>\\m{'{\\frac{a}{b} + \\Delta H}'}</code>.
            </p>
          )}
          {block.type === 'romanList' && (
            <textarea
              required
              value={block.items.join('\n')}
              onChange={(event) =>
                update(index, { items: event.target.value.split('\n') })
              }
              rows={compact ? 4 : 6}
              className="w-full resize-y rounded-lg border-0 p-2 text-sm leading-6 outline-none ring-1 ring-slate-200 focus:ring-blue-400"
              placeholder={
                'Um item por linha\nO ConTeXt aplicará I, II, III...'
              }
            />
          )}
          {block.type === 'thermochemicalEquation' && (
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                required
                value={block.equation}
                onChange={(event) =>
                  update(index, { equation: event.target.value })
                }
                className="font-mono text-xs md:col-span-2"
                placeholder="2HI(g) -> H_2(g) + I_2(g)"
              />
              <Input
                required
                value={block.temperature}
                onChange={(event) =>
                  update(index, { temperature: event.target.value })
                }
                className="font-mono text-xs"
                placeholder="25 degrees celsius"
              />
              <Input
                required
                value={block.enthalpy}
                onChange={(event) =>
                  update(index, { enthalpy: event.target.value })
                }
                className="font-mono text-xs"
                placeholder="-51,9 kilo joule"
              />
            </div>
          )}
          {block.type === 'contextFormula' && (
            <div className="space-y-2">
              <textarea
                required
                value={block.code}
                onChange={(event) =>
                  update(index, { code: event.target.value })
                }
                rows={compact ? 4 : 8}
                spellCheck={false}
                className="w-full resize-y rounded-lg bg-slate-950 p-3 font-mono text-xs leading-6 text-cyan-100 outline-none ring-1 ring-slate-700 focus:ring-blue-400"
                placeholder="\\chemical{} \\chemical{2HI(g)} \\chemical{GIVES} ... \\unit{18,4 g}"
              />
              <p className="text-xs text-slate-500">
                Use unidades dentro de <code>\\unit{'{valor unidade}'}</code>.
                Abreviações como g, kg, mg, mol, mL, J, kJ e °C são convertidas
                automaticamente.
              </p>
            </div>
          )}
          {block.type === 'contextInline' && (
            <div className="space-y-2">
              <Input
                required
                value={block.code}
                onChange={(event) =>
                  update(index, { code: event.target.value })
                }
                className="font-mono text-xs"
                placeholder="\\chemical{H_2}, \\chemical{Cl_2} ou \\unit{kilo joule inverse mol}"
              />
              <p className="text-xs text-slate-500">
                Inserido na mesma linha dos blocos de texto vizinhos. Aceita
                apenas comandos científicos seguros.
              </p>
            </div>
          )}
          {block.type === 'math' && (
            <div className="space-y-2">
              <Input
                required
                value={block.tex}
                onChange={(event) => update(index, { tex: event.target.value })}
                className="font-mono text-xs"
                placeholder={'\\frac{n}{V} = \\frac{m}{M \\cdot V}'}
              />
              <LayoutChoice
                value={block.display}
                onChange={(display) => update(index, { display })}
              />
            </div>
          )}
          {block.type === 'chemical' && (
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                required
                value={block.formula}
                onChange={(event) =>
                  update(index, { formula: event.target.value })
                }
                className="font-mono text-xs md:col-span-2"
                placeholder="2H_2 + O_2 -> 2H_2O"
              />
              <Input
                value={block.conditionAbove}
                onChange={(event) =>
                  update(index, { conditionAbove: event.target.value })
                }
                placeholder="Sobre a seta: 450 °C"
              />
              <Input
                value={block.conditionBelow}
                onChange={(event) =>
                  update(index, { conditionBelow: event.target.value })
                }
                placeholder="Sob a seta: Pt"
              />
              <LayoutChoice
                value={block.display}
                onChange={(display) => update(index, { display })}
              />
            </div>
          )}
          {block.type === 'chemicalStructure' && (
            <div className="space-y-3">
              {block.preset && !block.smiles ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    value={block.preset}
                    onChange={(event) =>
                      update(index, {
                        preset: event.target.value as 'benzene' | 'cyclohexane',
                      })
                    }
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="benzene">Benzeno</option>
                    <option value="cyclohexane">Ciclo-hexano</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      update(index, {
                        preset: undefined,
                        smiles:
                          block.preset === 'cyclohexane'
                            ? 'C1CCCCC1'
                            : 'c1ccccc1',
                        approved: false,
                      })
                    }
                  >
                    Converter para editor SMILES
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      required
                      value={block.smiles || ''}
                      onChange={(event) =>
                        update(index, {
                          smiles: event.target.value,
                          approved: false,
                          svgDataUrl: undefined,
                        })
                      }
                      className="font-mono text-xs"
                      placeholder="Ex.: CC(=O)Oc1ccccc1C(=O)O"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={structureLoading === index || !block.smiles}
                      onClick={() =>
                        previewStructure(index, block.smiles || '')
                      }
                    >
                      {structureLoading === index
                        ? 'Desenhando...'
                        : 'Gerar prévia'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    O servidor valida o SMILES e produz um SVG monocromático. A
                    aprovação é obrigatória para substituir o recorte original.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <StructurePreview
                      title="Imagem original"
                      source={block.originalDataUrl}
                      empty="Adicione o recorte original para conferência."
                    >
                      <label className="mt-2 inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium">
                        <ImagePlus className="size-3.5" />
                        {block.originalDataUrl
                          ? 'Trocar original'
                          : 'Adicionar original'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="sr-only"
                          onChange={(event) =>
                            selectStructureOriginal(
                              index,
                              event.target.files?.[0],
                            )
                          }
                        />
                      </label>
                    </StructurePreview>
                    <StructurePreview
                      title="Redesenho vetorial"
                      source={block.svgDataUrl}
                      empty="Gere a prévia a partir do SMILES."
                    >
                      {block.svgDataUrl && (
                        <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                          <input
                            type="checkbox"
                            checked={Boolean(block.approved)}
                            onChange={(event) =>
                              update(index, { approved: event.target.checked })
                            }
                          />
                          Conferi ligações, cargas e estereoquímica; aprovar SVG
                        </label>
                      )}
                    </StructurePreview>
                  </div>
                </>
              )}
              <Input
                value={block.caption}
                onChange={(event) =>
                  update(index, { caption: event.target.value })
                }
                placeholder="Legenda opcional"
              />
            </div>
          )}
          {block.type === 'image' && (
            <div className="space-y-2">
              {block.dataUrl && (
                <Image
                  src={block.dataUrl}
                  alt={block.alt}
                  width={900}
                  height={500}
                  unoptimized
                  className="max-h-56 rounded-lg border border-slate-200 object-contain"
                />
              )}
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ImagePlus className="size-4" />
                {block.dataUrl ? 'Trocar imagem' : 'Escolher imagem'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={(event) =>
                    selectImage(index, event.target.files?.[0])
                  }
                />
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  required
                  value={block.alt}
                  onChange={(event) =>
                    update(index, { alt: event.target.value })
                  }
                  placeholder="Descrição acessível da imagem"
                />
                <Input
                  value={block.caption}
                  onChange={(event) =>
                    update(index, { caption: event.target.value })
                  }
                  placeholder="Legenda opcional"
                />
              </div>
              <p className="text-xs text-slate-400">PNG ou JPEG, até 400 KB.</p>
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            'paragraph',
            'romanList',
            'thermochemicalEquation',
            'contextFormula',
            'contextInline',
            'math',
            'chemical',
            'chemicalStructure',
            'image',
          ] as const
        ).map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add(type)}
          >
            <Plus className="size-3.5" />
            {type === 'paragraph'
              ? 'Texto'
              : type === 'romanList'
                ? 'Lista I, II, III'
                : type === 'thermochemicalEquation'
                  ? 'Equação termoquímica'
                  : type === 'contextFormula'
                    ? 'ConTeXt da fórmula'
                    : type === 'contextInline'
                      ? 'ConTeXt em linha'
                      : type === 'math'
                        ? 'Fórmula'
                        : type === 'chemical'
                          ? 'Química'
                          : type === 'chemicalStructure'
                            ? 'Estrutura'
                            : 'Imagem'}
          </Button>
        ))}
      </div>
    </div>
  );
}

function LayoutChoice({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      Exibir em linha separada
    </label>
  );
}

function StructurePreview({
  title,
  source,
  empty,
  children,
}: {
  title: string;
  source?: string;
  empty: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-2 grid min-h-40 place-items-center rounded-lg bg-white p-2">
        {source ? (
          <Image
            src={source}
            alt={title}
            width={520}
            height={300}
            unoptimized
            className="max-h-52 w-full object-contain"
          />
        ) : (
          <p className="px-4 text-center text-xs text-slate-400">{empty}</p>
        )}
      </div>
      {children}
    </div>
  );
}
