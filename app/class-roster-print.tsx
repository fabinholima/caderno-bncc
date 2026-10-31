'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { PrintSheet } from './print-sheet';
import { StudentPhoto } from './student-photo';

type Roster = {
  class: { id: string; name: string; grade: string; schoolYear: number };
  schoolName: string;
  students: Array<{
    id: string;
    name: string;
    registration: string;
    number: number | null;
    status: string | null;
    active: boolean;
    selfieDataUrl: string | null;
  }>;
};

const statusLabels: Record<string, string> = {
  ativo: 'Ativo',
  transferido: 'Transferido',
  remanejado: 'Remanejado',
  atestado: 'Atestado',
  regime_domiciliar: 'Regime domiciliar',
};

export function ClassRosterPrint({ apiUrl, classId, onClose }: { apiUrl: string; classId: string; onClose: () => void }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    apiFetch(`${apiUrl}/api/classes/${classId}/roster`)
      .then(async (response) => {
        const body = (await response.json()) as { data?: Roster; error?: string };
        if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível carregar a lista da turma.');
        if (live) setRoster(body.data);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a lista da turma.');
      });
    return () => { live = false; };
  }, [apiUrl, classId]);
  const withPhoto = roster?.students.filter((student) => student.selfieDataUrl).length ?? 0;
  return (
    <PrintSheet title="Lista da turma com fotos" onClose={onClose}>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {!roster && !error && <p className="text-sm text-slate-500">Carregando lista da turma…</p>}
      {roster && (
        <>
          <header className="border-b-2 border-slate-900 pb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{roster.schoolName}</p>
            <h1 className="mt-1 text-2xl font-bold">Turma {roster.class.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {roster.class.grade} · {roster.class.schoolYear} · {roster.students.length} alunos ({withPhoto} com foto) · emitida em {new Date().toLocaleDateString('pt-BR')}
            </p>
          </header>
          {roster.students.length ? (
            <ol className="mt-4 grid grid-cols-4 gap-3">
              {roster.students.map((student, index) => (
                <li key={student.id} className="print-avoid-break flex flex-col items-center rounded-lg border border-slate-300 p-2 text-center">
                  <StudentPhoto src={student.selfieDataUrl} name={student.name} size={96} square />
                  {!student.selfieDataUrl && <span className="mt-1 text-[10px] uppercase text-slate-400">sem foto</span>}
                  <p className="mt-2 text-sm font-semibold leading-tight">{student.number ?? index + 1}. {student.name}</p>
                  <p className="mt-1 text-xs text-slate-600">Matrícula {student.registration}</p>
                  <p className="text-xs text-slate-600">{statusLabels[student.status ?? ''] ?? (student.active ? 'Ativo' : 'Inativo')}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-sm text-slate-500">Nenhum aluno matriculado nesta turma.</p>
          )}
        </>
      )}
    </PrintSheet>
  );
}
