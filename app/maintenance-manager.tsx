'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

type MaintenanceResponse={data:{enabled:boolean;message:string};error?:string};
export function MaintenanceManager({apiUrl}:{apiUrl:string}) {
  const [enabled,setEnabled]=useState(false);
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    apiFetch(`${apiUrl}/api/admin/maintenance`,{cache:'no-store'}).then(async r=>{
      const body=await r.json() as MaintenanceResponse;if(!r.ok)throw new Error(body.error);
      if(active){setEnabled(body.data.enabled);setMessage(body.data.message);setReady(true)}
    }).catch(e=>{if(active)setNotice(e.message||'Não foi possível consultar a manutenção.')});
    return ()=>{active=false};
  },[apiUrl]);
  async function save(){
    if(enabled&&!window.confirm('Ativar manutenção? Visitantes e professores perderão acesso ao portal até você desativar este modo.'))return;
    setBusy(true);setNotice('');
    try{
      const response=await apiFetch(`${apiUrl}/api/admin/maintenance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,message})});
      const body=await response.json() as MaintenanceResponse;if(!response.ok)throw new Error(body.error);
      setEnabled(body.data.enabled);setMessage(body.data.message);setNotice(enabled?'Manutenção ativada. Você mantém acesso como administrador.':'Manutenção desativada. O portal está liberado.');
    }catch(e){setNotice(e instanceof Error?e.message:'Falha ao salvar.')}finally{setBusy(false)}
  }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="text-xl font-semibold text-slate-900">Manutenção do portal</h2>
    <p className="text-sm text-slate-600">Exibe uma página de manutenção e suspende o acesso de visitantes e professores. Administradores gerais continuam acessando o painel. A mudança aparece nas páginas abertas em até 15 segundos.</p>
    <label className="flex items-center gap-3 font-medium"><input type="checkbox" checked={enabled} disabled={!ready||busy} onChange={e=>setEnabled(e.target.checked)}/>Ativar modo de manutenção</label>
    <label className="block text-sm font-medium">Mensagem para os visitantes<textarea className="mt-2 block w-full rounded-xl border border-slate-300 p-3" maxLength={500} rows={3} value={message} disabled={!ready||busy} onChange={e=>setMessage(e.target.value)}/></label>
    <Button disabled={!ready||busy||!message.trim()} onClick={save}>{busy?'Salvando…':'Salvar manutenção'}</Button>
    {notice&&<p role="status" className="text-sm text-slate-700">{notice}</p>}
  </section>;
}
