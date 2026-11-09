import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { repairPdfTextBreaks } from '../question-paste-importer';
import {
  alternativeLetters,
  splitImportedQuestion,
  joinImportedQuestion,
  type ExamImportCandidate,
  type ImportedQuestionFields,
} from './model';

export function ContextTextField({
  label,
  value,
  rows,
  onChange,
  showContextTools = true,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
  showContextTools?: boolean;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const insert = (command: 'm' | 'chemical' | 'unit' | 'bold') => {
    const target = editor.current;
    if (!target) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const selected = value.slice(start, end);
    const samples = {
      m: '\\rm E^o_{Zn/Zn^{2+}}',
      chemical: 'C\\ell_{2}',
      unit: '10 gram',
      bold: 'texto',
    };
    const argument = selected || samples[command];
    const replacement = `\\${command}{${argument}}`;
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
    requestAnimationFrame(() => {
      target.focus();
      const selectionStart = start + command.length + 2;
      target.setSelectionRange(
        selectionStart,
        selectionStart + argument.length,
      );
    });
  };
  const insertFormula = () => {
    const target = editor.current;
    if (!target) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const formula = value.slice(start, end) || '\\chemical{} \\chemical{2H_2}';
    const replacement = `\\startformula\n${formula}\n\\stopformula`;
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
  };
  return (
    <div>
      <div
        className={`mb-2 flex flex-wrap items-center justify-between gap-2${showContextTools ? '' : ' min-h-0'}`}
      >
        <label className="text-xs font-bold text-slate-700">{label}</label>
        {showContextTools && (
          <div className="flex flex-wrap gap-1">
            {(['m', 'chemical', 'unit', 'bold'] as const).map((command) => (
              <Button
                key={command}
                type="button"
                size="sm"
                variant="outline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insert(command)}
                className="h-7 px-2 font-mono text-xs"
              >
                \\{command}
                {'{ }'}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={insertFormula}
              className="h-7 px-2 font-mono text-xs"
            >
              \\startformula
            </Button>
          </div>
        )}
      </div>
      <textarea
        ref={editor}
        aria-label={label}
        value={value}
        rows={rows}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-sm leading-6 text-cyan-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );
}

export function ImportedQuestionTextEditor({
  candidate,
  onChange,
  onSave,
}: {
  candidate: ExamImportCandidate;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}) {
  const savedValue = useRef(candidate.rawText);
  const lastJoinedValue = useRef(candidate.rawText);
  const lastQuestionType = useRef(candidate.questionType);
  const [fields, setFields] = useState(() =>
    splitImportedQuestion(
      candidate.rawText,
      candidate.questionType === 'true_false',
    ),
  );

  useEffect(() => {
    if (
      candidate.rawText === lastJoinedValue.current &&
      candidate.questionType === lastQuestionType.current
    )
      return;
    lastJoinedValue.current = candidate.rawText;
    savedValue.current = candidate.rawText;
    lastQuestionType.current = candidate.questionType;
    setFields(
      splitImportedQuestion(
        candidate.rawText,
        candidate.questionType === 'true_false',
      ),
    );
  }, [candidate.id, candidate.rawText, candidate.questionType]);

  const updateFields = (next: ImportedQuestionFields) => {
    setFields(next);
    const rawText = joinImportedQuestion(
      next,
      candidate.questionType === 'true_false',
    );
    lastJoinedValue.current = rawText;
    onChange(rawText);
  };

  const save = () => {
    const rawText = joinImportedQuestion(
      fields,
      candidate.questionType === 'true_false',
    );
    if (rawText.trim() === savedValue.current.trim()) return;
    savedValue.current = rawText;
    onSave(rawText);
  };

  return (
    <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Editor estruturado da questão
          </p>
          <p className="text-xs text-slate-500">
            {candidate.questionType === 'true_false'
              ? 'Afirmação para julgar como certa ou errada, com ConTeXt livre.'
              : 'Enunciado e alternativas A–E separados, todos com ConTeXt livre.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const repaired = repairPdfTextBreaks(
                joinImportedQuestion(
                  fields,
                  candidate.questionType === 'true_false',
                ),
              );
              lastJoinedValue.current = repaired;
              setFields(
                splitImportedQuestion(
                  repaired,
                  candidate.questionType === 'true_false',
                ),
              );
              onChange(repaired);
            }}
          >
            Corrigir quebras do PDF
          </Button>
          <Button type="button" size="sm" onClick={save}>
            Salvar texto
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-4" onBlur={save}>
        <ContextTextField
          label={`Enunciado da questão ${candidate.sourceNumber}`}
          showContextTools={false}
          value={fields.statement}
          rows={12}
          onChange={(statement) => updateFields({ ...fields, statement })}
        />
        {candidate.questionType !== 'true_false' && (
          <div className="grid gap-4 xl:grid-cols-2">
            {alternativeLetters.map((letter) => (
              <ContextTextField
                key={letter}
                label={`Alternativa ${letter}`}
                value={fields.alternatives[letter]}
                rows={4}
                showContextTools={false}
                onChange={(value) =>
                  updateFields({
                    ...fields,
                    alternatives: { ...fields.alternatives, [letter]: value },
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
