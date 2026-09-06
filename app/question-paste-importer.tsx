'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ClipboardPaste,
  ImagePlus,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RichContentBlock } from './rich-content-editor';

export type ParsedQuestion = {
  sourceInstitution: string;
  sourceYear: string;
  statementBlocks: RichContentBlock[];
  alternatives: Record<string, RichContentBlock[]>;
  warnings: string[];
};

const valuePattern = /-?\d+(?:[.,]\d+)?\s*(?:%|g)\b/gi;

const chemicalTokenPattern =
  /\b(?:H2O|CO2|NH3|HCl|NaOH|NaCl|LiOH|AgBr|NaBr|CaCl2|CaSO4|MgSO4|KNO3|CdS|SO2|SO3|NO2|NO|CO|O2|H2|Cl2|Br2|F2|N2|HI|KCl|CuO|[A-Z][A-Za-z0-9()]*\d+[A-Za-z0-9()]*)\b/g;

function inlineChemicalCode(value: string) {
  return value
    .replace(/Cl/g, 'C\\ell')
    .replace(/([A-Za-z})])(\d+)/g, '$1_{$2}');
}

function scientificInlineText(text: string, warnings: string[]) {
  let units = 0;
  let chemicals = 0;
  let value = text
    .replace(/(-?\d+(?:[.,]\d+)?)\s*mol\s*L[−-]1/gi, (_match, number) => {
      units += 1;
      return `\\unit{${number} mole inverse liter}`;
    })
    .replace(/(-?\d+(?:[.,]\d+)?)\s*kJ\s*mol[−-]1/gi, (_match, number) => {
      units += 1;
      return `\\unit{${number} kilo joule inverse mol}`;
    })
    .replace(/(-?\d+(?:[.,]\d+)?)\s*[°o0]\s*C\b/g, (_match, number) => {
      units += 1;
      return `\\unit{${number} degrees celsius}`;
    })
    .replace(
      /(-?\d+(?:[.,]\d+)?)\s*(kg|mg|g|mL|L|kJ|J|atm|Torr|mA|V|cm[23]|m[23])\b/g,
      (_match, number, unit) => {
        const names: Record<string, string> = {
          kg: 'kilogram',
          mg: 'milligram',
          g: 'gram',
          mL: 'milliliter',
          L: 'liter',
          kJ: 'kilo joule',
          J: 'joule',
          atm: 'atmosphere',
          Torr: 'torr',
          mA: 'milli ampere',
          V: 'volt',
          cm2: 'square centimeter',
          cm3: 'cubic centimeter',
          m2: 'square meter',
          m3: 'cubic meter',
        };
        units += 1;
        return `\\unit{${number} ${names[unit] || unit}}`;
      },
    )
    .replace(
      /\b(\d+(?:[.,]\d+)?)\s*[x×]\s*10[−-](\d+)\b/gi,
      (_match, coefficient, exponent) => {
        units += 1;
        return `\\unit{${coefficient}e-${exponent}}`;
      },
    )
    .replace(/\b10[−-](\d+)\b/g, (_match, exponent) => {
      units += 1;
      return `\\unit{1e-${exponent}}`;
    });
  value = value.replace(chemicalTokenPattern, (token, offset, source) => {
    if (source.slice(Math.max(0, offset - 12), offset).includes('\\'))
      return token;
    chemicals += 1;
    return `\\chemical{${inlineChemicalCode(token)}}`;
  });
  if (units) warnings.push(`${units} unidade(s) convertida(s) para \\unit{}.`);
  if (chemicals)
    warnings.push(`${chemicals} fórmula(s) convertida(s) para \\chemical{}.`);
  return value;
}

function romanItemsFromLine(line: string) {
  const markers = [...line.matchAll(/(?:^|\s)(I|II|III|IV|V)\.\s+/g)];
  if (markers.length < 2) return null;
  return markers.map((marker, index) => {
    const start = (marker.index || 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? line.length;
    return line.slice(start, end).trim();
  });
}

function chemicalCode(equation: string) {
  const normalized = equation
    .replace(/→/g, ' -> ')
    .replace(/\+/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
  return `\\chemical{} ${normalized
    .split(' ')
    .filter(Boolean)
    .map((part) =>
      part === '->'
        ? '\\chemical{GIVES}'
        : part === '+'
          ? '\\chemical{PLUS}'
          : `\\chemical{${inlineChemicalCode(part)}}`,
    )
    .join(' ')}`;
}

function unitPreview(value: string) {
  return value.replace(/\\unit\{\s*([^}]+?)\s*\}/g, '$1');
}

function inlineScientificBlocks(
  text: string,
  warnings: string[],
): RichContentBlock[] {
  return [{ type: 'paragraph', text: scientificInlineText(text, warnings) }];
}

function FormulaPreview({ code }: { code: string }) {
  const readable = unitPreview(code)
    .replace(/\\chemical\{\}/g, '')
    .replace(/\\chemical\{GIVES\}/g, ' → ')
    .replace(/\\chemical\{PLUS\}/g, ' + ')
    .replace(/\\chemical\{([^}]+)\}/g, '$1')
    .replace(/\\(?:qquad|quad)/g, '   ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/_/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    <div className="my-3 overflow-x-auto border-l-2 border-slate-300 py-2 pl-4 font-serif text-base">
      {readable}
    </div>
  );
}

