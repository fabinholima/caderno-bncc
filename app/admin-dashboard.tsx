'use client';
import { useEffect, useState, type ReactNode, type SubmitEvent } from 'react';
import { formString } from '@/lib/form-data';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Wallet, Undo2, CircleDollarSign, BadgeCheck, Users, ChartColumn, Search, RotateCcw, Building2, LockKeyhole, LockKeyholeOpen, Trash2, Monitor, LogOut, ChevronLeft, ChevronRight, Info, MoreHorizontal, Clock3, Network, PanelRightOpen, Download, TriangleAlert, TrendingUp, TrendingDown, Receipt } from 'lucide-react';

type Month={month:number;payments:number;gross:string;refunded:string;net:string;subscribers:number};
type Report={year:number;months:Month[];previousTotals:{gross:number;refunded:number;net:number;payments:number};byPlan:{planId:string;plan:string;billing:'monthly'|'annual';payments:number;gross:string}[];years:number[];unreconciledRefunds:number;refundBasis:string;subscriberBasis:string};
type Session={id:string;ip:string|null;agent:string|null;lastSeen:string|null};
type Subscription={institution:string;planId:string|null;plan:string|null;status:string|null};
type Account={id:string;email:string;display_name:string;active:boolean;deleted_at:string|null;portal_admin:boolean;created_at:string;last_access:string|null;sessions:Session[];subscriptions:Subscription[]};
type Summary={total:number;active:number;blocked:number;deleted:number;trialing:number;paying:number};
type SubscriberPage={users:Account[];total:number;page:number;totalPages:number;summary:Summary;plans:{id:string;name:string}[]};
type AccountStatus='all'|'active'|'blocked'|'deleted';
type Filter={q:string;ip:string;status:AccountStatus;plan:string;sort:'recent'|'access'|'name';page:number};
type Action='block'|'unblock'|'delete'|'restore'|'revoke-session'|'revoke-all-sessions';
const money=(value:string|number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)/100);
const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
async function dataFrom<T>(response:Response):Promise<T> {
  const body=await response.json() as {data:T;error?:string};
  if(!response.ok) throw new Error(body.error || 'Falha ao consultar a administração.');
  return body.data;
}
export function AdminDashboard({apiUrl,view}:{apiUrl:string;view:'revenue'|'subscribers'}) {
  const PageIcon=view==='revenue'?ChartColumn:Users;
  // A página fica dentro do <main> do portal: aqui é uma seção, não outro <main>.
  return <section aria-labelledby="admin-title" className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
    <header className="flex items-start gap-4 border-b border-slate-200 pb-6">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--navy)] text-[var(--lime)] shadow-sm"><PageIcon aria-hidden="true" className="size-6" /></span>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-blue-700">Administração</p>
        <h1 id="admin-title" className="font-display text-3xl font-bold tracking-tight text-[var(--navy)]">{view==='revenue'?'Receitas':'Assinantes'}</h1>
        <p className="mt-2 text-sm text-slate-500">{view==='revenue'?'Acompanhe os recebimentos e estornos mês a mês.':'Gerencie o acesso às contas e consulte assinaturas e sessões.'}</p>
      </div>
    </header>
    {view==='revenue'?<RevenueView apiUrl={apiUrl}/>:<SubscribersView apiUrl={apiUrl}/>}
  </section>;
}

