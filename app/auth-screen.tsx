'use client';

import { FormEvent, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

export type AuthIdentity = {
  user: { id: string; email: string; displayName: string };
  institution: { id: string; name: string };
  role: 'admin' | 'coordinator' | 'teacher';
};

export function AuthScreen({ apiUrl }: { apiUrl: string }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    'login',
  );
  const [resetToken, setResetToken] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const path =
      mode === 'register'
        ? '/api/auth/register'
        : mode === 'forgot'
          ? '/api/auth/forgot-password'
          : mode === 'reset'
            ? '/api/auth/reset-password'
            : '/api/auth/login';
    const payload =
      mode === 'register'
        ? {
            institutionName: data.get('institutionName'),
            displayName: data.get('displayName'),
            email: data.get('email'),
            password: data.get('password'),
          }
        : mode === 'forgot'
          ? { email: data.get('email') }
          : mode === 'reset'
            ? { token: data.get('token'), password: data.get('password') }
            : { email: data.get('email'), password: data.get('password') };
    try {
      const response = await apiFetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        error?: string;
        data?: { developmentToken?: string };
      };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível continuar.');
      if (mode === 'forgot') {
        if (body.data?.developmentToken) {
          setResetToken(body.data.developmentToken);
          setMode('reset');
          setMessage('Defina agora uma nova senha.');
        } else
          setMessage(
            'Se o e-mail existir, enviaremos as instruções de recuperação.',
          );
      } else if (mode === 'reset') {
        setMode('login');
        setMessage('Senha alterada. Entre com a nova senha.');
      } else window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha de autenticação.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--navy)] text-white">
            <GraduationCap />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold">Caderno BNCC</h1>
            <p className="text-sm text-slate-500">Plataforma de avaliações</p>
          </div>
        </div>
        <h2 className="mt-7 text-2xl font-bold">
          {mode === 'register'
            ? 'Criar conta institucional'
            : mode === 'forgot'
              ? 'Recuperar senha'
              : mode === 'reset'
                ? 'Definir nova senha'
                : 'Entrar'}
        </h2>
        <form className="mt-5 space-y-3" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <Input
                name="institutionName"
                required
                placeholder="Instituição"
              />
              <Input name="displayName" required placeholder="Seu nome" />
            </>
          )}
          {mode !== 'reset' && (
            <Input name="email" type="email" required placeholder="E-mail" />
          )}
          {mode === 'reset' && (
            <input type="hidden" name="token" value={resetToken} />
          )}
          {!['forgot'].includes(mode) && (
            <Input
              name="password"
              type="password"
              minLength={mode === 'register' ? 10 : undefined}
              required
              placeholder="Senha"
            />
          )}
          <Button className="w-full" disabled={saving} type="submit">
            {saving
              ? 'Aguarde...'
              : mode === 'register'
                ? 'Criar conta'
                : mode === 'forgot'
                  ? 'Solicitar recuperação'
                  : mode === 'reset'
                    ? 'Alterar senha'
                    : 'Entrar'}
          </Button>
        </form>
        {message && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            {message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          {mode !== 'login' && (
            <button
              className="font-semibold text-blue-700"
              onClick={() => setMode('login')}
            >
              Voltar ao login
            </button>
          )}
          {mode === 'login' && (
            <>
              <button
                className="font-semibold text-blue-700"
                onClick={() => setMode('register')}
              >
                Criar conta
              </button>
              <button
                className="text-slate-500"
                onClick={() => setMode('forgot')}
              >
                Esqueci minha senha
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
