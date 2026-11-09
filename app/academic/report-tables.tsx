import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type ApplicationReport } from './model';

export function StudentResultsTable({
  students,
  statusLabel,
  statusClass,
  onOpen,
}: {
  students: ApplicationReport['students'];
  statusLabel: (
    status: ApplicationReport['students'][number]['status'],
  ) => string;
  statusClass: (
    status: ApplicationReport['students'][number]['status'],
  ) => string;
  onOpen: (studentId: string) => void;
}) {
  if (!students.length)
    return (
      <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        Nenhum aluno nesta situação.
      </p>
    );
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2">Aluno</th>
            <th>Versão</th>
            <th>Situação</th>
            <th>Resultado</th>
            <th>
              <span className="sr-only">Relatório</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id} className="border-b last:border-0">
              <td className="py-2 font-medium">
                {student.number ? `${student.number}. ` : ''}
                {student.name}
              </td>
              <td>{student.versionCode}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(student.status)}`}
                >
                  {statusLabel(student.status)}
                </span>
              </td>
              <td className="font-semibold tabular-nums">
                {student.score == null
                  ? '—'
                  : `${student.score}/${student.maxScore} · ${student.percentage}%`}
              </td>
              <td className="text-right">
                {student.status === 'corrected' ||
                student.status === 'manual_review' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpen(student.id)}
                  >
                    <Eye /> Detalhes
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportPerformance({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    key: string;
    label: string;
    detail: string;
    percentage: number;
  }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-[var(--navy)]">{title}</h3>
      {items.length ? (
        <div className="mt-3 space-y-4">
          {items.map((item) => (
            <div key={item.key}>
              <div className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.detail}
                  </p>
                </div>
                <b>{item.percentage}%</b>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${item.percentage < 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

export function Select({
  name,
  label,
  items,
}: {
  name: string;
  label: string;
  items: Array<[string, string]>;
}) {
  return (
    <select
      name={name}
      required
      aria-label={label}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
    >
      <option value="">{label}</option>
      {items.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}
