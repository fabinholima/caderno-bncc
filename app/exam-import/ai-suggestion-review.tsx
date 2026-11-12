import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  questionTypeLabels,
  summarizeAiText,
  type AiReviewField,
  type ExamImportCandidate,
  type PedagogicalDiscipline,
  type PedagogicalTopic,
} from './model';

export function AiSuggestionReview({
  candidate,
  disciplines,
  topics,
  onAccept,
  onReject,
}: {
  candidate: ExamImportCandidate;
  disciplines: PedagogicalDiscipline[];
  topics: PedagogicalTopic[];
  onAccept: (fields: AiReviewField[]) => Promise<void>;
  onReject: (fields: AiReviewField[]) => Promise<void>;
}) {
  const suggestion = candidate.aiSuggestion;
  const [selectedFields, setSelectedFields] = useState<AiReviewField[]>([]);
  const [busy, setBusy] = useState(false);
  if (!suggestion) return null;

  const currentDiscipline = disciplines.find(
    (entry) => entry.id === candidate.pedagogicalDisciplineId,
  );
  const suggestedDiscipline = disciplines.find(
    (entry) =>
      entry.name.toLocaleLowerCase('pt-BR') ===
      suggestion.subject?.toLocaleLowerCase('pt-BR'),
  );
  const currentTopic = topics.find(
    (entry) => entry.id === candidate.pedagogicalTopicId,
  );
  const suggestedTopic = topics.find(
    (entry) => entry.id === suggestion.topicId,
  );
  const rows: Array<{
    field: AiReviewField;
    label: string;
    current: string;
    suggested: string;
    available: boolean;
  }> = [
    {
      field: 'rawText',
      label: 'Texto',
      current: summarizeAiText(candidate.rawText),
      suggested: summarizeAiText(suggestion.normalizedText),
      available: Boolean(suggestion.normalizedText.trim()),
    },
    {
      field: 'questionType',
      label: 'Tipo',
      current: questionTypeLabels[candidate.questionType],
      suggested: questionTypeLabels[suggestion.questionType],
      available: true,
    },
    {
      field: 'pedagogicalDisciplineId',
      label: 'Disciplina',
      current: currentDiscipline?.name || 'Não definida',
      suggested:
        suggestedDiscipline?.name || suggestion.subject || 'Não sugerida',
      available: Boolean(suggestedDiscipline),
    },
    {
      field: 'grade',
      label: 'Série',
      current: candidate.grade || 'Não definida',
      suggested: suggestion.grade || 'Não sugerida',
      available: Boolean(suggestion.grade),
    },
    {
      field: 'pedagogicalTopicId',
      label: 'Objeto / subtópico',
      current: currentTopic?.path || 'Não definido',
      suggested:
        suggestedTopic?.path ||
        (suggestion.topicId ? 'Código fora do catálogo atual' : 'Não sugerido'),
      available: Boolean(suggestedTopic),
    },
    {
      field: 'skill',
      label: 'Habilidade BNCC',
      current: candidate.skill || 'Não definida',
      suggested: suggestion.skillCode || 'Não sugerida',
      available: Boolean(suggestion.skillCode),
    },
    {
      field: 'difficulty',
      label: 'Dificuldade',
      current: candidate.difficulty || 'Não definida',
      suggested: suggestion.difficulty || 'Não sugerida',
      available: Boolean(suggestion.difficulty),
    },
    {
      field: 'correctAnswers',
      label: 'Gabarito',
      current: candidate.correctAnswers?.join(', ') || 'Não definido',
      suggested: suggestion.correctAnswers.join(', ') || 'Não sugerido',
      available: suggestion.correctAnswers.length > 0,
    },
  ];
  const changedFields = rows
    .filter((row) => row.available && row.current !== row.suggested)
    .map((row) => row.field);
  const accepted = new Set(candidate.aiReview?.acceptedFields || []);
  const rejected = new Set(candidate.aiReview?.rejectedFields || []);

  const decide = async (decision: 'accept' | 'reject') => {
    if (!selectedFields.length) return;
    setBusy(true);
    try {
      await (decision === 'accept'
        ? onAccept(selectedFields)
        : onReject(selectedFields));
      setSelectedFields([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-900">
            {suggestion.provider === 'local_demo'
              ? 'Sugestão local de demonstração'
              : 'Sugestão da IA'}{' '}
            — decisão humana por campo
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Confiança {Math.round(suggestion.confidence * 100)}% ·{' '}
            {suggestion.model}. Nenhuma sugestão é cadastrada automaticamente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedFields(changedFields)}
          >
            Marcar mudanças
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedFields([])}
          >
            Limpar
          </Button>
        </div>
      </div>
      {suggestion.warnings.length > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          Atenção: {suggestion.warnings.join(' · ')}
        </p>
      )}
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <div className="grid min-w-[720px] grid-cols-[42px_150px_1fr_1fr_96px] bg-slate-100 px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
          <span />
          <span>Campo</span>
          <span>Atual</span>
          <span>Sugestão</span>
          <span>Decisão</span>
        </div>
        {rows.map((row) => {
          const isAccepted = accepted.has(row.field);
          const isRejected = rejected.has(row.field);
          return (
            <label
              key={row.field}
              className="grid min-w-[720px] grid-cols-[42px_150px_1fr_1fr_96px] items-start border-t border-slate-100 px-2 py-2 text-xs"
            >
              <input
                type="checkbox"
                checked={selectedFields.includes(row.field)}
                disabled={!row.available || busy}
                onChange={(event) =>
                  setSelectedFields((current) =>
                    event.target.checked
                      ? [...new Set([...current, row.field])]
                      : current.filter((field) => field !== row.field),
                  )
                }
                className="mt-0.5 size-4 accent-blue-700"
              />
              <span className="font-semibold text-slate-700">{row.label}</span>
              <span className="pr-3 text-slate-600">{row.current}</span>
              <span className="pr-3 text-blue-900">{row.suggested}</span>
              <span
                className={`w-fit rounded-full px-2 py-0.5 text-xs font-bold ${isAccepted ? 'bg-emerald-100 text-emerald-800' : isRejected ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}
              >
                {isAccepted ? 'Aceito' : isRejected ? 'Rejeitado' : 'Pendente'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!selectedFields.length || busy}
          onClick={() => decide('accept')}
        >
          Aceitar selecionados
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedFields.length || busy}
          onClick={() => decide('reject')}
        >
          Rejeitar selecionados
        </Button>
        {candidate.aiReview?.reviewedAt && (
          <span className="text-xs text-slate-500">
            Última decisão:{' '}
            {new Date(candidate.aiReview.reviewedAt).toLocaleString('pt-BR')}
            {candidate.aiReview.history?.length
              ? ` · ${candidate.aiReview.history.length} registro(s) no histórico`
              : ''}
          </span>
        )}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-blue-800">
          Ver texto completo sugerido
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">
          {suggestion.normalizedText}
        </pre>
      </details>
      {suggestion.sharedText?.content && (
        <details className="mt-3 rounded border border-amber-200 bg-amber-50 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-amber-900">
            Texto-base comum detectado
            {suggestion.sharedText.sourceNumbers.length
              ? ` · itens ${suggestion.sharedText.sourceNumbers.join(', ')}`
              : ''}
            {suggestion.sharedText.title
              ? ` · ${suggestion.sharedText.title}`
              : ''}
          </summary>
          <p className="mt-2 text-xs text-amber-900">
            Ao aceitar o texto sugerido, este texto sai do enunciado e vira o
            texto-base do grupo: no cadastro ele é criado uma vez e vinculado a
            todos os itens indicados.
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs">
            {suggestion.sharedText.content}
          </pre>
        </details>
      )}
    </section>
  );
}
