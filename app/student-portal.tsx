"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
type Request = { id: string; status: string; className: string; schoolName: string };
type Activity = {
  id: string;
  title: string;
  className: string;
  score: string | null;
  maxScore: string | null;
  requiresManualReview: boolean;
};
type Invite = { schoolName: string; className: string; teacherName: string };
export function StudentPortal({ apiUrl, name }: { apiUrl: string; name: string }) {
  const [code, setCode] = useState(""),
    [invite, setInvite] = useState<Invite | null>(null),
    [requests, setRequests] = useState<Request[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function call(path: string, input?: object) {
    const response = await apiFetch(
      `${apiUrl}${path}`,
      input
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          }
        : {},
    );
    const body = (await response.json()) as { error?: string; data: any };
    if (!response.ok) throw Error(body.error || "Não foi possível continuar.");
    return body.data;
  }
  async function refresh() {
    try {
      const [list, own] = await Promise.all([
        call("/api/class-join-requests/me"),
        call("/api/student/activities"),
      ]);
      setRequests(list);
      setActivities(own);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }
  useEffect(() => {
    setCode(new URLSearchParams(window.location.search).get("invite") || "");
    void refresh();
  }, [apiUrl]);
  async function submit(confirm: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (confirm) {
        await call("/api/class-invites/request", { code });
        setInvite(null);
        setMessage("Solicitação enviada. Aguarde a aprovação do professor.");
        await refresh();
      } else setInvite(await call("/api/class-invites/inspect", { code }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao consultar convite.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 p-5">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Minhas turmas</h1>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await call("/api/auth/logout", {});
                window.location.assign("/portal");
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Sair
          </Button>
        </header>
        <p className="mt-2">Olá, {name}.</p>
        <h2 className="mt-6 font-semibold">Entrar em uma turma</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <label className="block text-sm" htmlFor="invite-code">
            Código fornecido pelo professor
          </label>
          <Input
            id="invite-code"
            value={code}
            maxLength={9}
            autoComplete="off"
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setInvite(null);
            }}
            placeholder="ABCD-EFGH"
            required
          />
          <Button type="submit" disabled={busy}>
            Conferir turma
          </Button>
        </form>
        {invite && (
          <div className="mt-4 rounded-xl border p-4">
            <p>
              <b>Escola:</b> {invite.schoolName}
            </p>
            <p>
              <b>Turma:</b> {invite.className}
            </p>
            <p>
              <b>Professor:</b> {invite.teacherName}
            </p>
            <p className="my-3 text-sm">Confira os dados antes de solicitar participação.</p>
            <Button disabled={busy} onClick={() => void submit(true)}>
              Solicitar participação
            </Button>
          </div>
        )}
        {message && (
          <p role="status" className="mt-4 text-sm">
            {message}
          </p>
        )}
        <div className="mt-6 flex justify-between">
          <h2 className="font-semibold">Meus vínculos e solicitações</h2>
          <Button variant="outline" onClick={() => void refresh()}>
            Atualizar
          </Button>
        </div>
        {!requests.length && (
          <p className="mt-3 text-sm">Você ainda não solicitou entrada em nenhuma turma.</p>
        )}
        {requests.map((r) => (
          <article key={r.id} className="mt-3 rounded-xl border p-3">
            <b>{r.className}</b>
            <p>{r.schoolName}</p>
            <p className="text-sm">
              {r.status === "approved"
                ? "Vínculo aprovado"
                : r.status === "rejected"
                  ? "Solicitação rejeitada"
                  : "Aguardando aprovação"}
            </p>
          </article>
        ))}
        <h2 className="mt-6 font-semibold">Minhas atividades e resultados</h2>
        {!activities.length && <p className="mt-2 text-sm">Nenhuma atividade disponível.</p>}
        {activities.map((a) => (
          <article key={a.id} className="mt-3 rounded-xl border p-3">
            <b>{a.title}</b>
            <p>{a.className}</p>
            <p>
              {a.requiresManualReview
                ? "Aguardando revisão do professor"
                : a.score !== null
                  ? `Resultado: ${a.score} / ${a.maxScore}`
                  : "Sem resultado disponível"}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