function QuestionPreview({ value }: { value: ParsedQuestion }) {
  return (
    <article className="rounded-lg border border-slate-300 bg-white p-5 text-slate-950 shadow-sm">
      <div className="space-y-3 font-serif text-[15px] leading-7">
        {value.statementBlocks.map((block, index) => {
          if (block.type === 'paragraph')
            return (
              <p key={index}>
                {unitPreview(block.text)
                  .replace(/\\chemical\{([^}]+)\}/g, '$1')
                  .replace(/_/g, '')}
              </p>
            );
          if (block.type === 'contextFormula')
            return <FormulaPreview key={index} code={block.code} />;
          if (block.type === 'contextInline')
            return (
              <span key={index}>
                {unitPreview(block.code)
                  .replace(/\\chemical\{([^}]+)\}/g, '$1')
                  .replace(/_/g, '')}{' '}
              </span>
            );
          if (block.type === 'image')
            return (
              <figure key={index} className="my-4 text-center">
                <Image
                  src={block.dataUrl}
                  alt={block.alt}
                  width={900}
                  height={500}
                  unoptimized
                  className="mx-auto max-h-64 w-auto object-contain"
                />
                {block.caption && (
                  <figcaption className="mt-1 text-xs text-slate-500">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );
          if (block.type === 'romanList')
            return (
              <ol key={index} className="list-[upper-roman] pl-8">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            );
          if (block.type === 'thermochemicalEquation')
            return (
              <FormulaPreview
                key={index}
                code={`${chemicalCode(block.equation)} \\qquad ΔH(\\unit{${block.temperature}}) = \\unit{${block.enthalpy}}`}
              />
            );
          return (
            <FormulaPreview
              key={index}
              code={
                'tex' in block
                  ? block.tex
                  : 'formula' in block
                    ? block.formula
                    : ''
              }
            />
          );
        })}
      </div>
      <ol className="mt-4 space-y-2 font-serif text-[15px]" type="A">
        {Object.entries(value.alternatives)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, blocks]) => (
            <li key={label} className="ml-6 pl-1">
              {blocks.map((block, index) => (
                <span key={index}>
                  {block.type === 'paragraph' ? unitPreview(block.text) : ''}
                </span>
              ))}
            </li>
          ))}
      </ol>
    </article>
  );
}

