import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractPdfWithGemini } from './exam-pdf-gemini.mjs';
const run = promisify(execFile);
// Each group has up to three core pages and one page of context on each side.
export function pdfPageGroups(pageCount) {
  if(!Number.isInteger(pageCount)||pageCount<1||pageCount>500) throw new Error('PDF deve ter de 1 a 500 páginas.');
  return Array.from({length:Math.ceil(pageCount/3)},(_,i)=>({first:i*3+1,last:Math.min(pageCount,i*3+3),contextFirst:Math.max(1,i*3),contextLast:Math.min(pageCount,i*3+4)}));
}
export async function extractPdfInBatches({pdfPath,directory,pageCount,onProgress,readBatch=extractPdfWithGemini}) {
  const groups=pdfPageGroups(pageCount), found=new Map();
  await run('pdfseparate',[pdfPath,join(directory,'ai-page-%d.pdf')],{timeout:60000,maxBuffer:1000000});
  for(let i=0;i<groups.length;i++) {
    const g=groups[i];
    await onProgress('reading_pdf_with_gemini',Math.round(45+25*i/groups.length));
    const batchPath=join(directory,`ai-batch-${i}.pdf`);
    const files=Array.from({length:g.contextLast-g.contextFirst+1},(_,j)=>join(directory,`ai-page-${g.contextFirst+j}.pdf`));
    await run('pdfunite',[...files,batchPath],{timeout:60000,maxBuffer:1000000});
    const candidates=await readBatch(await readFile(batchPath),{allowEmpty:true});
    for(const q of candidates) {
      const pageNumber=q.pageNumber+g.contextFirst-1;
      if(pageNumber<g.first||pageNumber>g.last) continue;
      if(found.has(q.sourceNumber)) throw new Error('A IA atribuiu o mesmo número a questões de páginas diferentes. Confira o original.');
      found.set(q.sourceNumber,{...q,pageNumber});
    }
  }
  return [...found.values()].sort((a,b)=>a.sourceNumber-b.sourceNumber);
}
