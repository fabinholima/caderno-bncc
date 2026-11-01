"use client";
import { formString } from '@/lib/form-data';
import { useCallback, useEffect, useState } from "react";
import Image from 'next/image';
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { PrintSheet } from "./print-sheet";
type Candidate = { id: string; name: string; registration: string };
type Request = {
  id: string;
  name: string;
  email: string;
  requestedAt: string;
  linkedStudentId?: string;
  linkedStudentName?: string;
  linkedRegistration?: string;
};
export function ClassInvitePanel({
  apiUrl,
  classId,
  className,
  defaultSchoolId = "",
  schoolName,
  onClose,
  onApproved,
}: {
  apiUrl: string;
  classId: string;
  className: string;
  /** Escola da própria turma, escolhida ao criá-la. */
  defaultSchoolId?: string;
  schoolName?: string | null;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]),
    [schoolId, setSchoolId] = useState("");
  const [code, setCode] = useState(""),
    [qr, setQr] = useState(""),
    [requests, setRequests] = useState<Request[]>([]),
    [students, setStudents] = useState<Candidate[]>([]),
    [busy, setBusy] = useState(false),
    [printingQr, setPrintingQr] = useState(false),
    [message, setMessage] = useState("");
  const call = useCallback(async <T,>(path: string, method = "GET", input?: object): Promise<T> => {
    const r = await apiFetch(`${apiUrl}${path}`, {
      method,
      ...(input
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(input) }
        : {}),
    });
    const b = (await r.json()) as { error?: string; data: T };
    if (!r.ok) throw Error(b.error || "Não foi possível continuar.");
    return b.data;
  }, [apiUrl]);
  const refresh = useCallback(async () => {
    const [invite, list, candidates, profile] = await Promise.all([
      call<{schoolId?: string; code?: string} | null>(`/api/classes/${classId}/invite`),
      call<Request[]>(`/api/classes/${classId}/join-requests`),
      call<Candidate[]>(`/api/classes/${classId}/join-candidates`),
      call<{schools:{id:string;name:string}[]}>('/api/educator-profile'),
    ]);
    setSchools(profile.schools);
    setSchoolId(invite?.schoolId || defaultSchoolId || (profile.schools.length === 1 ? profile.schools[0].id : ""));
    setCode(invite?.code || "");
    setRequests(list);
    setStudents(candidates);
  }, [call, classId, defaultSchoolId]);
  useEffect(() => {
    void Promise.resolve().then(() => refresh()).catch((e) => setMessage(e.message));
  }, [refresh]);
  const link =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/portal?invite=${encodeURIComponent(code)}`;
  useEffect(() => {
    let live = true;
    if (code)
      QRCode.toDataURL(link, { width: 200, margin: 2 })
        .then((value) => {
          if (live) setQr(value);
        })
        .catch(() => {
          if (live) setMessage("Não foi possível gerar o QR Code. Use o código ou link.");
        });
    return () => {
      live = false;
    };
  }, [code, link]);
  const inviteSchoolName = schools.find((s) => s.id === schoolId)?.name || schoolName || "";
  const largeQr = () => QRCode.toDataURL(link, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
  async function downloadQr() {
    const anchor = document.createElement("a");
    anchor.href = await largeQr();
    anchor.download = `qr-turma-${className.normalize("NFD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "convite"}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setMessage("QR Code baixado em PNG.");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-4 rounded-2xl border bg-white p-5">
      <header className="flex justify-between">
        <h2 className="font-bold">Convidar alunos · {className}</h2>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </header>
      <p className="mt-2 text-sm">
        O convite solicita participação. O vínculo depende da sua aprovação.
      </p>
      <label className="mt-3 block text-sm">
        Escola da turma
        <select
          className="mt-1 block w-full rounded border p-2"
          value={schoolId}
          disabled={!!code || busy}
          onChange={(e) => setSchoolId(e.target.value)}
        >
          <option value="">Selecione a escola</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {code ? (
        <>
          <p className="my-3 text-xl font-bold tracking-widest">{code}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(code);
                  setMessage("Código copiado.");
                })
              }
            >
              Copiar código
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(link);
                  setMessage("Link copiado.");
                })
              }
            >
              Copiar convite
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!window.confirm("Renovar o código? O convite anterior deixará de funcionar."))
                    return;
                  setCode(
                    (await call<{code:string}>(`/api/classes/${classId}/invite`, "POST", { schoolId })).code,
                  );
                })
              }
            >
              Renovar código
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!window.confirm("Desativar este convite para novas solicitações?")) return;
                  await call(`/api/classes/${classId}/invite`, "DELETE");
                  setCode("");
                })
              }
            >
              Desativar código
            </Button>
            <Button variant="outline" disabled={!qr} onClick={() => setPrintingQr(true)}>
              Imprimir QR
            </Button>
            <Button variant="outline" disabled={!qr} onClick={() => void run(downloadQr)}>
              Baixar QR
            </Button>
          </div>
          {qr && (
            <Image unoptimized
              src={qr}
              alt={`QR Code de convite para ${className}`}
              width={200}
              height={200}
              className="mt-3"
            />
          )}
        </>
      ) : (
        <Button
          className="mt-3"
          disabled={busy || !schoolId}
          onClick={() =>
            void run(async () =>
              setCode((await call<{code:string}>(`/api/classes/${classId}/invite`, "POST", { schoolId })).code),
            )
          }
        >
          Gerar código
        </Button>
      )}
      <div className="mt-6 flex justify-between">
        <h3 className="font-semibold">Solicitações pendentes ({requests.length})</h3>
        <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}>
          Atualizar
        </Button>
      </div>
      {requests.map((r) => (
        <form
          key={r.id}
          className="mt-4 space-y-2 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void run(async () => {
              const studentId = formString(data, "studentId");
              await call(`/api/class-join-requests/${r.id}`, "POST", {
                action: "approve",
                confirmed: data.get("confirmed") === "on",
                ...(studentId
                  ? { studentId }
                  : {
                      studentName: data.get("studentName"),
                      registration: data.get("registration"),
                    }),
              });
              await refresh();
              onApproved();
              setMessage("Vínculo aprovado.");
            });
          }}
        >
          <p className="font-semibold">{r.name}</p>
          <p className="text-sm">
            {r.email} · {new Date(r.requestedAt).toLocaleDateString("pt-BR")}
          </p>
          <label className="block text-sm">
            Cadastro a vincular
            <select name="studentId" className="mt-1 block w-full rounded border p-2">
              <option value="">
                {r.linkedStudentId
                  ? "Selecione o cadastro já vinculado"
                  : "Criar novo cadastro (somente se não existir)"}
              </option>
              {r.linkedStudentId && (
                <option value={r.linkedStudentId}>
                  {r.linkedStudentName} · matrícula {r.linkedRegistration} (conta já vinculada)
                </option>
              )}
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · matrícula {s.registration}
                </option>
              ))}
            </select>
          </label>
          <Input name="studentName" aria-label="Nome para novo cadastro" defaultValue={r.name} />
          <Input
            name="registration"
            aria-label="Matrícula para novo cadastro"
            placeholder="Matrícula (se criar novo cadastro)"
          />
          <label className="flex gap-2 text-sm">
            <input name="confirmed" type="checkbox" required />
            Conferi a identidade e confirmo o cadastro escolhido. Os dados existentes serão
            preservados.
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Aprovar vínculo
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!window.confirm(`Rejeitar a solicitação de ${r.name}?`)) return;
                  await call(`/api/class-join-requests/${r.id}`, "POST", { action: "reject" });
                  await refresh();
                })
              }
            >
              Rejeitar
            </Button>
          </div>
        </form>
      ))}
      {!requests.length && <p className="mt-3 text-sm">Nenhuma solicitação pendente.</p>}
      {printingQr && code && (
        <PrintSheet title="QR Code da turma" onClose={() => setPrintingQr(false)}>
          <QrPrintPage link={link} code={code} className={className} schoolName={inviteSchoolName} />
        </PrintSheet>
      )}
      {message && (
        <p aria-live="polite" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

function QrPrintPage({ link, code, className, schoolName }: { link: string; code: string; className: string; schoolName: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
      .then((value) => { if (live) setSrc(value); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [link]);
  return (
    <div className="flex min-h-[260mm] flex-col items-center justify-center text-center">
      {schoolName && <p className="text-lg font-semibold uppercase tracking-wide text-slate-600">{schoolName}</p>}
      <h1 className="mt-2 text-4xl font-bold">Turma {className}</h1>
      {src && <Image unoptimized src={src} alt={`QR Code de convite para ${className}`} width={420} height={420} className="mt-8 size-[110mm]" />}
      <p className="mt-6 text-sm uppercase tracking-wide text-slate-500">Código da turma</p>
      <p className="font-mono text-5xl font-bold tracking-[0.2em]">{code}</p>
      <div className="mt-8 max-w-[150mm] rounded-xl border-2 border-slate-900 px-6 py-4 text-lg">
        <p className="font-semibold">Como entrar na turma</p>
        <p className="mt-2">Abra o app <b>UFA Prova</b> → <b>Sou aluno</b> → <b>Ler QR Code</b> e aponte a câmera para o código acima.</p>
        <p className="mt-2 text-base text-slate-600">Sem câmera? Digite o código da turma no app.</p>
      </div>
    </div>
  );
}