type Totals={gross:number;refunded:number;net:number;payments:number};
const sumMonths=(months:Month[]):Totals=>months.reduce((t,m)=>({gross:t.gross+Number(m.gross),refunded:t.refunded+Number(m.refunded),net:t.net+Number(m.net),payments:t.payments+m.payments}),{gross:0,refunded:0,net:0,payments:0});
const percent=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(value);
const moneyOrDash=(cents:number,future=false)=>future||cents===0?'—':money(cents);
// Variação em relação ao ano anterior, em texto (nunca só por cor).
function Change({current,previous,year}:{current:number;previous:number;year:number}) {
  if(!previous) return <p className="mt-2 text-xs text-slate-500">Sem dados de {year-1} para comparar</p>;
  const change=(current-previous)/Math.abs(previous);
  const Icon=change>=0?TrendingUp:TrendingDown;
  return <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${change>=0?'text-emerald-800':'text-amber-800'}`}><Icon aria-hidden="true" className="size-3.5"/>{change>=0?'+':''}{percent(change)} em relação a {year-1}</p>;
}

function RevenueView({apiUrl}:{apiUrl:string}) {
  const now=new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState('');
  const [exporting,setExporting]=useState(false);
  const [hovered,setHovered]=useState<number|null>(null);
  useEffect(()=>{
    let active=true;queueMicrotask(()=>{if(active){setReport(null);setError('')}});
    apiFetch(`${apiUrl}/api/admin/revenue?year=${year}`).then(dataFrom<Report>).then(v=>{if(active)setReport(v)}).catch(e=>{if(active)setError(String(e.message))});
    return()=>{active=false};
  },[apiUrl,year]);
  async function exportCsv() {
    setExporting(true);setError('');
    try {
      const response=await apiFetch(`${apiUrl}/api/admin/revenue.csv?year=${year}`);
      if(!response.ok) throw new Error('Não foi possível gerar a planilha.');
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement('a');link.href=url;link.download=`receitas-${year}.csv`;link.click();
      URL.revokeObjectURL(url);
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível gerar a planilha.')}
    finally {setExporting(false)}
  }
  // Meses ainda não encerrados do ano corrente aparecem como "—", não como zero.
  const isFuture=(month:number)=>year>now.getFullYear()||(year===now.getFullYear()&&month>now.getMonth()+1);
  const totals=report?sumMonths(report.months):null;
  const previous=report?.previousTotals;
  const ticket=totals&&totals.payments?totals.gross/totals.payments:0;
  const maxGross=Math.max(1,...(report?.months.map(m=>Number(m.gross))||[0]));
  const scaleTop=Math.ceil(maxGross/100_000)*100_000||100_000;
  const planTotal=report?.byPlan.reduce((n,p)=>n+Number(p.gross),0)||0;
  const shown=hovered!=null?report?.months.find(m=>m.month===hovered):null;
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="text-sm font-medium" htmlFor="revenue-year">Ano
        <select id="revenue-year" value={year} onChange={e=>setYear(Number(e.target.value))} className="mt-1.5 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">{(report?.years||[year]).map(y=><option key={y} value={y}>{y}</option>)}</select>
      </label>
      <Button variant="outline" disabled={!report||exporting} onClick={()=>{void exportCsv()}}><Download aria-hidden="true"/>{exporting?'Gerando…':'Exportar planilha (CSV)'}</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {report&&report.unreconciledRefunds>0&&<p role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0"/><span><strong>Relatório incompleto.</strong> {report.unreconciledRefunds===1?'Há 1 pagamento estornado sem valor reconciliado.':`Há ${report.unreconciledRefunds} pagamentos estornados sem valor reconciliado.`} Os estornos e a receita líquida podem estar menores ou maiores do que o real até a conciliação com o Mercado Pago.</span></p>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="flex items-center gap-2 text-sm text-slate-500"><Wallet aria-hidden="true" className="size-4"/>Receita bruta</p><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{totals?money(totals.gross):'—'}</p>{totals&&previous&&<Change current={totals.gross} previous={previous.gross} year={year}/>}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="flex items-center gap-2 text-sm text-slate-500"><Undo2 aria-hidden="true" className="size-4"/>Estornos</p><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{totals?money(totals.refunded):'—'}</p>{totals&&<p className="mt-2 text-xs text-slate-500">{totals.gross?`${percent(totals.refunded/totals.gross)} da receita bruta`:'Sem receita no período'}</p>}</article>
      <article className="col-span-2 rounded-2xl border border-[var(--navy)] bg-[var(--navy)] p-4 text-white sm:p-5 lg:col-span-1"><p className="flex items-center gap-2 text-sm text-slate-300"><CircleDollarSign aria-hidden="true" className="size-4 text-[var(--lime)]"/>Receita líquida</p><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{totals?money(totals.net):'—'}</p>{totals&&previous&&(previous.net?<p className="mt-2 text-xs font-medium text-slate-200">{totals.net>=previous.net?'+':''}{percent((totals.net-previous.net)/Math.abs(previous.net))} em relação a {year-1}</p>:<p className="mt-2 text-xs text-slate-300">Sem dados de {year-1} para comparar</p>)}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="flex items-center gap-2 text-sm text-slate-500"><BadgeCheck aria-hidden="true" className="size-4"/>Pagamentos</p><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{totals?totals.payments:'—'}</p>{totals&&previous&&<Change current={totals.payments} previous={previous.payments} year={year}/>}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="flex items-center gap-2 text-sm text-slate-500"><Receipt aria-hidden="true" className="size-4"/>Ticket médio</p><p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{totals?money(ticket):'—'}</p><p className="mt-2 text-xs text-slate-500">Receita bruta ÷ pagamentos</p></article>
    </div>

    {!report?<p aria-live="polite" className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-slate-500">{error?'Relatório indisponível.':'Carregando relatório…'}</p>:<>
    <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
      <section aria-labelledby="revenue-chart-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="revenue-chart-title" className="text-lg font-semibold">Receita bruta por mês</h2><p aria-live="polite" className="min-h-5 text-sm text-slate-600">{shown?`${monthNames[shown.month-1]}: ${money(Number(shown.gross))} bruta · ${money(Number(shown.refunded))} em estornos · ${shown.payments} pagamentos`:'Passe o mouse ou use Tab nas barras para ver os valores.'}</p></div>
        <div className="relative mt-8 h-56">
          {[1,0.5,0].map(f=><div key={f} aria-hidden="true" className="absolute inset-x-0 flex items-center gap-2" style={{bottom:`${f*100}%`}}><span className="w-14 shrink-0 -translate-y-1/2 text-right text-[12px] tabular-nums text-slate-500">{f===0?'0':`R$ ${(scaleTop*f/100_000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`}</span><span className="-translate-y-1/2 flex-1 border-t border-slate-200"/></div>)}
          <ol className="absolute inset-y-0 left-16 right-0 flex items-end gap-1 sm:gap-2">{report.months.map(m=>{const value=Number(m.gross);const future=isFuture(m.month);return <li key={m.month} className="flex h-full flex-1 flex-col justify-end">
            <button type="button" disabled={future} onMouseEnter={()=>setHovered(m.month)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(m.month)} onBlur={()=>setHovered(null)} aria-label={future?`${monthNames[m.month-1]}: mês ainda não encerrado`:`${monthNames[m.month-1]}: ${money(value)} de receita bruta`} className="group flex h-full w-full items-end rounded-t px-0.5 disabled:cursor-default">
              <span className={`w-full rounded-t-[4px] transition-colors ${future?'h-0':hovered===m.month?'bg-blue-800':'bg-blue-600 group-hover:bg-blue-800'}`} style={{height:future?0:`${Math.max(value?2:0,value/scaleTop*100)}%`}}/>
            </button></li>})}</ol>
        </div>
        <ol aria-hidden="true" className="ml-16 mt-2 flex gap-1 text-center text-[12px] text-slate-500 sm:gap-2">{report.months.map(m=><li key={m.month} className="flex-1"><span className="sm:hidden">{monthNames[m.month-1][0]}</span><span className="hidden sm:inline">{monthNames[m.month-1].slice(0,3)}</span></li>)}</ol>
      </section>
      <section aria-labelledby="revenue-plans-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 id="revenue-plans-title" className="text-lg font-semibold">Receita por plano</h2>
        {!report.byPlan.length?<p className="mt-4 text-sm text-slate-500">Nenhum pagamento em {year}.</p>:<ul className="mt-4 space-y-4">{report.byPlan.map(p=>{const share=planTotal?Number(p.gross)/planTotal:0;return <li key={`${p.planId}-${p.billing}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-slate-900">{p.plan} · {p.billing==='annual'?'anual':'mensal'}</span><span className="tabular-nums text-slate-700">{percent(share)}</span></div>
          <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{width:`${share*100}%`}}/></div>
          <p className="mt-1 text-xs tabular-nums text-slate-500">{money(Number(p.gross))} · {p.payments} {p.payments===1?'pagamento':'pagamentos'}</p>
        </li>})}</ul>}
      </section>
    </div>

    <section aria-labelledby="revenue-table-title" className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3"><h2 id="revenue-table-title" className="text-lg font-semibold">Detalhamento mensal</h2><p className="text-sm text-slate-500">Valores em reais, sem taxas ou impostos</p></div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm">
        <caption className="sr-only">Receita de {year} por mês: pagamentos, receita bruta, estornos, receita líquida e assinantes pagantes</caption>
        <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-5 py-3 text-left">Mês</th>{['Pagamentos','Receita bruta','Estornos','Receita líquida','Assinantes'].map(t=><th scope="col" key={t} className="px-4 py-3 text-right">{t}</th>)}</tr></thead>
        <tbody className="tabular-nums">{report.months.map(m=>{const future=isFuture(m.month);return <tr key={m.month} className={`border-b border-slate-100 ${future?'text-slate-500':''}`}><th scope="row" className="px-5 py-2.5 text-left font-medium">{monthNames[m.month-1]}{future&&<span className="ml-2 text-xs font-normal">(em aberto)</span>}</th><td className="px-4 py-2.5 text-right">{future||!m.payments?'—':m.payments}</td><td className="px-4 py-2.5 text-right">{moneyOrDash(Number(m.gross),future)}</td><td className="px-4 py-2.5 text-right">{moneyOrDash(Number(m.refunded),future)}</td><td className="px-4 py-2.5 text-right font-medium">{moneyOrDash(Number(m.net),future)}</td><td className="px-4 py-2.5 text-right">{future||!m.subscribers?'—':m.subscribers}</td></tr>})}</tbody>
        {totals&&<tfoot className="tabular-nums"><tr className="border-t-2 border-slate-300 font-semibold"><th scope="row" className="px-5 py-3 text-left">Total de {year}</th><td className="px-4 py-3 text-right">{totals.payments}</td><td className="px-4 py-3 text-right">{money(totals.gross)}</td><td className="px-4 py-3 text-right">{money(totals.refunded)}</td><td className="px-4 py-3 text-right">{money(totals.net)}</td><td className="px-4 py-3 text-right">—</td></tr></tfoot>}
      </table></div>
      <ul className="space-y-2 px-4 pb-4 md:hidden">{report.months.filter(m=>!isFuture(m.month)).map(m=><li key={m.month} className="rounded-xl border border-slate-200 p-3">
        <p className="flex items-baseline justify-between font-semibold"><span>{monthNames[m.month-1]}</span><span className="tabular-nums">{moneyOrDash(Number(m.net))}</span></p>
        <dl className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-600"><div><dt>Bruta</dt><dd className="tabular-nums text-slate-900">{moneyOrDash(Number(m.gross))}</dd></div><div><dt>Estornos</dt><dd className="tabular-nums text-slate-900">{moneyOrDash(Number(m.refunded))}</dd></div><div><dt>Pagamentos</dt><dd className="tabular-nums text-slate-900">{m.payments||'—'}</dd></div></dl>
      </li>)}{totals&&<li className="rounded-xl bg-slate-50 p-3 font-semibold"><p className="flex justify-between"><span>Total de {year}</span><span className="tabular-nums">{money(totals.net)}</span></p></li>}</ul>
      <details className="border-t border-slate-200 px-5 py-4 text-sm"><summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md font-medium text-blue-700"><Info aria-hidden="true" className="size-4"/>Como os valores são calculados</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600"><li>Receita bruta: pagamentos com data de aprovação no mês, no fuso de Mato Grosso do Sul.</li><li>Receita líquida: bruta menos estornos, sem dedução de taxas ou impostos.</li><li>{report.refundBasis}</li><li>{report.subscriberBasis}</li></ul>
      </details>
    </section>
    </>}
  </>;
}

