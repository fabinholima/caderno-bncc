'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { AuthScreen } from './auth-screen';

type Status = {enabled:boolean;message:string};
export function MaintenanceGate({children}:{children:ReactNode}) {
  const [status,setStatus]=useState<Status|null>(null);
  const [admin,setAdmin]=useState(false);
  const [apiUrl,setApiUrl]=useState('');
  const [error,setError]=useState(false);
  const [adminLogin,setAdminLogin]=useState(false);
  useEffect(()=>{
    const origin=process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:8788`;
    setApiUrl(origin);
    setAdminLogin(new URLSearchParams(window.location.search).has('maintenance_admin'));
    let active=true;
    async function refresh(){
      try {
        const response=await apiFetch(`${origin}/api/maintenance`,{cache:'no-store'});
        if(!response.ok)throw new Error();
        const body=await response.json() as {data:Status};
        let isAdmin=false;
        if(body.data.enabled){
          const me=await apiFetch(`${origin}/api/auth/me`,{cache:'no-store'});
          if(me.ok){const identity=await me.json() as {data?:{portalAdmin?:boolean;developmentBypass?:boolean}};isAdmin=Boolean(identity.data?.portalAdmin && !identity.data?.developmentBypass);}
        }
        if(active){setStatus(body.data);setAdmin(isAdmin);setError(false);}
      }catch{if(active)setError(true);}
    }
    void refresh();
    const timer=setInterval(refresh,15000);
    return ()=>{active=false;clearInterval(timer)};
  },[]);
  // Keep legal information accessible even while the portal is closed.
  if(typeof window!=='undefined' && ['/privacidade','/contato'].includes(window.location.pathname))return children;
  if(status && (!status.enabled || admin))return children;
  if(status?.enabled && adminLogin && apiUrl)return <AuthScreen apiUrl={apiUrl}/>;
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-6 py-12">
    <section className="max-w-lg text-center">
      <p className="mb-8 text-2xl font-bold text-slate-900">ufa<span className="text-blue-700">prova</span></p>
      <div className="mx-auto mb-6 grid size-20 place-items-center rounded-3xl bg-blue-100 text-blue-700"><Wrench size={36} aria-hidden="true"/></div>
      <h1 className="text-3xl font-bold text-slate-900">{status?.enabled?'Estamos em manutenção':error?'Portal temporariamente indisponível':'Carregando o portal…'}</h1>
      <p role="status" className="mt-4 whitespace-pre-line text-lg leading-relaxed text-slate-600">{status?.enabled?status.message:error?'Não foi possível consultar o portal. Tente novamente em instantes.':'Só um instante.'}</p>
      {(status?.enabled||error)&&<button onClick={()=>window.location.reload()} className="mt-8 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white">Tentar novamente</button>}
      {status?.enabled&&<a href="/portal?maintenance_admin=1" className="mt-8 block text-sm text-slate-500 underline">Acesso do administrador</a>}
    </section>
  </main>;
}
