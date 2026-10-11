'use client';
import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {apiFetch} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
export type DraftPayload={input:Record<string,any>;editor:Record<string,any>};
export type DraftActions={save:(force?:boolean)=>Promise<boolean>;complete:()=>Promise<void>};
export function QuestionDraftControls({apiUrl,capture,restore,paused,actions}:{apiUrl:string;capture:(form:HTMLFormElement)=>DraftPayload;restore:(payload:DraftPayload)=>void;paused:boolean;actions:MutableRefObject<DraftActions|null>}) {
 const root=useRef<HTMLDivElement>(null);
 const latest=useRef({capture,restore,paused});latest.current={capture,restore,paused};
 const state=useRef({id:crypto.randomUUID(),version:0,saved:'',baseline:'',busy:false,conflict:false});
 const pending=useRef({encoded:'',changedAt:0});
 const [status,setStatus]=useState('Salvamento automático ativo');
 const [busy,setBusy]=useState(false);
 const [drafts,setDrafts]=useState<Array<{id:string;subject:string;title:string;updated_at:string}>>([]);
 const [selected,setSelected]=useState('');
 async function list(){try{const r=await apiFetch(`${apiUrl}/api/questions/drafts`,{cache:'no-store'});if(r.ok){const b=await r.json() as {data:typeof drafts};setDrafts(b.data)}}catch{setStatus('Não foi possível consultar seus rascunhos.')}}
 function snapshot(){const form=root.current?.closest('form');return form?latest.current.capture(form):null;}
 async function save(force=false):Promise<boolean>{
  const value=snapshot();if(!value)return false;
  const encoded=JSON.stringify(value),s=state.current;
  if(!force && encoded===(s.saved||s.baseline))return true;
  if(s.conflict){setStatus('Conflito: retome o rascunho para carregar a versão atual.');return false;}
  if(s.busy)return false;
  s.busy=true;setBusy(true);setStatus('Salvando rascunho…');
  try{
   const r=await apiFetch(`${apiUrl}/api/questions/drafts/${s.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:s.version,payload:value})});
   const b=await r.json() as {data:{version:number;updated_at:string};error?:string};
   if(!r.ok){if(r.status===409)s.conflict=true;throw new Error(b.error||'Falha ao salvar o rascunho.');}
   s.version=b.data.version;s.saved=encoded;setStatus(`Rascunho salvo às ${new Date(b.data.updated_at).toLocaleTimeString('pt-BR')}`);return true;
  }catch(e){setStatus(e instanceof Error?e.message:'Sem conexão. O rascunho ainda não foi salvo; tentaremos novamente.');return false;}
  finally{s.busy=false;setBusy(false)}
 }
 async function complete(){const s=state.current;if(!s.version)return;const r=await apiFetch(`${apiUrl}/api/questions/drafts/${s.id}/complete`,{method:'POST'});if(!r.ok)throw new Error('A questão foi salva, mas o rascunho não foi encerrado.');}
 actions.current={save,complete};
 useEffect(()=>{
  state.current.baseline=JSON.stringify(snapshot());void list();
  const timer=setInterval(()=>{
    if(latest.current.paused || state.current.busy || state.current.conflict)return;
    const value=snapshot();if(!value)return;
    const encoded=JSON.stringify(value);
    if(encoded===(state.current.saved||state.current.baseline))return;
    if(encoded!==pending.current.encoded){pending.current={encoded,changedAt:Date.now()};setStatus('Alterações pendentes de salvamento…');return;}
    if(Date.now()-pending.current.changedAt>=1500)void save();
  },1000);
  const guard=(e:BeforeUnloadEvent)=>{const value=snapshot();if(value && JSON.stringify(value)!==(state.current.saved||state.current.baseline)){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',guard);
  return()=>{clearInterval(timer);window.removeEventListener('beforeunload',guard);actions.current=null};
 },[apiUrl]);
 async function discard(){
  if(!selected || !window.confirm('Descartar este rascunho? A questão cadastrada não será alterada.'))return;
  state.current.busy=true;setBusy(true);
  try{const r=await apiFetch(`${apiUrl}/api/questions/drafts/${selected}/complete`,{method:'POST'});if(!r.ok)throw new Error('Não foi possível descartar.');
    if(selected===state.current.id)state.current={id:crypto.randomUUID(),version:0,saved:'',baseline:JSON.stringify(snapshot()),busy:false,conflict:false};
    setSelected('');setStatus('Rascunho descartado.');await list();
  }catch(e){setStatus(e instanceof Error?e.message:'Falha ao descartar.')}finally{state.current.busy=false;setBusy(false)}
 }
 async function resume(){
  if(!selected || state.current.busy)return;
  if(!window.confirm('Retomar este rascunho e substituir o conteúdo atual do formulário?'))return;
  state.current.busy=true;setBusy(true);
  try{
   const r=await apiFetch(`${apiUrl}/api/questions/drafts/${selected}`,{cache:'no-store'});const b=await r.json() as {data:{id:string;version:number;payload:DraftPayload};error?:string};if(!r.ok)throw new Error(b.error);
   state.current={id:b.data.id as `${string}-${string}-${string}-${string}-${string}`,version:b.data.version,saved:JSON.stringify(b.data.payload),baseline:JSON.stringify(b.data.payload),busy:false,conflict:false};
   latest.current.restore(b.data.payload);setStatus('Rascunho recuperado. Salvamento automático ativo.');
  }catch(e){setStatus(e instanceof Error?e.message:'Falha ao retomar.')}finally{state.current.busy=false;setBusy(false)}
 }
 return <div ref={root} className="flex w-full flex-wrap items-center gap-2">
  <Button type="button" variant="outline" disabled={busy||paused||!apiUrl} onClick={()=>void save(true)}>Salvar rascunho</Button>
  <span role="status" className="text-xs text-slate-600">{status}</span>
  <Button type="button" variant="ghost" disabled={busy||paused} onClick={()=>void list()}>Atualizar rascunhos</Button>
  <select aria-label="Rascunhos salvos" value={selected} onChange={e=>setSelected(e.target.value)} className="max-w-xs rounded-lg border p-2 text-xs"><option value="">Retomar rascunho…</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.subject||'Sem disciplina'} · {d.title||'Sem enunciado'} · {new Date(d.updated_at).toLocaleString('pt-BR')}</option>)}</select>
  <Button type="button" variant="outline" disabled={!selected||busy||paused} onClick={()=>void resume()}>Retomar</Button>
  <Button type="button" variant="ghost" disabled={!selected||busy||paused} onClick={()=>void discard()}>Descartar rascunho</Button>
 </div>;
}
