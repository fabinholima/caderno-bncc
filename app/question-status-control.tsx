'use client';
import {useState} from 'react';
import {apiFetch} from '@/lib/api-client';
import {questionStatusLabels,allowedQuestionTransitions} from '@/lib/question-workflow.mjs';
import {Button} from '@/components/ui/button';
const statusCodes:Record<string,string>=Object.fromEntries(Object.entries(questionStatusLabels).map(([code,label])=>[label,code]));
type History={created_at:string;changed_by:string|null;metadata:{from?:string;status:string;reason?:string;revision?:number}};
export function QuestionStatusControl({apiUrl,question,reviewer,canManage,onChanged,defaultExpanded=false}:{apiUrl:string;question:{id:string;status:string;revision?:number};reviewer:boolean;canManage:boolean;defaultExpanded?:boolean;onChanged:()=>Promise<void>}){
 const [next,setNext]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [history,setHistory]=useState<History[]>([]);
 const current=statusCodes[question.status]||'draft';const choices:string[]=allowedQuestionTransitions(current,reviewer);
 async function loadHistory(){try{const r=await apiFetch(`${apiUrl}/api/questions/${question.id}/status-history`,{cache:'no-store'});const b=await r.json() as {data:History[];error?:string};if(!r.ok)throw new Error(b.error);setHistory(b.data);}catch(e){setMessage(e instanceof Error?e.message:'Falha ao consultar histórico.')}}
 async function save(){
  setBusy(true);setMessage('');
  try{const r=await apiFetch(`${apiUrl}/api/questions/${question.id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next,reason,revision:question.revision})});const b=await r.json() as {error?:string};if(!r.ok)throw new Error(b.error||'Falha ao alterar status.');await onChanged();setNext('');setReason('');setMessage('Status atualizado.');await loadHistory();}
  catch(e){setMessage(e instanceof Error?e.message:'Falha ao alterar status.')}finally{setBusy(false)}
 }
 return <div className="min-w-40 space-y-2 text-xs">
  <span className={`font-semibold ${current==='approved'?'text-emerald-700':current==='needs_adjustments'?'text-rose-700':'text-slate-700'}`}>{question.status}</span>
  <details open={defaultExpanded} onToggle={e=>{if(e.currentTarget.open)void loadHistory()}}>
   <summary className="cursor-pointer text-blue-700">{canManage?'Atualizar situação e histórico':'Ver histórico'}</summary>
   {canManage&&<div className="mt-2 space-y-2 rounded-lg border bg-white p-3">
    <select aria-label="Nova situação da questão" value={next} disabled={busy} onChange={e=>setNext(e.target.value)} className="w-full rounded border p-2"><option value="">Selecione a situação</option>{choices.map(code=><option key={code} value={code}>{questionStatusLabels[code as keyof typeof questionStatusLabels]}</option>)}</select>
    <textarea aria-label="Motivo da alteração de situação" placeholder={next==='needs_adjustments'?'Descreva o que precisa ser corrigido (obrigatório)':'Motivo ou observação (opcional)'} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy} className="w-full rounded border p-2"/>
    <Button type="button" size="sm" disabled={busy||!next||(next==='needs_adjustments'&&!reason.trim())} onClick={()=>void save()}>{busy?'Atualizando…':'Atualizar situação'}</Button>
   </div>}
   <ul className="mt-2 max-h-56 space-y-2 overflow-auto">{history.map((h,i)=><li key={`${h.created_at}-${i}`} className="rounded bg-slate-50 p-2"><strong>{h.changed_by||'Usuário'} · {new Date(h.created_at).toLocaleString('pt-BR')}</strong><p>{h.metadata.from?`${questionStatusLabels[h.metadata.from as keyof typeof questionStatusLabels]||h.metadata.from} → `:''}{questionStatusLabels[h.metadata.status as keyof typeof questionStatusLabels]||h.metadata.status}{h.metadata.revision?` · revisão ${h.metadata.revision}`:''}</p>{h.metadata.reason&&<p className="whitespace-pre-wrap">{h.metadata.reason}</p>}</li>)}</ul>
   {!history.length&&<p className="mt-2 text-slate-500">Nenhuma alteração de situação registrada.</p>}
  </details>
  {message&&<p role="status">{message}</p>}
 </div>;
}
