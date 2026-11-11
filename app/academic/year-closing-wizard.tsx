'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Lock,
  OctagonAlert,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import type { ApiBody } from './model';

// Assistente de encerramento do ano letivo. Tudo vem do servidor:
// GET /api/academic-years/:id/closing-check (diagnóstico) e
// POST /api/academic-years/:id/close (transação única, refaz o diagnóstico).

type Issue = {
  code: string;
  count: number;
  message: string;
  panel: 'correction' | 'results' | 'years';
};

type Report = {
  classes: number;
  activeClasses: number;
  activeEnrollments: number;
  enrollmentsWithoutOutcome: number;
  applications: number;
  critical: Issue[];
  warnings: Issue[];
  canClose: boolean;
};

type CloseResult = {
  summary: {
    classesClosed: number;
    enrollmentsCompleted: number;
    enrollmentsWithoutOutcome: number;
  };
  closedBy: string | null;
};

export type ClosingTarget = { id: string; year: number };

const steps = ['Diagnóstico', 'Revisão', 'Confirmação', 'Resultado'] as const;

const panelLabel: Record<Issue['panel'], string> = {
  correction: 'Abrir correção',
  results: 'Abrir resultados',
  years: '',
};

export function YearClosingWizard({
  apiUrl,
  target,
  onClose,
  onClosed,
  onOpenPanel,
}: {
  apiUrl: string;
  target: ClosingTarget | null;
  onClose: () => void;
  onClosed: () => void;
  onOpenPanel?: (panel: 'correction' | 'results') => void;
}) {
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [typedYear, setTypedYear] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<CloseResult | null>(null);

  const check = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/academic-years/${target.id}/closing-check`,
      );
      const body = (await response.json()) as ApiBody<Report>;
      if (!response.ok || !body.data)
        throw new Error(body.error || 'Não foi possível fazer o diagnóstico.');
      setReport(body.data);
      setStep(1);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setLoading(false);
    }
  }, [apiUrl, target]);

  useEffect(() => {
    if (!target) return;
    void Promise.resolve().then(() => {
      setStep(0);
      setReport(null);
      setResult(null);
      setTypedYear('');
      setReason('');
      return check();
    });
  }, [target, check]);

  const execute = async () => {
    if (!target) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/academic-years/${target.id}/close`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            confirmYear: Number(typedYear),
            reason: reason.trim() || undefined,
          }),
        },
      );
      const body = (await response.json()) as ApiBody<CloseResult> & {
        report?: Report;
      };
      if (!response.ok || !body.data) {
        // Surgiu pendência entre o diagnóstico e a confirmação.
        if (body.report) {
          setReport(body.report);
          setStep(1);
        }
        throw new Error(
          body.error || 'Não foi possível encerrar o ano letivo.',
        );
      }
      setResult(body.data);
      setStep(3);
      onClosed();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setLoading(false);
    }
  };

  const issueList = (items: Issue[], tone: 'critical' | 'warning') => (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item.code}
          className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
            tone === 'critical'
              ? 'bg-rose-50 text-rose-950'
              : 'bg-amber-50 text-amber-950'
          }`}
        >
          <span className="font-display text-xl font-bold tabular-nums">
            {item.count}
          </span>
          <span className="min-w-0 flex-1">{item.message}</span>
          {onOpenPanel && item.panel !== 'years' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenPanel(item.panel as 'correction' | 'results');
                onClose();
              }}
            >
              {panelLabel[item.panel]}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => !open && !loading && onClose()}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-5 text-blue-600" aria-hidden="true" />
            Encerrar o ano letivo {target?.year}
          </DialogTitle>
          <DialogDescription>
            Depois do encerramento, turmas, provas e notas desse ano ficam só
            para consulta. Somente o administrador pode reabrir.
          </DialogDescription>
        </DialogHeader>

        <ol
          className="flex flex-wrap gap-2 text-xs font-semibold"
          aria-label="Etapas"
        >
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? 'step' : undefined}
              className={`rounded-full px-2.5 py-1 ${
                index === step
                  ? 'bg-blue-600 text-white'
                  : index < step
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
          >
            {error}
          </p>
        )}

        {step === 0 && (
          <div className="grid gap-3">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Verificando pendências…
              </p>
            ) : (
              <Button variant="outline" onClick={() => void check()}>
                <RefreshCw aria-hidden="true" /> Tentar novamente
              </Button>
            )}
          </div>
        )}

        {step === 1 && report && (
          <div className="grid gap-4">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Turmas ativas</dt>
                <dd className="font-semibold">{report.activeClasses}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Matrículas ativas</dt>
                <dd className="font-semibold">{report.activeEnrollments}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Aplicações</dt>
                <dd className="font-semibold">{report.applications}</dd>
              </div>
            </dl>
            {report.critical.length > 0 && (
              <section className="grid gap-2">
                <h3 className="flex items-center gap-2 font-semibold text-rose-800">
                  <OctagonAlert className="size-4" aria-hidden="true" />
                  Pendências que impedem o encerramento
                </h3>
                {issueList(report.critical, 'critical')}
              </section>
            )}
            {report.warnings.length > 0 && (
              <section className="grid gap-2">
                <h3 className="flex items-center gap-2 font-semibold text-amber-800">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  Avisos
                </h3>
                {issueList(report.warnings, 'warning')}
              </section>
            )}
            {report.canClose && !report.warnings.length && (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                Nenhuma pendência encontrada.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => void check()}
              >
                <RefreshCw aria-hidden="true" /> Verificar de novo
              </Button>
              <Button disabled={!report.canClose} onClick={() => setStep(2)}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === 2 && target && report && (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void execute();
            }}
          >
            <ul className="list-disc pl-5 text-sm text-slate-700">
              <li>{report.activeClasses} turma(s) passam a encerradas;</li>
              <li>
                {report.activeEnrollments} matrícula(s) viram registro histórico
                concluído
                {report.enrollmentsWithoutOutcome
                  ? ` (${report.enrollmentsWithoutOutcome} sem situação definida)`
                  : ''}
                ;
              </li>
              <li>provas e notas do ano ficam bloqueadas para alteração.</li>
            </ul>
            <label
              htmlFor="closing-reason"
              className="grid gap-1 text-sm font-medium"
            >
              Motivo ou observação (opcional)
              <Input
                id="closing-reason"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label
              htmlFor="closing-year"
              className="grid gap-1 text-sm font-medium"
            >
              Para confirmar, digite o ano {target.year}
              <Input
                id="closing-year"
                inputMode="numeric"
                autoComplete="off"
                value={typedYear}
                onChange={(event) => setTypedYear(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setStep(1)}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={loading || typedYear.trim() !== String(target.year)}
              >
                {loading ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Lock aria-hidden="true" />
                )}
                {loading ? 'Encerrando…' : 'Encerrar ano letivo'}
              </Button>
            </div>
          </form>
        )}

        {step === 3 && result && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              Ano letivo {target?.year} encerrado
              {result.closedBy ? ` por ${result.closedBy}` : ''}.
            </p>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              <li>{result.summary.classesClosed} turma(s) encerrada(s);</li>
              <li>
                {result.summary.enrollmentsCompleted} matrícula(s) concluída(s);
              </li>
              {result.summary.enrollmentsWithoutOutcome > 0 && (
                <li>
                  {result.summary.enrollmentsWithoutOutcome} matrícula(s)
                  ficaram como “aguardando decisão”.
                </li>
              )}
            </ul>
            <div className="flex justify-end">
              <Button onClick={onClose}>Concluir</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