const subscriptionStatus:Record<string,string>={trialing:'Em teste',active:'Pagante',past_due:'Pagamento pendente',cancelled:'Cancelada'};
const sortLabels={recent:'Mais recentes',access:'Último acesso',name:'Nome (A–Z)'};
const emptyFilter:Filter={q:'',ip:'',status:'all',plan:'',sort:'recent',page:1};
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const looksLikeIp=(value:string)=>/^[0-9.]+$/.test(value)&&value.split('.').length===4||/^[0-9a-f:]+$/i.test(value)&&value.includes(':');

function accountStatus(user:Account):Exclude<AccountStatus,'all'> {
  return user.deleted_at?'deleted':user.active?'active':'blocked';
}
function lastAccess(value:string|null) {
  if(!value) return 'Nunca acessou';
  const date=new Date(value);const days=Math.floor((Date.now()-date.getTime())/86_400_000);
  const time=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  return days<1&&date.getDate()===new Date().getDate()?`Hoje, ${time}`:days<2?`Ontem, ${time}`:dateTime.format(date);
}
// Resume o user-agent em "Navegador · Sistema" legível.
function browserSummary(agent:string|null) {
  if(!agent) return 'Navegador não informado';
  const browser=/Edg\//.test(agent)?'Edge':/Firefox\//.test(agent)?'Firefox':/Chrome\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'Outro navegador';
  const system=/iPhone|iPad/.test(agent)?'iPhone/iPad':/Android/.test(agent)?'Android':/Windows/.test(agent)?'Windows':/Macintosh|Mac OS/.test(agent)?'macOS':/Linux/.test(agent)?'Linux':'sistema não identificado';
  return `${browser} · ${system}`;
}
function planLine(s:Subscription) {
  return `${s.plan||'Sem plano'} · ${s.status?subscriptionStatus[s.status]||s.status:'Sem assinatura'}`;
}
function StatusBadge({user}:{user:Account}) {
  const status=accountStatus(user);
  const styles={active:'bg-emerald-50 text-emerald-800',blocked:'bg-amber-50 text-amber-800',deleted:'bg-slate-100 text-slate-700'}[status];
  const Icon={active:BadgeCheck,blocked:LockKeyhole,deleted:Trash2}[status];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}><Icon aria-hidden="true" className="size-3.5"/>{{active:'Ativa',blocked:'Bloqueada',deleted:'Excluída'}[status]}</span>;
}

