'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export function PortalAdminSwitch({apiUrl,globalBank}:{apiUrl:string;globalBank:boolean}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function change(){
    setBusy(true);setError('');
    try{
      const response=await apiFetch(`${apiUrl}/api/admin/bank-context`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({globalBank:!globalBank})});
      const body=await response.json() as {error?:string};
      if(!response.ok)throw new Error(body.error||'Não foi possível alternar o banco.');
      window.location.reload();
    }catch(reason){setError(reason instanceof Error?reason.message:'Falha de conexão.');setBusy(false);}
  }
  return <div className="px-2 text-right">
    <button type="button" disabled={busy} onClick={change} className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-900 disabled:opacity-50">{busy?'Alternando…':globalBank?'Voltar ao meu espaço':'Administrar banco geral'}</button>
    {globalBank&&<p className="text-xs text-purple-800">Modo editorial · banco geral</p>}
    {error&&<output className="block text-xs text-red-700">{error}</output>}
  </div>;
}
