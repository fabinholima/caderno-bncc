'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { shrinkStudentPhoto } from '@/lib/shrink-photo';
import { StudentEssays } from './student-essays';
import {
  StudentHistoryTimeline,
  type TimelineEntry,
} from './academic/student-history-timeline';
type Request = {
  id: string;
  status: string;
  className: string;
  schoolName: string;
};
type Activity = {
  id: string;
  title: string;
  className: string;
  score: string | null;
  maxScore: string | null;
  requiresManualReview: boolean;
};
type Invite = { schoolName: string; className: string; teacherName: string };
type Profile = {
  id: string;
  name: string;
  registration: string;
  selfieDataUrl: string;
};
export function StudentPortal({
  apiUrl,
  name,
}: {
  apiUrl: string;
  name: string;
}) {
  const [code, setCode] = useState(() =>
      typeof window === 'undefined'
        ? ''
        : new URLSearchParams(window.location.search).get('invite') || '',
    ),
    [invite, setInvite] = useState<Invite | null>(null),
    [requests, setRequests] = useState<Request[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [history, setHistory] = useState<TimelineEntry[] | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const call = useCallback(
    async <T,>(path: string, input?: object): Promise<T> => {
      const response = await apiFetch(
        `${apiUrl}${path}`,
        input
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(input),
            }
          : {},
      );
      const body = (await response.json()) as { error?: string; data: T };
      if (!response.ok)
        throw Error(body.error || 'Não foi possível continuar.');
      return body.data;
    },
    [apiUrl],
  );
  const refresh = useCallback(async () => {
    try {
      const [list, own, linkedProfiles, timeline] = await Promise.all([
        call<Request[]>('/api/class-join-requests/me'),
        call<Activity[]>('/api/student/activities'),
        call<Profile[]>('/api/student/profile'),
        // Falha no histórico não pode derrubar o restante do portal.
        call<TimelineEntry[]>('/api/student/history').catch(() => []),
      ]);
      setRequests(list);
      setActivities(own);
      setProfiles(linkedProfiles);
      setHistory(timeline);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao atualizar.');
    }
  }, [call]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  async function submit(confirm: boolean) {
    setBusy(true);
    setMessage('');
    try {
      if (confirm) {
        await call('/api/class-invites/request', { code });
        setInvite(null);
        setMessage('Solicitação enviada. Aguarde a aprovação do professor.');
        await refresh();
      } else
        setInvite(await call<Invite>('/api/class-invites/inspect', { code }));
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Falha ao consultar convite.',
      );
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
                await call('/api/auth/logout', {});
                window.location.assign('/portal');
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
            <p className="my-3 text-sm">
              Confira os dados antes de solicitar participação.
            </p>
            <Button disabled={busy} onClick={() => void submit(true)}>
              Solicitar participação
            </Button>
          </div>
        )}
        {message && (
          <p aria-live="polite" className="mt-4 text-sm">
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
          <p className="mt-3 text-sm">
            Você ainda não solicitou entrada em nenhuma turma.
          </p>
        )}
        {requests.map((r) => (
          <article key={r.id} className="mt-3 rounded-xl border p-3">
            <b>{r.className}</b>
            <p>{r.schoolName}</p>
            <p className="text-sm">
              {r.status === 'approved'
                ? 'Vínculo aprovado'
                : r.status === 'rejected'
                  ? 'Solicitação rejeitada'
                  : 'Aguardando aprovação'}
            </p>
          </article>
        ))}
        <h2 className="mt-6 font-semibold">Minha foto de cadastro</h2>
        {!profiles.length && (
          <p className="mt-2 text-sm">
            Entre com o código da turma e aguarde o professor vincular sua conta
            ao cadastro. Depois, adicione sua foto aqui.
          </p>
        )}
        {profiles.map((profile) => (
          <form
            key={profile.id}
            className="mt-3 space-y-3 rounded-xl border p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const file = new FormData(form).get('photo');
              if (
                !(file instanceof File) ||
                !file.size ||
                file.size > 15_000_000 ||
                !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
              ) {
                setMessage(
                  'Selecione uma foto PNG, JPEG ou WebP de até 15 MB.',
                );
                return;
              }
              setBusy(true);
              try {
                const selfieDataUrl = await shrinkStudentPhoto(file);
                await call('/api/student/profile', {
                  studentId: profile.id,
                  selfieDataUrl,
                });
                form.reset();
                setMessage('Foto salva no seu cadastro.');
                await refresh();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Não foi possível salvar a foto.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {profile.name} · Código do aluno: {profile.registration}
            </p>
            {profile.selfieDataUrl && (
              <Image
                src={profile.selfieDataUrl}
                alt="Sua foto de cadastro"
                width={96}
                height={96}
                unoptimized
                className="size-24 rounded-xl object-cover"
              />
            )}
            <label htmlFor={`photo-${profile.id}`} className="block text-sm">
              Foto PNG, JPEG ou WebP (o portal reduz para 320 px)
            </label>
            <Input
              id={`photo-${profile.id}`}
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar minha foto'}
            </Button>
          </form>
        ))}
        <h2 className="mt-6 font-semibold">Minhas atividades e resultados</h2>
        {!activities.length && (
          <p className="mt-2 text-sm">Nenhuma atividade disponível.</p>
        )}
        {activities.map((a) => (
          <article key={a.id} className="mt-3 rounded-xl border p-3">
            <b>{a.title}</b>
            <p>{a.className}</p>
            <p>
              {a.requiresManualReview
                ? 'Aguardando revisão do professor'
                : a.score !== null
                  ? `Resultado: ${a.score} / ${a.maxScore}`
                  : 'Sem resultado disponível'}
            </p>
          </article>
        ))}
        <h2 className="mt-6 font-semibold">Meu histórico acadêmico</h2>
        <p className="mt-1 text-sm text-slate-500">
          Seus anos letivos, turmas e as notas que os professores já
          publicaram.
        </p>
        <div className="mt-3">
          {history ? (
            <StudentHistoryTimeline entries={history} />
          ) : (
            <p className="text-sm text-slate-500">Carregando histórico…</p>
          )}
        </div>
        <StudentEssays apiUrl={apiUrl} />
      </section>
    </main>
  );
}
