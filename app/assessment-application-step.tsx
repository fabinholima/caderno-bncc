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
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>(
      [],
    ),
    [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>(
      [],
    ),
    [selected, setSelected] = useState<string[]>([]);
  const [application, setApplication] = useState<{
      id: string;
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
    try {
      setApplication(
        await request('assessment-applications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assessmentId, classId, studentIds: selected }),
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!application) return;
    try {
      const r = await apiFetch(
        `${apiUrl}/api/assessment-applications/${application.id}/pdf`,
      );
      if (!r.ok) throw new Error('O lote ainda não está pronto.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'provas-da-turma.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="text-xl font-bold">Aplicar à turma</h2>
      <p>
        Os cartões personalizados vinculam cada aluno, aplicação e versão por QR
        code. Use estes arquivos na impressão e na correção pelo celular.
      </p>
      {error && <p role="alert">{error}</p>}
      {!application ? (
        <>
          <select
            aria-label="Turma da aplicação"
            className="rounded border p-2"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudents([]);
              setSelected([]);
            }}
          >
            <option value="">Selecione a turma</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {students.map((s) => (
            <label key={s.id} className="block">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, s.id]
                      : ids.filter((id) => id !== s.id),
                  )
                }
              />{' '}
              {s.name}
            </label>
          ))}
          <Button disabled={busy || !selected.length} onClick={create}>
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
            disabled={
              !application.assignments.every(
                (a) => a.renderStatus === 'completed',
              )
            }
            onClick={download}
          >
            Baixar lote para impressão
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
