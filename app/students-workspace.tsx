'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Printer, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api-client';
import { StudentPhoto } from './student-photo';

// Página "Alunos" organizada como o professor pensa: escola → turma → alunos.
// Mostra uma turma por vez; cadastro, matrícula e planilha ficam na janela
// "Adicionar alunos", já com a turma aberta preenchida.

export type StudentStatus = 'ativo' | 'transferido' | 'remanejado' | 'atestado' | 'regime_domiciliar';
export type WorkspaceStudent = {
  id: string;
  registration: string;
  name: string;
  access_code?: string;
  linkedAccountName?: string | null;
  linkedAccountEmail?: string | null;
  selfieDataUrl?: string;
  active: boolean;
  status: StudentStatus | null;
  adaptedExam: boolean;
  enrollments?: { classId: string; number: number | null }[];
};
export type WorkspaceClass = { id: string; name: string; grade: string; schoolYear: number; students: number; schoolId?: string | null; schoolName?: string | null };
type ImportRow = { registration: string; name: string; number?: number; line: number; status: StudentStatus; existing: boolean; warning: string | null };
type ApiBody<T> = { data?: T; error?: string };
type Filter = '' | 'semFoto' | 'semConta' | 'adaptada' | 'inativos';

const statuses: [StudentStatus, string][] = [
  ['ativo', 'Ativo'],
  ['transferido', 'Transferido'],
  ['remanejado', 'Remanejado'],
  ['atestado', 'Atestado'],
  ['regime_domiciliar', 'Regime domiciliar'],
];
const pageSize = 25;
const lastClassKey = 'ufaprova-alunos-turma';

