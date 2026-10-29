'use client';

import { type SubmitEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, GraduationCap, ShieldCheck, UserPlus, KeyRound, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

export type AuthIdentity = {
  portalAdmin?: boolean;
  portalEditor?: boolean;
  portalRole?: 'admin' | 'editor' | 'teacher' | 'student';
  globalBank?: boolean;
  user: { id: string; email: string; displayName: string; cpfComplete?: boolean; profileComplete?: boolean; googleLinked?: boolean };
  institution: { id: string; name: string };
  role: 'admin' | 'coordinator' | 'teacher' | 'student';
};

export function AuthScreen({ apiUrl }: { apiUrl: string }) {
  const [resetToken, setResetToken] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.hash.slice(1)).get('reset_token') || new URLSearchParams(window.location.hash.slice(1)).get('verify_token') || '');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'resend'>(() => {
    if (typeof window === 'undefined') return 'login';
    const params = new URLSearchParams(window.location.hash.slice(1));
    return params.has('verify_token') ? 'verify' : params.has('reset_token') ? 'reset' : 'login';
  });
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.hash.slice(1));
    return params.has('verify_token') ? 'Clique em Confirmar e-mail para concluir seu cadastro.' : params.has('reset_token') ? 'Defina uma nova senha com pelo menos 10 caracteres.' : '';
  });
  const [saving, setSaving] = useState(false);
  const [accountType, setAccountType] = useState<'educator' | 'student'>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('invite') ? 'student' : 'educator');
  const [cpf, setCpf] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [config, setConfig] = useState({ google: false, passwordRecovery: false });
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const recoveryToken = params.get('reset_token');
    const verificationToken = params.get('verify_token');
    if (verificationToken) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (recoveryToken) {
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
        setMessage(error === 'existing_account'
          ? 'Este e-mail já tem uma conta. Entre com e-mail e senha; depois vá a Configurações → Conta Google → Vincular Google.'
          : error === 'registration_required'
            ? 'Para criar uma conta nova com Google, escolha Criar conta e informe seu CPF. Para uma conta existente, entre com a senha e vincule o Google em Configurações.'
            : 'Login Google não concluído. Tente novamente.');
        if (error === 'registration_required') setMode('register');
        window.history.replaceState(null, '', window.location.pathname);
      }
    }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'API indisponível.'); });
    return () => { active = false; };
  }, [apiUrl]);
  async function googleLogin() {
    setSaving(true); setMessage('');
    try {
      if (mode === 'register' && accountType !== 'student' && !cpf.trim()) throw new Error('Informe seu CPF para criar a conta.');
      const response = await apiFetch(`${apiUrl}/api/auth/google/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({accountType,...(mode === 'register' && accountType !== 'student' ? {cpf} : {})}) });
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
      mode === 'verify' ? '/api/auth/verify-email'
        : mode === 'resend' ? '/api/auth/resend-verification'
        : mode === 'register'
        ? accountType === 'student' ? '/api/auth/student/register' : '/api/auth/register'
        : mode === 'forgot'
          ? '/api/auth/forgot-password'
          : mode === 'reset'
            ? '/api/auth/reset-password'
            : '/api/auth/login';
    const payload =
      mode === 'verify' ? { token: resetToken }
        : mode === 'resend' ? { email: data.get('email') }
        : mode === 'register'
        ? {
            ...(accountType === 'student' ? {} : {institutionName:data.get('institutionName'),cpf}),
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
      if (mode === 'register' || mode === 'resend') {
        if (body.data?.developmentToken) {
          setResetToken(body.data.developmentToken);
          setMode('verify');
          setMessage('Modo local: clique em Confirmar e-mail para testar a confirmação.');
        } else {
          setMode('login');
          setMessage(mode === 'register' ? 'Conta criada. Confira seu e-mail e confirme o cadastro antes de entrar.' : 'Se a conta precisar de confirmação, enviaremos um novo link. Confira também a pasta de spam.');
        }
      } else if (mode === 'verify') {
        setResetToken('');
        setMode('login');
        setMessage('E-mail confirmado. Entre com sua senha.');
      } else if (mode === 'forgot') {
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[linear-gradient(135deg,#edf4ff_0%,#f8fafc_52%,#e8f7f2_100%)] px-4 py-5 font-sans sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-emerald-200/25 blur-3xl" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/95 shadow-2xl shadow-slate-300/40 backdrop-blur lg:grid-cols-[.9fr_1.1fr]">
        <div className="hidden flex-col justify-between bg-[var(--navy)] p-10 text-white lg:flex">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">UfaProva</p><h2 className="mt-5 font-display text-4xl font-bold leading-tight">Avaliações mais claras para ensinar melhor.</h2><p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">Organize seu banco de questões, monte provas e acompanhe a aprendizagem em um só lugar.</p></div>
          <div className="space-y-3 text-sm text-slate-300"><p>✓ Banco de questões com BNCC</p><p>✓ Pré-visualização dos seus layouts</p><p>✓ Resultados e histórico por turma</p></div>
        </div>
        <div className="p-6 sm:p-9 lg:p-11">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[var(--navy)] text-white shadow-lg shadow-blue-950/15">
            <GraduationCap />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-950">UfaProva</h1>
            <p className="text-xs font-medium text-slate-500">Plataforma de avaliações</p>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700">
          <ShieldCheck size={15} strokeWidth={2.5} aria-hidden="true" />
          <span>Acesso seguro</span>
        </div>
        <h2 className="mt-2 text-3xl font-display font-bold tracking-tight text-slate-950">
          {mode === 'verify' ? 'Confirmar seu e-mail'
            : mode === 'resend' ? 'Reenviar confirmação'
            : mode === 'register'
            ? 'Criar sua conta'
            : mode === 'forgot'
              ? 'Recuperar senha'
              : mode === 'reset'
                ? 'Definir nova senha'
                : 'Entrar'}
        </h2>
        {mode === 'login' && <p className="mt-2 text-sm leading-6 text-slate-500">Entre para continuar suas avaliações e acompanhar seus resultados.</p>}
        {['login','register'].includes(mode) && <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold text-slate-700">Tipo de acesso</legend><div className="grid gap-2 sm:grid-cols-2"><label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${accountType==='educator' ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}><input type="radio" name="accountType" className="accent-blue-600" checked={accountType==='educator'} onChange={()=>setAccountType('educator')} /> Professor ou gestor</label><label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${accountType==='student' ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}><input type="radio" name="accountType" className="accent-blue-600" checked={accountType==='student'} onChange={()=>setAccountType('student')} /> Aluno</label></div></fieldset>}
        {mode === 'register' && accountType === 'student' && <p className="mt-2 text-sm text-slate-500">Crie sua conta e solicite entrada com o código da turma. Seu professor aprovará o vínculo.</p>}
        {mode === 'register' && accountType !== 'student' && <p className="mt-2 text-sm text-slate-500">Após criar a conta, cadastre seu perfil de professor ou coordenador e as escolas para o cabeçalho das provas.</p>}
        {mode === 'register' && accountType !== 'student' && <div className="mt-4 space-y-2">
          <label htmlFor="auth-cpf" className="text-sm font-semibold">CPF do titular</label>
          <Input id="auth-cpf" value={cpf} onChange={(event) => setCpf(event.target.value)} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" autoComplete="off" />
          <p className="text-xs text-slate-500">Usado para impedir contas duplicadas. Armazenamos uma identificação protegida, não o CPF em texto aberto. Teste por 7 dias, sem cobrança automática.</p>
        </div>}
        {['login','register'].includes(mode) && <div className="mt-5">
          <Button type="button" variant="outline" className="h-11 w-full gap-3 border-slate-200 bg-white font-semibold shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50" disabled={saving || !config.google} onClick={googleLogin}>
            <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.18v5.14h6.6c3.86-3.56 6.09-8.8 6.09-14.82Z" />
              <path fill="#34A853" d="M24 44c5.5 0 10.12-1.82 13.49-4.72l-6.6-5.14c-1.83 1.23-4.17 1.98-6.89 1.98-5.3 0-9.79-3.58-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
              <path fill="#FBBC05" d="M12.6 27.72a12 12 0 0 1 0-7.44v-5.3H5.8a20 20 0 0 0 0 18.04l6.8-5.3Z" />
              <path fill="#EA4335" d="M24 11.88c3 0 5.68 1.03 7.8 3.05l5.85-5.85A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.8 14.98l6.8 5.3C14.21 15.46 18.7 11.88 24 11.88Z" />
            </svg>
            Continuar com Google
          </Button>
          {!config.google && <p className="mt-2 text-xs text-slate-500">Login Google aguardando configuração. Você pode usar e-mail e senha.</p>}
          <div className="mt-4 flex items-center gap-3 text-center text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /><span>ou use e-mail e senha</span><span className="h-px flex-1 bg-slate-200" /></div>
        </div>}
        <form className="mt-5 space-y-3" onSubmit={submit}>
          {mode === 'register' && (
            <>
              {accountType !== 'student' && <Input
                name="institutionName"
                required
                placeholder="Nome do seu espaço de avaliações"
                aria-label="Nome do seu espaço pessoal de avaliações"
              />}
              <Input name="displayName" required placeholder="Seu nome" aria-label="Seu nome" autoComplete="name" />
            </>
          )}
          {!['reset', 'verify'].includes(mode) && (
            <Input name="email" type="email" required placeholder="E-mail" aria-label="E-mail" autoComplete="email" />
          )}
          {mode === 'reset' && (
            <input type="hidden" name="token" value={resetToken} />
          )}
          {!['forgot', 'verify', 'resend'].includes(mode) && (
            <div className="relative">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                minLength={mode !== 'login' ? 10 : undefined}
                required
                placeholder="Senha"
                aria-label="Senha"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="pr-12"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                title={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
              >
                {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </div>
          )}
          <Button className="w-full" disabled={saving} type="submit">
            {saving
              ? 'Aguarde...'
              : mode === 'verify' ? 'Confirmar e-mail'
                : mode === 'resend' ? 'Reenviar link'
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
          <output  className="mt-4 block rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm leading-5 text-blue-900">
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
                className="inline-flex items-center gap-2 rounded-md font-semibold text-blue-700 transition hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => setMode('register')}
              >
                <UserPlus size={17} aria-hidden="true" /> Criar conta
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => setMode('forgot')}
              >
                <KeyRound size={17} aria-hidden="true" /> Esqueci minha senha
              </button>
              <button className="inline-flex items-center gap-2 rounded-md text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => setMode('resend')}><MailCheck size={17} aria-hidden="true" /> Reenviar confirmação</button>
            </>
          )}
        </div>
        </div>
      </section>
    </main>
  );
}
