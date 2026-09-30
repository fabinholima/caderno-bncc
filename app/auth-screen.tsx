'use client';

import { type SubmitEvent, useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

export type AuthIdentity = {
  portalAdmin?: boolean;
  portalEditor?: boolean;
  portalRole?: 'admin' | 'editor' | 'teacher';
  globalBank?: boolean;
  user: { id: string; email: string; displayName: string; cpfComplete?: boolean; profileComplete?: boolean };
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
  const [cpf, setCpf] = useState('');
  const [config, setConfig] = useState({ google: false, passwordRecovery: false });
  useEffect(() => {
    let active = true;
    const recoveryToken = new URLSearchParams(window.location.hash.slice(1)).get('reset_token');
    if (recoveryToken) {
      setResetToken(recoveryToken);
      setMode('reset');
      setMessage('Defina uma nova senha com pelo menos 10 caracteres.');
      window.history.replaceState(null, '', window.location.pathname);
    }
    apiFetch(`${apiUrl}/api/auth/config`).then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível consultar as opções de login.');
      return await response.json() as { data: { google: boolean; passwordRecovery: boolean } };
    }).then((body) => {
      if (!active) return;
      setConfig(body.data);
      const error = new URLSearchParams(window.location.search).get('auth_error');
      if (error) {
        setMessage(error === 'existing_account' ? 'Já existe uma conta com esses dados. Entre com a senha da conta existente ou procure suporte.' : error === 'registration_required' ? 'Para começar com Google, escolha Criar conta e informe seu CPF.' : 'Login Google não concluído. Tente novamente.');
        if (error === 'registration_required') setMode('register');
        window.history.replaceState(null, '', window.location.pathname);
      }
    }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'API indisponível.'); });
    return () => { active = false; };
  }, [apiUrl]);
  async function googleLogin() {
    setSaving(true); setMessage('');
    try {
      if (mode === 'register' && !cpf.trim()) throw new Error('Informe seu CPF para criar a conta.');
      const response = await apiFetch(`${apiUrl}/api/auth/google/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'register' ? { cpf } : {}) });
      const body = await response.json() as { error?: string; data?: { url: string } };
      if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível iniciar o login Google.');
      window.location.assign(body.data.url);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha no login Google.'); }
    finally { setSaving(false); }
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
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
            cpf,
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
        setResetToken('');
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
            <h1 className="font-display text-xl font-bold">UfaProva</h1>
            <p className="text-sm text-slate-500">Plataforma de avaliações</p>
          </div>
        </div>
        <h2 className="mt-7 text-2xl font-bold">
          {mode === 'register'
            ? 'Criar sua conta'
            : mode === 'forgot'
              ? 'Recuperar senha'
              : mode === 'reset'
                ? 'Definir nova senha'
                : 'Entrar'}
        </h2>
        {mode === 'register' && <p className="mt-2 text-sm text-slate-500">Após criar a conta, cadastre seu perfil de professor ou coordenador e as escolas para o cabeçalho das provas.</p>}
        {mode === 'register' && <div className="mt-4 space-y-2">
          <label htmlFor="auth-cpf" className="text-sm font-semibold">CPF do titular</label>
          <Input id="auth-cpf" value={cpf} onChange={(event) => setCpf(event.target.value)} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" autoComplete="off" />
          <p className="text-xs text-slate-500">Usado para impedir contas duplicadas. Armazenamos uma identificação protegida, não o CPF em texto aberto. Teste por 7 dias, sem cobrança automática.</p>
        </div>}
        {['login','register'].includes(mode) && <div className="mt-4">
          <Button type="button" variant="outline" className="w-full" disabled={saving || !config.google} onClick={googleLogin}>Continuar com Google</Button>
          {!config.google && <p className="mt-2 text-xs text-slate-500">Login Google aguardando configuração. Você pode usar e-mail e senha.</p>}
          <p className="mt-4 text-center text-xs text-slate-500">ou use e-mail e senha</p>
        </div>}
        <form className="mt-5 space-y-3" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <Input
                name="institutionName"
                required
                placeholder="Nome do seu espaço de avaliações"
                aria-label="Nome do seu espaço pessoal de avaliações"
              />
              <Input name="displayName" required placeholder="Seu nome" aria-label="Seu nome" autoComplete="name" />
            </>
          )}
          {mode !== 'reset' && (
            <Input name="email" type="email" required placeholder="E-mail" aria-label="E-mail" autoComplete="email" />
          )}
          {mode === 'reset' && (
            <input type="hidden" name="token" value={resetToken} />
          )}
          {!['forgot'].includes(mode) && (
            <Input
              name="password"
              type="password"
              minLength={mode !== 'login' ? 10 : undefined}
              required
              placeholder="Senha"
              aria-label="Senha"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
          <output className="mt-3 block text-sm text-slate-600">
            {message}
          </output>
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
