'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
type Assignment = {
  id: string;
  studentName: string;
  versionCode: string;
  renderStatus?: string;
  status?: string;
};
export function AssessmentApplicationStep({
  apiUrl,
  assessmentId,
}: {
  apiUrl: string;
  assessmentId: string;
}) {
  const [classes, setClasses] = useState<Array<{ id: string; name: string; grade?: string; schoolYear?: number; students?: number; schoolName?: string | null }>>(
      [],
    ),
    [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>(
      [],
    ),
    [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState('');
  const [application, setApplication] = useState<{
      id: string;
      reused?: boolean;
      assignments: Assignment[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      const r = await apiFetch(`${apiUrl}/api/${path}`, options);
      const b = (await r.json()) as { data: T; error?: string };
      if (!r.ok)
        throw new Error(b.error || 'Não foi possível concluir a operação.');
      return b.data;
    },
    [apiUrl],
  );
  useEffect(() => {
    let active = true;
    request<typeof classes>('classes')
      .then((data) => {
        if (active) setClasses(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    let active = true;
    if (classId)
      request<typeof students>(`classes/${classId}/students`)
        .then((data) => {
          if (active) {
            setStudents(data);
            setSelected(data.map((s: { id: string }) => s.id));
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [classId, request]);
  useEffect(() => {
    if (
      !application ||
      application.assignments.every((a) =>
        ['completed', 'failed'].includes(a.renderStatus || a.status || ''),
      )
    )
      return;
    const timer = setTimeout(
      () =>
        request<typeof application>(`assessment-applications/${application.id}`)
          .then(setApplication)
          .catch((e) => setError(e.message)),
      2000,
    );
    return () => clearTimeout(timer);
  }, [application, request]);
  async function create() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<NonNullable<typeof application>>('assessment-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assessmentId, classId, studentIds: selected }),
      });
      setApplication(result);
      if (result.reused)
        setNotice('Esta avaliação já estava aplicada a esta turma. Mantivemos a mesma aplicação e retomamos os PDFs pendentes.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!application) return;
    setDownloading(true);
    try {
      const r = await apiFetch(
        `${apiUrl}/api/assessment-applications/${application.id}/answer-cards.pdf`,
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Não foi possível baixar o lote.');
      }
      const file = await r.blob();
      if (!file.size) throw new Error('O arquivo do lote veio vazio. Tente novamente.');
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cartoes-resposta-da-turma.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-xl font-bold">Aplicar à turma</h2>
      <p>
        Os cartões personalizados vinculam cada aluno, aplicação e versão por QR
        code. Use estes arquivos na impressão e na correção pelo celular.
      </p>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <output className="block rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</output>}
      {!application ? (
        <>
          <div className="grid gap-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(220px,.8fr)_minmax(0,1.2fr)]">
            <div>
              <label className="block text-sm font-semibold text-slate-800" htmlFor="application-class">Turma e escola</label>
              <select
                id="application-class"
                aria-label="Turma da aplicação"
                className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStudents([]);
                  setSelected([]);
                  setError('');
                  setNotice('');
                }}
              >
                <option value="">Selecione a turma</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.grade ? ` · ${c.grade}` : ''}{c.schoolYear ? ` · ${c.schoolYear}` : ''}{c.schoolName ? ` · ${c.schoolName}` : ''}
                  </option>
                ))}
              </select>
              {classId && <p className="mt-2 text-xs text-slate-500">A lista mostra estudantes ativos matriculados na turma escolhida.</p>}
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Estudantes da aplicação</p>
                <span className="text-xs text-slate-500">{selected.length} de {students.length} selecionados</span>
              </div>
              {classId ? students.length ? (
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                  {students.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="size-4 accent-blue-700"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, s.id]
                              : ids.filter((id) => id !== s.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Esta turma ainda não tem estudantes ativos matriculados.</p> : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Selecione uma turma para conferir os estudantes.</p>}
            </div>
          </div>
          <Button disabled={busy || !classId || !selected.length} onClick={create}>
            {busy
              ? 'Preparando…'
              : `Gerar cartões para ${selected.length} alunos`}
          </Button>
        </>
      ) : (
        <>
          <p>Aplicação criada: {application.id}</p>
          {application.assignments.map((a) => (
            <p key={a.id}>
              {a.studentName} · Versão {a.versionCode} ·{' '}
              {a.renderStatus || a.status}
            </p>
          ))}
          <Button
            disabled={downloading ||
              !application.assignments.every(
                (a) => a.renderStatus === 'completed',
              )
            }
            onClick={download}
          >
            {downloading
              ? 'Preparando cartões-resposta…'
              : 'Baixar cartões-resposta em lote'}
          </Button>
          <p>
            Abra a área de correção pelo celular e selecione esta aplicação para
            fotografar os cartões.
          </p>
        </>
      )}
    </section>
  );
}
