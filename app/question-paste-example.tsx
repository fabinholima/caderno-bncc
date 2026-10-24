'use client';
import {useId,useState} from 'react';
import {Info,X} from 'lucide-react';

const example=`(UfaProva - 2026)
Uma escola organizou 240 livros em 8 estantes, com a mesma quantidade em cada estante. Quantos livros ficaram em cada uma?

A) 20 livros
B) 30 livros
C) 40 livros
D) 60 livros
E) 80 livros`;

export function QuestionPasteExample(){
 const [open,setOpen]=useState(false);
 const [message,setMessage]=useState('');
 const id=useId();
 async function copy(){
  try{await navigator.clipboard.writeText(example);setMessage('Exemplo copiado.');}
  catch{setMessage('Selecione o texto do exemplo e copie manualmente.');}
 }
 return <span className="relative inline-flex shrink-0">
  <button type="button" aria-label="Ver exemplo de como colar uma questão pronta" aria-expanded={open} aria-controls={id} title="Como colar uma questão pronta" onClick={()=>{setOpen(!open);setMessage('')}} className="rounded-full p-1 text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"><Info className="size-4" aria-hidden="true"/></button>
  {open&&<span id={id} role="note" className="fixed left-1/2 top-1/2 z-50 block max-h-[80vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-blue-200 bg-white p-4 text-left text-sm font-normal leading-6 text-slate-700 shadow-xl">
   <span className="flex items-center justify-between gap-2"><strong className="text-blue-900">Como colar uma questão</strong><button type="button" aria-label="Fechar exemplo" onClick={()=>setOpen(false)} className="rounded p-1 hover:bg-slate-100"><X className="size-4" aria-hidden="true"/></button></span>
   <span className="mt-2 block">Comece com a instituição e o ano entre parênteses. Depois cole o enunciado e cada alternativa em uma linha, de A) a E).</span>
   <span className="mt-3 block select-text whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs leading-5">{example}</span>
   <span className="mt-3 block">Após analisar, confira os campos e marque o gabarito. Neste exemplo, a alternativa correta é B. Se não souber a origem ou o ano, complete esses campos depois.</span>
   <button type="button" onClick={()=>void copy()} className="mt-3 rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-800">Copiar exemplo</button>
   <span aria-live="polite" className="mt-1 block text-xs text-blue-800">{message}</span>
  </span>}
 </span>;
}
