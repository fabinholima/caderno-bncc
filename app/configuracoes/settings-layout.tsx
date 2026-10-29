'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronLeft, UserRound } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { AuthScreen, type AuthIdentity } from '../auth-screen';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const SettingsApiUrlContext = createContext('');

export function useSettingsApiUrl() {
  return useContext(SettingsApiUrlContext);
}
const sections = [
  { href: '/configuracoes/perfil', label: 'Perfil profissional', description: 'Seus dados e atuação', Icon: UserRound },
  { href: '/configuracoes/escolas', label: 'Escolas', description: 'Cabeçalho e dados escolares', Icon: Building2 },
];

export function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [apiUrl, setApiUrl] = useState('');
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fallback = process.env.NODE_ENV === 'production'
      ? window.location.origin
      : `${window.location.protocol}//${window.location.hostname}:8788`;
    try {
      const target = new URL(configuredApiUrl || fallback);
      if (!configuredApiUrl) target.hostname = window.location.hostname;
      queueMicrotask(() => setApiUrl(target.origin));
    } catch {
      queueMicrotask(() => setApiUrl(fallback));
    }
  }, []);

  useEffect(() => {
    if (!apiUrl) return;
    let active = true;
    apiFetch(`${apiUrl}/api/auth/me`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = await response.json() as { data?: AuthIdentity };
        return body.data || null;
      })
      .then((value) => { if (active) setIdentity(value); })
      .catch(() => { if (active) setIdentity(null); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [apiUrl]);

  if (!ready || !apiUrl) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-700"><output>Carregando configurações…</output></main>;
  if (!identity) return <AuthScreen apiUrl={apiUrl} />;
  if (identity.role === 'student') return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold text-slate-950">Configurações indisponíveis</h1><p className="mt-2 text-slate-600">Esta área é exclusiva para professores e gestores.</p><Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 font-semibold text-white" href="/portal">Ir ao portal</Link></section></main>;

  return (
    <main className="min-h-screen bg-slate-50 pb-24 text-slate-950 lg:pb-10">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div><Link href="/portal" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-800 hover:text-blue-950"><ChevronLeft aria-hidden="true" className="size-4"/>Voltar ao portal</Link><p className="mt-2 text-xs font-bold uppercase tracking-[.14em] text-blue-700">UfaProva · Conta</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Configurações</h1></div>
          <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 sm:inline">{identity.user.displayName}</span>
        </div>
      </header>
      <SettingsApiUrlContext.Provider value={apiUrl}>
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <nav aria-label="Seções de configurações" className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <p className="hidden px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-wider text-slate-500 lg:block">Conta e escola</p>
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {sections.map(({ href, label, description, Icon }) => {
              const active = pathname === href;
              return <li key={href}><Link href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-blue-700 ${active ? 'bg-blue-50 text-blue-950 ring-1 ring-blue-200' : 'text-slate-700 hover:bg-slate-50'}`}><Icon aria-hidden="true" className={`size-5 shrink-0 ${active ? 'text-blue-700' : 'text-slate-500'}`} /><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="hidden text-xs text-slate-500 lg:block">{description}</span></span></Link></li>;
            })}
          </ul>
        </nav>
        <section aria-label="Conteúdo das configurações" className="min-w-0">{children}</section>
      </div>
      </SettingsApiUrlContext.Provider>
    </main>
  );
}