export function parsePastedQuestion(raw: string): ParsedQuestion {
  const warnings: string[] = [];
  const alternatives: Record<string, RichContentBlock[]> = {};
  const normalized = raw
    .replace(/(?:^|\s)([A-E])\s*\(\s*\)\s*/g, '\n$1) ')
    .replace(/\t+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
  const sourceMatch = normalized.match(
    /^\.?\s*\(([^)\d-]+?)(?:\s*-\s*(\d{4}))?\)\s*/,
  );
  const sourceInstitution = sourceMatch?.[1]?.trim() || '';
  const sourceYear = sourceMatch?.[2] || '';
  let body = sourceMatch ? normalized.slice(sourceMatch[0].length) : normalized;
  body = body.replace(/^QUEST(?:ÃO|AO)\s*\d+\s*[.):-]?\s*/i, '');
  if (!sourceInstitution)
    warnings.push('Instituição de origem não identificada.');
  if (!sourceYear) warnings.push('Ano da prova não identificado.');

  const lines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const statementBlocks: RichContentBlock[] = [];
  const paragraphs: string[] = [];
  let inferredIndex = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const labeled = line.match(/^([a-e])[.)]\s*(.+)$/i);
    const numbered = line.match(/^\d+[.)]\s*(.+)$/);
    if (labeled || numbered) {
      const explicit = labeled?.[1]?.toUpperCase();
      const text = (labeled?.[2] || numbered?.[1] || '').trim();
      const values = text.match(valuePattern) || [text];
      for (const value of values) {
        const label =
          explicit && value === values[0]
            ? explicit
            : String.fromCharCode(65 + inferredIndex);
        alternatives[label] = [
          {
            type: 'paragraph',
            text: scientificInlineText(value.trim(), warnings),
          },
        ];
        inferredIndex = Math.max(inferredIndex, label.charCodeAt(0) - 64);
        if (!explicit || value !== values[0])
          warnings.push(
            `Alternativa ${label} reconstruída; confirme antes de salvar.`,
          );
      }
      continue;
    }
    const inlineRomanItems = romanItemsFromLine(line);
    if (inlineRomanItems) {
      statementBlocks.push(
        ...paragraphs
          .splice(0)
          .flatMap((paragraph) => inlineScientificBlocks(paragraph, warnings)),
      );
      statementBlocks.push({
        type: 'romanList',
        items: inlineRomanItems.map((item) =>
          scientificInlineText(item, warnings),
        ),
      });
      warnings.push('Lista romana estruturada; confira a separação dos itens.');
      continue;
    }
    const firstRoman = line.match(/^(I|II|III|IV|V)\.\s+(.+)$/);
    if (firstRoman) {
      const items = [firstRoman[2]];
      while (lineIndex + 1 < lines.length) {
        const next = lines[lineIndex + 1].match(/^(I|II|III|IV|V)\.\s+(.+)$/);
        if (!next) break;
        items.push(next[2]);
        lineIndex += 1;
      }
      statementBlocks.push(
        ...paragraphs
          .splice(0)
          .flatMap((paragraph) => inlineScientificBlocks(paragraph, warnings)),
      );
      statementBlocks.push({
        type: 'romanList',
        items: items.map((item) => scientificInlineText(item, warnings)),
      });
      warnings.push('Lista romana estruturada; confira a separação dos itens.');
      continue;
    }
    if (line.includes('→') || /\s->\s/.test(line)) {
      const equationMatch = line.match(
        /([0-9A-Za-z()[\]_]+(?:\s*\+\s*[0-9A-Za-z()[\]_]+)*\s*(?:→|->)\s*[0-9A-Za-z()[\]_]+(?:\s*\+\s*[0-9A-Za-z()[\]_]+)*)/,
      );
      const before = equationMatch
        ? line.slice(0, equationMatch.index).trim()
        : '';
      if (before) paragraphs.push(before);
      statementBlocks.push(
        ...paragraphs
          .splice(0)
          .flatMap((paragraph) => inlineScientificBlocks(paragraph, warnings)),
      );
      if (equationMatch) {
        statementBlocks.push({
          type: 'contextFormula',
          code: chemicalCode(equationMatch[1]),
        });
        const after = line
          .slice((equationMatch.index || 0) + equationMatch[0].length)
          .trim();
        if (after) paragraphs.push(after);
        warnings.push(
          'Equação química convertida para fórmula ConTeXt; confira coeficientes e estados físicos.',
        );
      } else paragraphs.push(line);
      continue;
    }
    paragraphs.push(line);
  }
  statementBlocks.push(
    ...paragraphs.flatMap((paragraph) =>
      inlineScientificBlocks(paragraph, warnings),
    ),
  );
  if (Object.keys(alternatives).length !== 5)
    warnings.push(
      `Foram encontradas ${Object.keys(alternatives).length} de 5 alternativas.`,
    );
  warnings.push('Confirme a resposta correta antes de salvar.');
  return {
    sourceInstitution,
    sourceYear,
    statementBlocks,
    alternatives,
    warnings: [...new Set(warnings)],
  };
}

export function QuestionPasteImporter({
  onConfirm,
}: {
  onConfirm: (value: ParsedQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedQuestion | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const addImage = (file?: File) => {
    if (!file || !preview) return;
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size > 400_000
    ) {
      window.alert('Escolha uma imagem PNG ou JPEG de até 400 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setPreview((current) =>
        current
          ? {
              ...current,
              statementBlocks: [
                ...current.statementBlocks,
                {
                  type: 'image',
                  dataUrl: String(reader.result),
                  alt: file.name.replace(/\.[^.]+$/, ''),
                  caption: '',
                },
              ],
            }
          : current,
      );
    reader.readAsDataURL(file);
  };
  if (!open)
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="size-4" />
        Colar questão completa
      </Button>
    );
  return (
    <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div>
        <strong>Colar questão → Analisar → Confirmar</strong>
        <p className="text-xs text-slate-500">Nada será salvo nesta etapa.</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={9}
        className="w-full rounded-lg border bg-white p-3 text-sm"
        placeholder="Cole aqui o texto completo da questão..."
      />
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => setPreview(parsePastedQuestion(text))}
          disabled={text.trim().length < 20}
        >
          <WandSparkles className="size-4" />
          Analisar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      {preview && (
        <div className="space-y-3 rounded-lg border bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <strong>Prévia da questão</strong> · Fonte:{' '}
              {preview.sourceInstitution || 'não identificada'}{' '}
              {preview.sourceYear}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus className="size-4" />
              Inserir imagem
            </Button>
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => addImage(event.target.files?.[0])}
            />
          </div>
          <QuestionPreview value={preview} />
          {preview.warnings.map((warning) => (
            <p key={warning} className="flex gap-2 text-amber-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {warning}
            </p>
          ))}
          <p className="text-xs text-slate-500">
            A prévia aproxima a impressão. A confirmação abre todos os blocos
            para ajustes antes de salvar.
          </p>
          <Button
            type="button"
            onClick={() => {
              onConfirm(preview);
              setOpen(false);
            }}
          >
            Confirmar e editar questão
          </Button>
        </div>
      )}
    </section>
  );
}