type Pending={user:Account;action:Action;sessionId?:string};
const confirmations:Record<Action,{title:string;body:string;confirm:string;danger?:boolean}>={
  block:{title:'Bloquear acesso?',body:'A pessoa não conseguirá entrar e todas as sessões abertas serão encerradas. É possível desbloquear depois.',confirm:'Bloquear acesso',danger:true},
  unblock:{title:'Desbloquear acesso?',body:'A pessoa voltará a conseguir entrar com a senha atual.',confirm:'Desbloquear'},
  delete:{title:'Excluir conta?',body:'A conta deixa de aparecer como ativa, o login é impedido e as sessões são encerradas. O histórico é preservado e a exclusão pode ser desfeita em “Restaurar”.',confirm:'Excluir conta',danger:true},
  restore:{title:'Restaurar conta?',body:'A conta volta a ficar ativa e a pessoa poderá entrar novamente.',confirm:'Restaurar conta'},
  'revoke-session':{title:'Encerrar esta sessão?',body:'O dispositivo dessa sessão precisará fazer login de novo.',confirm:'Encerrar sessão'},
  'revoke-all-sessions':{title:'Encerrar todas as sessões?',body:'Todos os dispositivos conectados a esta conta precisarão fazer login de novo.',confirm:'Encerrar todas',danger:true},
};

