'use client';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PortalEditorManager({apiUrl}:{apiUrl:string}) {
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    setBusy(true); setMessage('');
    try {
      const response=await apiFetch(`${apiUrl}/api/admin/editors`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),editor:data.get('profile')==='editor'})});
      const body=await response.json() as {error?:string};
      if(!response.ok) throw new Error(body.error || 'Não foi possível alterar o perfil.');
      setMessage('Perfil atualizado. O usuário deve atualizar a página para ver as permissões.');
    } catch(error) {setMessage(error instanceof Error?error.message:'Falha de conexão.');}
    finally{setBusy(false);}
  }
  return <section className="rounded-2xl border bg-white p-5 lg:col-span-2">
    <h2 className="text-lg font-semibold">Permissões do portal</h2>
    <p className="my-3 text-sm text-slate-600">Selecione uma conta já cadastrada. Editores podem cadastrar, editar e importar questões, além de gerar provas. Professores consultam o acervo e geram provas.</p>
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <Input name="email" type="email" required aria-label="E-mail da conta" placeholder="E-mail da conta" />
      <select name="profile" aria-label="Perfil de acesso" className="rounded-lg border p-2"><option value="teacher">Professor</option><option value="editor">Editor</option></select>
      <Button type="submit" disabled={busy}>{busy?'Salvando…':'Salvar permissão'}</Button>
    </form>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
