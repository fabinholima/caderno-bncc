'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wallet, Undo2, CircleDollarSign, BadgeCheck, Users, ShieldCheck, CalendarDays, ChartColumn, Search, Network, RotateCcw, UserRound, Building2, LockKeyhole, LockKeyholeOpen, Trash2, Monitor, LogOut, ChevronLeft, ChevronRight, Info } from 'lucide-react';

type Month={month:number;payments:number;gross:string;refunded:string;net:string;subscribers:number};
type Report={months:Month[];unreconciledRefunds:number;refundBasis:string;subscriberBasis:string};
type Account={id:string;email:string;display_name:string;active:boolean;deleted_at:string|null;portal_admin:boolean;sessions:{id:string;ip:string|null;agent:string|null;lastSeen:string}[];subscriptions:{institution:string;plan:string|null;status:string|null}[]};
const money=(value:string|number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)/100);
const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
async function dataFrom<T>(response:Response):Promise<T> {
  const body=await response.json() as {data:T;error?:string};
  if(!response.ok) throw new Error(body.error || 'Falha ao consultar a administração.');
  return body.data;
}
export function AdminDashboard({apiUrl,view}:{apiUrl:string;view:'revenue'|'subscribers'}) {
  const [year,setYear]=useState(new Date().getFullYear());
  const [report,setReport]=useState<Report|null>(null);
  const [users,setUsers]=useState<Account[]>([]);
  const [total,setTotal]=useState(0);
  const [filter,setFilter]=useState({q:'',ip:'',page:1});
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loadingUsers,setLoadingUsers]=useState(true);
  useEffect(()=>{
    if(view!=='revenue') return;
    let active=true;setReport(null);setError('');
    apiFetch(`${apiUrl}/api/admin/revenue?year=${year}`).then(dataFrom<Report>).then(v=>{if(active)setReport(v)}).catch(e=>{if(active)setError(String(e.message))});
    return()=>{active=false};
  },[apiUrl,year,view]);
  useEffect(()=>{
    if(view!=='subscribers') return;
    let active=true;setUsers([]);setError('');
    setLoadingUsers(true);
    const query=new URLSearchParams({q:filter.q,ip:filter.ip,page:String(filter.page)});
    apiFetch(`${apiUrl}/api/admin/subscribers?${query}`).then(dataFrom<{users:Account[];total:number}>).then(v=>{if(active){setUsers(v.users);setTotal(v.total)}}).catch(e=>{if(active)setError(String(e.message))}).finally(()=>{if(active)setLoadingUsers(false)});
    return()=>{active=false};
  },[apiUrl,filter,revision,view]);
  async function action(user:Account,action:string,sessionId?:string) {
    const label=({block:'Bloquear acesso',unblock:'Desbloquear acesso',delete:'Excluir de forma reversível',restore:'Restaurar conta','revoke-session':'Encerrar esta sessão'} as Record<string,string>)[action];
    if(!window.confirm(`${label}: ${user.email}? O histórico será preservado. Esta ação NÃO cancela cobranças ou assinaturas no Mercado Pago.`))return;
    setBusy(true);setError('');
    try {await apiFetch(`${apiUrl}/api/admin/subscribers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,action,sessionId})}).then(dataFrom);setRevision(v=>v+1)}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar conta.')}finally{setBusy(false)}
  }
  function search(event:FormEvent<HTMLFormElement>){event.preventDefault();const d=new FormData(event.currentTarget);setFilter({q:String(d.get('q')||''),ip:String(d.get('ip')||''),page:1});}
  const totals=report?.months.reduce((a,m)=>({gross:a.gross+Number(m.gross),refund:a.refund+Number(m.refunded),net:a.net+Number(m.net),payments:a.payments+m.payments}),{gross:0,refund:0,net:0,payments:0});
  const metricIcons=[Wallet,Undo2,CircleDollarSign,BadgeCheck];
  const PageIcon=view==='revenue'?ChartColumn:Users;
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
    <header className="flex items-start gap-4 border-b border-slate-200 pb-6">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--navy)] text-white shadow-sm"><PageIcon aria-hidden="true" className="size-7" /></span>
      <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-700">Administração</p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--navy)]">{view==='revenue'?'Receitas':'Assinantes'}</h1>
      <p className="mt-2 text-sm text-slate-500">{view==='revenue'?'Acompanhe os recebimentos e estornos mês a mês.':'Gerencie o acesso às contas e consulte suas assinaturas e sessões.'}</p>
      </div>
    </header>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {view==='revenue'&&<>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Receita bruta',totals?money(totals.gross):'—'],['Estornos',totals?money(totals.refund):'—'],['Líquida de estornos',totals?money(totals.net):'—'],['Pagamentos aprovados',totals?String(totals.payments):'—'],
    ].map(([label,value],i)=>{const Icon=metricIcons[i];return <article key={label} className={`rounded-2xl border p-5 shadow-sm ${i===2?'border-blue-900 bg-[var(--navy)] text-white':'border-slate-200 bg-white'}`}><div className="flex items-center justify-between gap-3"><p className={`text-sm ${i===2?'text-slate-300':'text-slate-500'}`}>{label}</p><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${i===2?'bg-white/10 text-cyan-200':i===1?'bg-amber-50 text-amber-700':'bg-blue-50 text-blue-700'}`}><Icon aria-hidden="true" className="size-5"/></span></div><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p><p className={`mt-2 text-xs ${i===2?'text-slate-300':'text-slate-400'}`}>Acumulado de {year}</p></article>})}</div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="flex items-center gap-2 text-xl font-semibold"><ChartColumn aria-hidden="true" className="size-5 text-blue-700"/>Receita mensal</h2><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium"><CalendarDays aria-hidden="true" className="size-4 text-slate-500"/>Ano <select aria-label="Ano do relatório" value={year} onChange={e=>setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white p-2">{Array.from({length:new Date().getFullYear()-1999},(_,i)=>new Date().getFullYear()-i).map(y=><option key={y}>{y}</option>)}</select></label></div>
      <p className="my-3 text-sm text-slate-600">Valores recebidos em reais. Receita líquida de estornos, sem dedução de taxas ou impostos. Assinantes são instituições pagantes, não número de professores.</p>
      {!report?<p role="status" className="py-12 text-center text-slate-500">{error?'Relatório indisponível.':'Carregando relatório…'}</p>:<>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Mês','Pagamentos aprovados','Receita bruta','Estornos','Líquida de estornos','Assinantes pagantes'].map(t=><th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{report.months.map(m=><tr className="border-t" key={m.month}><th className="p-3">{monthNames[m.month-1]}</th><td className="p-3">{m.payments}</td><td className="p-3">{money(m.gross)}</td><td className="p-3">{money(m.refunded)}</td><td className="p-3">{money(m.net)}</td><td className="p-3">{m.subscribers}</td></tr>)}</tbody></table></div>
        <p className="mt-4 font-semibold">Total líquido no ano: {money(report.months.reduce((n,m)=>n+Number(m.net),0))}</p>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0"/><span>{report.refundBasis} {report.subscriberBasis}</span></p>
        {report.unreconciledRefunds>0&&<p role="alert" className="mt-3 text-amber-800">Há {report.unreconciledRefunds} pagamento(s) estornado(s) sem valor reconciliado. O relatório ainda está incompleto para esses registros.</p>}
      </>}
    </section></>}
    {view==='subscribers'&&<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck aria-hidden="true" className="size-5 text-blue-700"/>Contas e acessos</h2><span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800"><Users aria-hidden="true" className="size-4"/>{loadingUsers?'Consultando…':`${total} contas no filtro`}</span></div>
      <p className="my-3 text-sm text-slate-600">Bloqueio e exclusão reversível impedem o login e encerram sessões, mas não cancelam cobranças. O IP é o endereço observado pelo servidor; pode ser compartilhado ou pertencer a um proxy. Não identifica um dispositivo físico.</p>
      <form onSubmit={search} className="mb-6 grid items-end gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto_auto]"><label className="text-sm font-medium"><span className="flex items-center gap-2"><Search aria-hidden="true" className="size-4 text-slate-500"/>Nome ou e-mail</span><Input className="mt-2 bg-white" name="q" placeholder="Buscar conta"/></label><label className="text-sm font-medium"><span className="flex items-center gap-2"><Network aria-hidden="true" className="size-4 text-slate-500"/>Endereço IP</span><Input className="mt-2 bg-white" name="ip" placeholder="IPv4 ou IPv6 exato"/></label><Button disabled={loadingUsers} type="submit"><Search aria-hidden="true"/>Filtrar</Button><Button type="reset" variant="outline" onClick={()=>setFilter({q:'',ip:'',page:1})}><RotateCcw aria-hidden="true"/>Limpar</Button></form>
      <div className="space-y-4">{users.map(user=><article key={user.id} className="rounded-xl border border-slate-200 p-5 transition hover:border-blue-200">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><UserRound aria-hidden="true" className="size-5"/></span><div className="min-w-0"><h3 className="font-semibold text-slate-900">{user.display_name}</h3><p className="break-all text-sm text-slate-500">{user.email}</p></div></div><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${user.deleted_at?'bg-slate-100 text-slate-600':user.active?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}>{user.deleted_at?<Trash2 aria-hidden="true" className="size-3.5"/>:user.active?<BadgeCheck aria-hidden="true" className="size-3.5"/>:<LockKeyhole aria-hidden="true" className="size-3.5"/>}{user.deleted_at?'Excluída (reversível)':user.active?'Ativa':'Bloqueada'}{user.portal_admin?' · Administrador geral':''}</span></div>
        {user.subscriptions.map((s,i)=><p className="mt-2 flex items-start gap-2 text-sm text-slate-600" key={i}><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0"/><span>{s.institution} · {s.plan||'Sem plano'} · {s.status||'Sem assinatura'}</span></p>)}
        {!user.portal_admin&&<div className="my-4 flex flex-wrap gap-2">{user.deleted_at?<Button disabled={busy} onClick={()=>action(user,'restore')}><RotateCcw aria-hidden="true"/>Restaurar</Button>:<><Button variant="outline" disabled={busy} onClick={()=>action(user,user.active?'block':'unblock')}>{user.active?<LockKeyhole aria-hidden="true"/>:<LockKeyholeOpen aria-hidden="true"/>}{user.active?'Bloquear':'Desbloquear'}</Button><Button className="text-rose-700 hover:bg-rose-50" variant="outline" disabled={busy} onClick={()=>action(user,'delete')}><Trash2 aria-hidden="true"/>Excluir conta</Button></>}</div>}
        <details className="group mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer rounded-lg py-2 text-sm font-medium text-slate-700"><Monitor aria-hidden="true" className="mr-2 inline size-4"/>Sessões ativas ({user.sessions.length})</summary>{!user.sessions.length&&<p className="py-3 text-sm text-slate-500">Nenhuma sessão ativa.</p>}{user.sessions.map(s=><div key={s.id} className="mt-2 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm"><p className="flex flex-wrap items-center gap-2"><Network aria-hidden="true" className="size-4 text-slate-500"/><span className="font-mono">{s.ip||'IP ainda não registrado'}</span><span className="text-slate-500">· Último acesso: {new Date(s.lastSeen).toLocaleString('pt-BR')}</span></p><p className="break-words text-slate-600">Navegador: {s.agent||'Ainda não registrado'}</p>{!user.portal_admin&&<Button variant="outline" disabled={busy} onClick={()=>action(user,'revoke-session',s.id)}><LogOut aria-hidden="true"/>Encerrar sessão</Button>}</div>)}</details>
      </article>)}</div>
      {!users.length&&<p role="status" className="rounded-xl border border-dashed p-10 text-center text-slate-500">{loadingUsers?'Carregando contas…':error?'Não foi possível carregar as contas.':'Nenhuma conta encontrada. Tente outro nome ou limpe os filtros.'}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button disabled={loadingUsers||filter.page===1} variant="outline" onClick={()=>setFilter(v=>({...v,page:v.page-1}))}><ChevronLeft aria-hidden="true"/>Anterior</Button><span className="text-sm text-slate-500">Página {filter.page}</span><Button disabled={loadingUsers||filter.page*25>=total} variant="outline" onClick={()=>setFilter(v=>({...v,page:v.page+1}))}>Próxima<ChevronRight aria-hidden="true"/></Button></div>
    </section>}
  </main>;
}