function readLastClass() {
  try { return window.localStorage.getItem(lastClassKey) || ''; } catch { return ''; }
}
function saveLastClass(id: string) {
  try { window.localStorage.setItem(lastClassKey, id); } catch { /* sem armazenamento: só nesta visita */ }
}
const linked = (student: WorkspaceStudent) => Boolean(student.linkedAccountName || student.linkedAccountEmail);
const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function StudentsWorkspace({
  apiUrl,
  classes,
  students,
  refresh,
  setMessage,
  savingStudent,
  updateStudent,
  unlinkStudentAccount,
  onInvite,
  onPrintRoster,
  onCreateClass,
}: {
  apiUrl: string;
  classes: WorkspaceClass[];
  students: WorkspaceStudent[];
  refresh: () => Promise<void>;
  setMessage: (message: string) => void;
  savingStudent: string | null;
  updateStudent: (student: WorkspaceStudent, input: { status?: StudentStatus; adaptedExam?: boolean }) => Promise<unknown>;
  unlinkStudentAccount: (student: WorkspaceStudent) => Promise<unknown>;
  onInvite: (schoolClass: WorkspaceClass) => void;
  onPrintRoster: (classId: string) => void;
  onCreateClass: () => void;
}) {
  // Escolas na ordem alfabética; turmas sem escola ficam num grupo à parte.
  const schools = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; classes: WorkspaceClass[] }>();
    for (const item of classes) {
      const key = item.schoolId || 'sem-escola';
      const group = groups.get(key) ?? { key, name: item.schoolName || 'Turmas sem escola', classes: [] };
      group.classes.push(item);
      groups.set(key, group);
    }
    return [...groups.values()]
      .map((group) => ({ ...group, classes: group.classes.sort((a, b) => b.schoolYear - a.schoolYear || a.name.localeCompare(b.name, 'pt-BR', { numeric: true })) }))
      .sort((a, b) => (a.key === 'sem-escola' ? 1 : b.key === 'sem-escola' ? -1 : a.name.localeCompare(b.name, 'pt-BR')));
  }, [classes]);

  const [selectedId, setSelectedId] = useState(() => {
    const last = typeof window === 'undefined' ? '' : readLastClass();
    return classes.some((item) => item.id === last) ? last : '';
  });
  const selected = classes.find((item) => item.id === selectedId) ?? schools[0]?.classes[0] ?? null;
  const [openSchools, setOpenSchools] = useState<Set<string>>(() => new Set());
  const isOpen = (key: string) => openSchools.has(key) || schools.find((s) => s.key === key)?.classes.some((c) => c.id === selected?.id);
  const [globalQuery, setGlobalQuery] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [renewing, setRenewing] = useState<string | null>(null);

  // Novo código pessoal: o antigo deixa de valer. Aluno sem e-mail usa o novo
  // código no "Primeiro acesso" do app para criar outra senha.
  const renewCode = async (student: WorkspaceStudent) => {
    if (!window.confirm(`Gerar um novo código para ${student.name}? O código atual deixa de valer e, se o aluno entra sem e-mail, ele precisará criar uma nova senha no app.`)) return;
    setRenewing(student.id);
    try {
      const response = await apiFetch(`${apiUrl}/api/students/${student.id}/access-code`, { method: 'POST' });
      const body = (await response.json()) as ApiBody<{ accessCode: string }>;
      if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível gerar o código.');
      setMessage(`Novo código de ${student.name}: ${body.data.accessCode}. Entregue ao aluno; o código anterior deixou de valer.`);
      await refresh();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Não foi possível gerar o código.');
    } finally {
      setRenewing(null);
    }
  };

  const choose = (id: string) => {
    setSelectedId(id);
    saveLastClass(id);
    setQuery('');
    setFilter('');
    setPage(1);
    setGlobalQuery('');
  };

  const roster = useMemo(() => {
    if (!selected) return [];
    return students
      .map((student) => ({ student, number: student.enrollments?.find((e) => e.classId === selected.id)?.number ?? null, enrolled: student.enrollments?.some((e) => e.classId === selected.id) }))
      .filter((row) => row.enrolled)
      .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999) || a.student.name.localeCompare(b.student.name, 'pt-BR'));
  }, [students, selected]);

  const counts = {
    total: roster.length,
    semFoto: roster.filter((row) => !row.student.selfieDataUrl).length,
    semConta: roster.filter((row) => !linked(row.student)).length,
    adaptada: roster.filter((row) => row.student.adaptedExam).length,
    inativos: roster.filter((row) => (row.student.status || 'ativo') !== 'ativo').length,
  };
  const matches = (student: WorkspaceStudent, text: string) => {
    const q = normalize(text.trim());
    return !q || [student.name, student.registration, student.access_code || ''].some((value) => normalize(value).includes(q));
  };
  const visible = roster.filter(({ student }) =>
    matches(student, query) &&
    (filter === '' ||
      (filter === 'semFoto' && !student.selfieDataUrl) ||
      (filter === 'semConta' && !linked(student)) ||
      (filter === 'adaptada' && student.adaptedExam) ||
      (filter === 'inativos' && (student.status || 'ativo') !== 'ativo')),
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const className = (id: string) => classes.find((item) => item.id === id);
  const globalResults = globalQuery.trim().length >= 2 ? students.filter((student) => matches(student, globalQuery)).slice(0, 30) : [];

  if (!classes.length)
    return (
      <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <Users className="mx-auto size-8 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">Crie a primeira turma</h2>
        <p className="mt-1 text-sm text-slate-500">Os alunos são organizados por escola e turma.</p>
        <Button type="button" className="mt-4" onClick={onCreateClass}><Plus /> Nova turma</Button>
      </section>
    );

  const chip = (key: Filter, label: string, value: number, warn = false) => (
    <button key={key || 'todos'} type="button" aria-pressed={filter === key} onClick={() => { setFilter(filter === key ? '' : key); setPage(1); }}
      className={`rounded-full border px-3 py-1 text-sm transition ${filter === key ? 'border-blue-600 bg-blue-50 text-blue-900' : warn && value ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      <b className="font-semibold">{value}</b> {label}
    </button>
  );

  return (
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Escolas e turmas (no celular, dois seletores) */}
      <nav aria-label="Escolas e turmas" className="hidden rounded-2xl border border-slate-200 bg-white p-3 lg:block">
        <label htmlFor="students-global-search" className="relative block">
          <span className="sr-only">Buscar aluno em todas as turmas</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" aria-hidden="true" />
          <Input id="students-global-search" value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Buscar aluno em todas as turmas" className="h-9 pl-8" />
        </label>
        {globalResults.length > 0 && (
          <ul className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 text-sm" aria-label="Alunos encontrados">
            {globalResults.map((student) => (
              <li key={student.id} className="border-b border-slate-100 p-2 last:border-0">
                <p className="font-medium">{student.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(student.enrollments ?? []).map((enrollment) => className(enrollment.classId) && (
                    <button key={enrollment.classId} type="button" onClick={() => choose(enrollment.classId)} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-100">
                      {className(enrollment.classId)?.name}
                    </button>
                  ))}
                  {!student.enrollments?.length && <span className="text-xs text-slate-500">sem turma</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {globalQuery.trim().length >= 2 && !globalResults.length && <p className="mt-2 px-1 text-xs text-slate-500">Nenhum aluno encontrado.</p>}
        <ul className="mt-3 space-y-1">
          {schools.map((school) => (
            <li key={school.key}>
              <button type="button" aria-expanded={Boolean(isOpen(school.key))}
                onClick={() => setOpenSchools((current) => { const next = new Set(current); if (next.has(school.key)) next.delete(school.key); else next.add(school.key); return next; })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-slate-50">
                {isOpen(school.key) ? <ChevronDown className="size-4 text-slate-500" aria-hidden="true" /> : <ChevronRight className="size-4 text-slate-500" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{school.name}</span>
                <span className="text-xs font-normal text-slate-500">{school.classes.length} {school.classes.length === 1 ? 'turma' : 'turmas'}</span>
              </button>
              {isOpen(school.key) && (
                <ul className="mb-2 ml-6 space-y-0.5">
                  {school.classes.map((item) => (
                    <li key={item.id}>
                      <button type="button" aria-current={item.id === selected?.id ? 'true' : undefined} onClick={() => choose(item.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-sm ${item.id === selected?.id ? 'border-blue-200 bg-blue-50 font-semibold text-blue-900' : 'border-transparent text-slate-700 hover:bg-slate-50'}`}>
                        <span className="truncate">{item.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">{item.students} alunos</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <div className="mb-3 grid grid-cols-2 gap-2 lg:hidden">
          <label className="text-xs font-semibold text-slate-600">Escola
            <select aria-label="Escola" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold"
              value={schools.find((s) => s.classes.some((c) => c.id === selected?.id))?.key ?? ''}
              onChange={(event) => { const first = schools.find((s) => s.key === event.target.value)?.classes[0]; if (first) choose(first.id); }}>
              {schools.map((school) => <option key={school.key} value={school.key}>{school.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Turma
            <select aria-label="Turma" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold"
              value={selected?.id ?? ''} onChange={(event) => choose(event.target.value)}>
              {(schools.find((s) => s.classes.some((c) => c.id === selected?.id))?.classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.students} alunos</option>)}
            </select>
          </label>
        </div>

        {selected && (
          <section aria-labelledby="students-class-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id="students-class-title" className="text-xl font-bold">{selected.name} · {selected.grade} · {selected.schoolYear}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.schoolName || 'Turma sem escola vinculada'}</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => onInvite(selected)}><Users /> Convidar alunos</Button>
                <Button type="button" variant="outline" className="hidden sm:inline-flex" onClick={() => onPrintRoster(selected.id)}><Printer /> Imprimir lista com fotos</Button>
                <Button type="button" className="flex-1 sm:flex-none" onClick={() => setAddOpen(true)}><Plus /> Adicionar alunos</Button>
              </div>
            </header>
            <fieldset className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
              <legend className="sr-only">Filtrar alunos da turma</legend>
              {chip('', counts.total === 1 ? 'aluno' : 'alunos', counts.total)}
              {chip('semFoto', 'sem foto', counts.semFoto, true)}
              {chip('semConta', 'sem conta vinculada', counts.semConta, true)}
              {chip('adaptada', 'prova adaptada', counts.adaptada)}
              {chip('inativos', 'fora de "Ativo"', counts.inativos)}
            </fieldset>
            <div className="px-4 py-3 sm:px-5">
              <Input aria-label="Buscar nesta turma" placeholder="Buscar nesta turma (nome, matrícula ou código)" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="h-9 max-w-sm" />
            </div>
            {pageRows.length ? (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-12 px-4 py-2 sm:px-5">Nº</th>
                    <th scope="col" className="px-2 py-2">Aluno</th>
                    <th scope="col" className="hidden px-2 py-2 md:table-cell">Situação</th>
                    <th scope="col" className="hidden px-2 py-2 md:table-cell">Prova adaptada</th>
                    <th scope="col" className="hidden px-2 py-2 lg:table-cell">Conta</th>
                    <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ student, number }) => (
                    <tr key={student.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 tabular-nums text-slate-500 sm:px-5">{number ? String(number).padStart(2, '0') : '—'}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <StudentPhoto src={student.selfieDataUrl} name={student.name} size={34} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{student.name}</p>
                            <p className="text-xs text-slate-500">Matrícula {student.registration}{student.access_code ? ` · ${student.access_code}` : ''}{!student.selfieDataUrl && <span className="text-amber-800"> · sem foto</span>}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-2 py-2.5 md:table-cell">
                        <select aria-label={`Situação de ${student.name}`} value={student.status ?? 'ativo'} disabled={savingStudent !== null}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                          onChange={(event) => updateStudent(student, { status: event.target.value as StudentStatus }).catch((error: Error) => setMessage(error.message))}>
                          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                      <td className="hidden px-2 py-2.5 md:table-cell">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" aria-label={`Prova adaptada (laudo) de ${student.name}`} checked={student.adaptedExam} disabled={savingStudent !== null}
                            onChange={(event) => updateStudent(student, { adaptedExam: event.target.checked }).catch((error: Error) => setMessage(error.message))} />
                          Laudo
                        </label>
                      </td>
                      <td className="hidden px-2 py-2.5 lg:table-cell">
                        {linked(student)
                          ? <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800" title={student.linkedAccountEmail || ''}>vinculada</span>
                          : <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">sem conta</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className="sr-only">Ações</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Mais ações para ${student.name}`} />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <div className="px-2 py-1.5 text-xs text-slate-500 md:hidden">Situação</div>
                            {statuses.map(([value, label]) => (
                              <DropdownMenuItem key={value} className="md:hidden" disabled={(student.status ?? 'ativo') === value || savingStudent !== null}
                                onClick={() => void updateStudent(student, { status: value }).catch((error: Error) => setMessage(error.message))}>
                                {(student.status ?? 'ativo') === value ? '✓ ' : ''}{label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem className="md:hidden" disabled={savingStudent !== null}
                              onClick={() => void updateStudent(student, { adaptedExam: !student.adaptedExam }).catch((error: Error) => setMessage(error.message))}>
                              {student.adaptedExam ? 'Remover prova adaptada' : 'Marcar prova adaptada'}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={renewing !== null} onClick={() => void renewCode(student)}>
                              {renewing === student.id ? 'Gerando código…' : 'Gerar novo código de acesso'}
                            </DropdownMenuItem>
                            {linked(student)
                              ? <DropdownMenuItem variant="destructive" disabled={savingStudent !== null} onClick={() => void unlinkStudentAccount(student)}>
                                  Desvincular conta ({student.linkedAccountName || student.linkedAccountEmail})
                                </DropdownMenuItem>
                              : <DropdownMenuItem disabled>Sem conta vinculada</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
                {roster.length ? 'Nenhum aluno corresponde aos filtros.' : 'Nenhum aluno nesta turma. Use "Adicionar alunos" ou "Convidar alunos".'}
              </p>
            )}
            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:px-5">
              <span>Mostrando {pageRows.length} de {visible.length}</span>
              {totalPages > 1 && (
                <span className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button>
                  Página {currentPage} de {totalPages}
                  <Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Próxima</Button>
                </span>
              )}
            </footer>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">Situação e prova adaptada são registros para acompanhamento do professor e não alteram a participação nas provas. A foto é enviada pelo aluno no app, após o vínculo.</p>
          </section>
        )}
      </div>

      {selected && (
        <AddStudentsDialog key={selected.id} open={addOpen} onOpenChange={setAddOpen} apiUrl={apiUrl} schoolClass={selected}
          candidates={students.filter((student) => !student.enrollments?.some((e) => e.classId === selected.id))}
          nextNumber={Math.max(0, ...roster.map((row) => row.number ?? 0)) + 1}
          refresh={refresh} setMessage={setMessage} />
      )}
    </div>
  );
}

// Janela "Adicionar alunos": um aluno, planilha ou aluno já cadastrado,
// sempre na turma aberta.
function AddStudentsDialog({
  open,
  onOpenChange,
  apiUrl,
  schoolClass,
  candidates,
  nextNumber,
  refresh,
  setMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiUrl: string;
  schoolClass: WorkspaceClass;
  candidates: WorkspaceStudent[];
  nextNumber: number;
  refresh: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [tab, setTab] = useState<'one' | 'import' | 'existing'>('one');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportRow[]>([]);

  async function call<T>(path: string, body: object) {
    const response = await apiFetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = (await response.json()) as ApiBody<T>;
    if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
    return payload.data as T;
  }
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError('');
    try {
      const done = await action();
      setMessage(done);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };
  const field = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
  const tabs: [typeof tab, string][] = [['one', 'Um aluno'], ['import', 'Importar planilha'], ['existing', 'Aluno já cadastrado']];

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) { setError(''); setPreview([]); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar alunos</DialogTitle>
          <DialogDescription>Os alunos entram direto na turma aberta.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Turma: <b>{schoolClass.name}</b>{schoolClass.schoolName ? ` · ${schoolClass.schoolName}` : ''}
        </div>
        <div role="tablist" aria-label="Forma de adicionar" className="flex flex-wrap gap-2">
          {tabs.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setError(''); }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${tab === value ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'one' && (
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void run(async () => {
              const student = await call<{ id: string; access_code?: string }>('/api/students', {
                name: data.get('name'), registration: data.get('registration'), status: data.get('status'), adaptedExam: data.get('adaptedExam') === 'on',
              });
              await call(`/api/classes/${schoolClass.id}/enrollments`, { studentId: student.id, number: data.get('number') ? Number(data.get('number')) : undefined });
              form.reset();
              return `Aluno cadastrado em ${schoolClass.name}. Código: ${student.access_code || 'disponível na lista'}.`;
            });
          }}>
            <label htmlFor="add-student-name" className="text-sm font-medium">Nome completo<Input id="add-student-name" name="name" required className="mt-1" placeholder="Ex.: Maria Souza" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="add-student-registration" className="text-sm font-medium">Matrícula<Input id="add-student-registration" name="registration" required className="mt-1" placeholder="Código da escola" /></label>
              <label htmlFor="add-student-number" className="text-sm font-medium">Nº na chamada<Input id="add-student-number" name="number" type="number" min="1" defaultValue={nextNumber} className="mt-1" /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Situação
                <select name="status" defaultValue="ativo" className={field}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input name="adaptedExam" type="checkbox" /> Prova adaptada (laudo)</label>
            </div>
            <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Adicionar à turma'}</Button></div>
          </form>
        )}

        {tab === 'existing' && (
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const student = candidates.find((item) => item.id === data.get('studentId'));
            void run(async () => {
              await call(`/api/classes/${schoolClass.id}/enrollments`, { studentId: data.get('studentId'), number: data.get('number') ? Number(data.get('number')) : undefined });
              return `${student?.name || 'Aluno'} matriculado em ${schoolClass.name}.`;
            });
          }}>
            <label className="text-sm font-medium">Aluno
              <select name="studentId" required defaultValue="" className={field}>
                <option value="" disabled>{candidates.length ? 'Selecione o aluno' : 'Todos os alunos já estão nesta turma'}</option>
                {candidates.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.registration}</option>)}
              </select>
            </label>
            <label htmlFor="enroll-student-number" className="text-sm font-medium sm:max-w-48">Nº na chamada<Input id="enroll-student-number" name="number" type="number" min="1" defaultValue={nextNumber} className="mt-1" /></label>
            <div className="flex justify-end"><Button type="submit" disabled={busy || !candidates.length}>{busy ? 'Salvando…' : 'Matricular na turma'}</Button></div>
          </form>
        )}

        {tab === 'import' && (
          <div className="grid gap-3">
            <p className="text-sm text-slate-600">
              Arquivo .xlsx de até 2 MB, com até 1.000 alunos, nesta ordem de colunas: <b>Código/Matrícula → Nº da chamada → Nome do aluno</b> (com ou sem linha de títulos; o Nº é opcional). Formate o código como Texto para manter zeros à esquerda. Nada é gravado antes da sua confirmação.
            </p>
            {!preview.length ? (
              <form className="flex flex-wrap gap-2" onSubmit={(event) => {
                event.preventDefault();
                const file = new FormData(event.currentTarget).get('spreadsheet');
                if (!(file instanceof File) || !file.size) return setError('Selecione uma planilha Excel.');
                if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 2_000_000) return setError('Envie um arquivo .xlsx de até 2 MB.');
                void (async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject(new Error('Não foi possível ler a planilha.')));
                      reader.onerror = () => reject(new Error('Não foi possível ler a planilha.'));
                      reader.readAsDataURL(file);
                    });
                    setPreview(await call<ImportRow[]>(`/api/classes/${schoolClass.id}/students/import/preview`, { base64 }));
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : 'Não foi possível ler a planilha.');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}>
                <Input name="spreadsheet" aria-label="Planilha de alunos" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={busy} className="min-w-0 flex-1" />
                <Button type="submit" disabled={busy}>{busy ? 'Lendo…' : 'Ler planilha'}</Button>
              </form>
            ) : (
              <>
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-700"><tr><th className="p-2">Código</th><th className="p-2">Nº</th><th className="p-2">Aluno</th><th className="p-2">Situação</th><th className="p-2"><span className="sr-only">Ação</span></th></tr></thead>
                    <tbody>{preview.map((row, index) => (
                      <tr key={`${row.registration}-${row.line}`} className="border-t border-slate-100">
                        <td className="p-2 font-mono">{row.registration}</td>
                        <td className="p-2 tabular-nums">{row.number ?? '—'}</td>
                        <td className="p-2">{row.name}{row.existing && <span className="ml-2 text-xs text-slate-500">já cadastrado</span>}{row.warning && <p className="mt-1 text-xs text-amber-700">{row.warning}</p>}</td>
                        <td className="p-2"><select aria-label={`Situação de ${row.name}`} className="rounded-md border border-slate-300 bg-white px-2 py-1" value={row.status}
                          onChange={(event) => setPreview((rows) => rows.map((item, i) => (i === index ? { ...item, status: event.target.value as StudentStatus } : item)))}>
                          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select></td>
                        <td className="p-2">{row.warning && <button type="button" className="text-xs font-medium text-rose-700 underline" onClick={() => setPreview((rows) => rows.filter((_, i) => i !== index))}>Remover</button>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setPreview([])}>Cancelar</Button>
                  <Button type="button" disabled={busy || preview.some((row) => row.warning)} onClick={() => void run(async () => {
                    const result = await call<{ created: number; enrolled: number; alreadyEnrolled: number }>(`/api/classes/${schoolClass.id}/students/import`, {
                      students: preview.map(({ registration, name, number, status, line }) => ({ registration, name, number, status, line })),
                    });
                    setPreview([]);
                    return `Importação concluída: ${result.created} novos alunos, ${result.enrolled} matrículas e ${result.alreadyEnrolled} já matriculados.`;
                  })}>
                    {busy ? 'Gravando…' : `Confirmar e gravar ${preview.length} alunos`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