function SubscribersView({apiUrl}:{apiUrl:string}) {
  const [data,setData]=useState<SubscriberPage|null>(null);
  const [filter,setFilter]=useState<Filter>(emptyFilter);
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [pending,setPending]=useState<Pending|null>(null);
  const [detailId,setDetailId]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;queueMicrotask(()=>{if(active){setError('');setLoading(true)}});
    const query=new URLSearchParams({q:filter.q,ip:filter.ip,status:filter.status,plan:filter.plan,sort:filter.sort,page:String(filter.page)});
    apiFetch(`${apiUrl}/api/admin/subscribers?${query}`).then(dataFrom<SubscriberPage>).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(String(e.message))}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[apiUrl,filter,revision]);
  const users=data?.users||[];
  const detail=users.find(u=>u.id===detailId)||null;
  const filtered=filter.q||filter.ip||filter.status!=='all'||filter.plan;
  async function confirmAction() {
    if(!pending) return;
    setBusy(true);setError('');
    try {
      await apiFetch(`${apiUrl}/api/admin/subscribers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:pending.user.id,action:pending.action,sessionId:pending.sessionId})}).then(dataFrom);
      setPending(null);setRevision(v=>v+1);
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao atualizar conta.');setPending(null)}
    finally {setBusy(false)}
  }
  function search(event:SubmitEvent<HTMLFormElement>) {
    event.preventDefault();const d=new FormData(event.currentTarget);const term=formString(d,'q').trim();
    setFilter({q:looksLikeIp(term)?'':term,ip:looksLikeIp(term)?term:'',status:formString(d,'status') as AccountStatus,plan:formString(d,'plan'),sort:formString(d,'sort') as Filter['sort'],page:1});
  }
  const summary=data?.summary;
  const statusCards:{key:AccountStatus;label:string;value?:number}[]=[{key:'all',label:'Contas',value:summary?.total},{key:'active',label:'Ativas',value:summary?.active},{key:'blocked',label:'Bloqueadas',value:summary?.blocked},{key:'deleted',label:'Excluídas',value:summary?.deleted}];
  const actionsFor=(user:Account):ReactNode=>user.portal_admin?null:<DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações para ${user.display_name}`}/>}><MoreHorizontal aria-hidden="true"/></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-52">
      <DropdownMenuItem onClick={()=>setDetailId(user.id)}><PanelRightOpen/> Ver detalhes e sessões</DropdownMenuItem>
      {user.sessions.length>0&&<DropdownMenuItem onClick={()=>setPending({user,action:'revoke-all-sessions'})}><LogOut/> Encerrar todas as sessões</DropdownMenuItem>}
      <DropdownMenuSeparator/>
      {user.deleted_at?<DropdownMenuItem onClick={()=>setPending({user,action:'restore'})}><RotateCcw/> Restaurar conta</DropdownMenuItem>:<>
        <DropdownMenuItem onClick={()=>setPending({user,action:user.active?'block':'unblock'})}>{user.active?<LockKeyhole/>:<LockKeyholeOpen/>}{user.active?'Bloquear acesso':'Desbloquear acesso'}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={()=>setPending({user,action:'delete'})}><Trash2/> Excluir conta</DropdownMenuItem>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
  const confirmation=pending&&confirmations[pending.action];
  return <>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {statusCards.map(card=><button key={card.key} type="button" aria-pressed={filter.status===card.key} onClick={()=>setFilter(f=>({...f,status:card.key,page:1}))} className={`rounded-2xl border p-4 text-left transition ${filter.status===card.key?'border-[var(--navy)] bg-[var(--navy)] text-white':'border-slate-200 bg-white hover:border-blue-300'}`}>
        <p className={`text-sm ${filter.status===card.key?'text-slate-300':'text-slate-500'}`}>{card.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{card.value??'—'}</p>
      </button>)}
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Em teste</p><p className="mt-1 text-2xl font-bold tabular-nums">{summary?.trialing??'—'}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Pagantes</p><p className="mt-1 text-2xl font-bold tabular-nums">{summary?.paying??'—'}</p></div>
    </div>
    <section aria-labelledby="accounts-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4 sm:p-5">
        <h2 id="accounts-title" className="sr-only">Contas e acessos</h2>
        <label className="min-w-60 flex-[2] text-sm font-medium" htmlFor="account-search">Buscar
          <span className="relative mt-1.5 block"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"/><Input id="account-search" name="q" defaultValue={filter.q||filter.ip} className="h-10 bg-white pl-9" placeholder="Nome, e-mail ou IP exato"/></span>
        </label>
        <label className="min-w-36 flex-1 text-sm font-medium" htmlFor="account-status">Situação
          <select id="account-status" name="status" value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value as AccountStatus,page:1}))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">Todas</option><option value="active">Ativas</option><option value="blocked">Bloqueadas</option><option value="deleted">Excluídas</option></select>
        </label>
        <label className="min-w-36 flex-1 text-sm font-medium" htmlFor="account-plan">Plano
          <select id="account-plan" name="plan" value={filter.plan} onChange={e=>setFilter(f=>({...f,plan:e.target.value,page:1}))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Todos os planos</option>{data?.plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="min-w-44 flex-1 text-sm font-medium" htmlFor="account-sort">Ordenar por
          <select id="account-sort" name="sort" value={filter.sort} onChange={e=>setFilter(f=>({...f,sort:e.target.value as Filter['sort'],page:1}))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{Object.entries(sortLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading} className="h-10"><Search aria-hidden="true"/>Buscar</Button>
          {filtered&&<Button type="reset" variant="outline" className="h-10" onClick={()=>setFilter(emptyFilter)}><RotateCcw aria-hidden="true"/>Limpar</Button>}
        </div>
        <details className="relative w-full text-sm">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md font-medium text-blue-700"><Info aria-hidden="true" className="size-4"/>Como funcionam bloqueio, exclusão e IP</summary>
          <p className="mt-2 max-w-3xl rounded-xl bg-slate-50 p-3 text-slate-600">Bloquear e excluir impedem o login e encerram as sessões, mas <strong>não cancelam cobranças no Mercado Pago</strong>. A exclusão é reversível e preserva o histórico. O IP é o endereço observado pelo servidor: pode ser compartilhado ou de um provedor, e não identifica um aparelho.</p>
        </details>
      </form>
      <p aria-live="polite" className="px-5 pt-4 text-sm text-slate-600">{loading?'Consultando contas…':`${data?.total??0} ${data?.total===1?'conta encontrada':'contas encontradas'}${filtered?' com os filtros atuais':''}`}</p>
      {!users.length&&!loading&&<p className="m-5 rounded-xl border border-dashed p-10 text-center text-slate-500">{error?'Não foi possível carregar as contas.':'Nenhuma conta encontrada. Tente outro termo ou limpe os filtros.'}</p>}
      {users.length>0&&<>
        <div className="hidden overflow-x-auto md:block">
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Contas, escolas, planos, situação e último acesso</caption>
            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-5 py-3">Conta</th><th scope="col" className="px-3 py-3">Escola e plano</th><th scope="col" className="px-3 py-3">Situação</th><th scope="col" className="px-3 py-3">Último acesso</th><th scope="col" className="px-3 py-3">Sessões</th><th scope="col" className="px-5 py-3 text-right"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{users.map(user=><tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
              <td className="px-5 py-3"><button type="button" onClick={()=>setDetailId(user.id)} className="text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline">{user.display_name}</button><p className="break-all text-slate-500">{user.email}</p>{user.portal_admin&&<p className="text-xs font-semibold text-blue-700">Administrador geral</p>}</td>
              <td className="px-3 py-3">{user.subscriptions.length?user.subscriptions.map((s,i)=><div key={i}><p className="text-slate-800">{s.institution}</p><p className="text-slate-500">{planLine(s)}</p></div>):<span className="text-slate-500">Sem escola</span>}</td>
              <td className="px-3 py-3"><StatusBadge user={user}/></td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{lastAccess(user.last_access)}</td>
              <td className="px-3 py-3 tabular-nums text-slate-700">{user.sessions.length}</td>
              <td className="px-5 py-3 text-right">{actionsFor(user)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className="space-y-3 p-4 md:hidden">{users.map(user=><li key={user.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><button type="button" onClick={()=>setDetailId(user.id)} className="text-left font-semibold text-slate-900">{user.display_name}</button><p className="break-all text-sm text-slate-500">{user.email}</p></div>{actionsFor(user)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge user={user}/><span className="inline-flex items-center gap-1 text-xs text-slate-600"><Clock3 aria-hidden="true" className="size-3.5"/>{lastAccess(user.last_access)}</span></div>
          {user.subscriptions.map((s,i)=><p key={i} className="mt-2 flex items-start gap-1.5 text-sm text-slate-600"><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0"/><span>{s.institution} · {planLine(s)}</span></p>)}
        </li>)}</ul>
      </>}
      <nav aria-label="Paginação das contas" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <Button disabled={loading||filter.page===1} variant="outline" onClick={()=>setFilter(f=>({...f,page:f.page-1}))}><ChevronLeft aria-hidden="true"/>Anterior</Button>
        <span className="text-sm text-slate-600">Página {data?.page??filter.page} de {data?.totalPages??1}</span>
        <Button disabled={loading||!data||filter.page>=data.totalPages} variant="outline" onClick={()=>setFilter(f=>({...f,page:f.page+1}))}>Próxima<ChevronRight aria-hidden="true"/></Button>
      </nav>
    </section>

    <Sheet open={Boolean(detail)} onOpenChange={open=>{if(!open)setDetailId(null)}}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {detail&&<>
          <SheetHeader><SheetTitle className="text-lg">{detail.display_name}</SheetTitle><SheetDescription className="break-all">{detail.email}</SheetDescription><div className="pt-1"><StatusBadge user={detail}/></div></SheetHeader>
          <div className="space-y-6 px-4 pb-6 text-sm">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4"><div><dt className="text-slate-500">Cadastro</dt><dd className="font-medium">{dateTime.format(new Date(detail.created_at))}</dd></div><div><dt className="text-slate-500">Último acesso</dt><dd className="font-medium">{lastAccess(detail.last_access)}</dd></div></dl>
            <section><h3 className="mb-2 font-semibold">Escolas e assinaturas</h3>{detail.subscriptions.length?<ul className="space-y-2">{detail.subscriptions.map((s,i)=><li key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3"><Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500"/><div><p className="font-medium">{s.institution}</p><p className="text-slate-600">{planLine(s)}</p></div></li>)}</ul>:<p className="text-slate-500">Nenhuma escola vinculada.</p>}</section>
            <section>
              <div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold">Sessões ativas ({detail.sessions.length})</h3>{!detail.portal_admin&&detail.sessions.length>1&&<Button size="sm" variant="outline" onClick={()=>setPending({user:detail,action:'revoke-all-sessions'})}><LogOut aria-hidden="true"/>Encerrar todas</Button>}</div>
              {!detail.sessions.length&&<p className="text-slate-500">Nenhuma sessão ativa.</p>}
              <ul className="space-y-2">{detail.sessions.map(s=><li key={s.id} className="rounded-lg border border-slate-200 p-3">
                <p className="flex items-center gap-2 font-medium"><Monitor aria-hidden="true" className="size-4 text-slate-500"/>{browserSummary(s.agent)}</p>
                <p className="mt-1 flex items-center gap-2 text-slate-600"><Network aria-hidden="true" className="size-4 text-slate-500"/>{s.ip?<span className="font-mono">{s.ip}</span>:'IP não registrado'}</p>
                <p className="mt-1 flex items-center gap-2 text-slate-600"><Clock3 aria-hidden="true" className="size-4 text-slate-500"/>{lastAccess(s.lastSeen)}</p>
                {!detail.portal_admin&&<Button size="sm" variant="outline" className="mt-2" onClick={()=>setPending({user:detail,action:'revoke-session',sessionId:s.id})}><LogOut aria-hidden="true"/>Encerrar sessão</Button>}
              </li>)}</ul>
            </section>
          </div>
        </>}
      </SheetContent>
    </Sheet>

    <AlertDialog open={Boolean(pending)} onOpenChange={open=>{if(!open&&!busy)setPending(null)}}>
      <AlertDialogContent>
        {pending&&confirmation&&<>
          <AlertDialogHeader><AlertDialogTitle>{confirmation.title}</AlertDialogTitle><AlertDialogDescription><span className="block font-medium text-slate-800">{pending.user.display_name} · {pending.user.email}</span><span className="mt-2 block">{confirmation.body}</span>{['block','delete'].includes(pending.action)&&<span className="mt-2 block font-medium text-amber-800">Isto não cancela a cobrança no Mercado Pago.</span>}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel><Button disabled={busy} variant={confirmation.danger?'destructive':'default'} onClick={()=>{void confirmAction()}}>{busy?'Aplicando…':confirmation.confirm}</Button></AlertDialogFooter>
        </>}
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
