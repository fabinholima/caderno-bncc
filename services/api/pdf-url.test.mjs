import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { publicPdfTarget, downloadPdfUrl } from './pdf-url.mjs';
import {examImportSchema} from './exam-imports.mjs';
const resolver=async()=>['8.8.8.8'];
test('rejects local, private, mixed DNS and credential URLs',async()=>{
  for(const url of ['http://example.com/a.pdf','https://localhost/a.pdf','https://127.0.0.1/a.pdf','https://169.254.169.254/a.pdf','https://user:pass@example.com/a.pdf','https://[::1]/a.pdf'])
    await assert.rejects(publicPdfTarget(url,async()=>['127.0.0.1']));
  await assert.rejects(publicPdfTarget('https://example.com/a.pdf',async()=>['8.8.8.8','10.0.0.1']));
});
function requesterFor(contents,statusCode=200){return (url,options,callback)=>{
  const req=new EventEmitter();req.destroy=()=>req.emit('close');
  req.end=()=>queueMicrotask(()=>{const res=Readable.from([contents]);res.statusCode=statusCode;res.headers={};res.on('close',()=>req.emit('close'));callback(res);});return req;
};}
test('downloads PDF with pinned address and rejects HTML and redirects',async()=>{
  const pdf=Buffer.from('%PDF-1.4\n'+'x'.repeat(100));
  const result=await downloadPdfUrl('https://example.com/key.pdf','answer_key',{resolver,requester:requesterFor(pdf)});
  assert.equal(result.kind,'answer_key');assert.equal(result.fileName,'gabarito.pdf');
  await assert.rejects(downloadPdfUrl('https://example.com/key.pdf','exam',{resolver,requester:requesterFor(Buffer.from('<html>not PDF</html>'))}),/PDF válido/);
  await assert.rejects(downloadPdfUrl('https://example.com/key.pdf','exam',{resolver,requester:requesterFor(pdf,302)}),/HTTP 302/);
});
test('import accepts both PDF URLs, rejects absent exam and duplicate answer key source',()=>{
 const base={sourceInstitution:'Teste',sourceYear:2026,examType:'enem',subjectMode:'multidisciplinary',examPdfUrl:'https://example.com/exam.pdf',answerKeyPdfUrl:'https://example.com/key.pdf'};
 assert.equal(examImportSchema.parse(base).documents.length,0);
 assert.throws(()=>examImportSchema.parse({...base,examPdfUrl:''}));
 assert.throws(()=>examImportSchema.parse({...base,documents:[{kind:'answer_key',fileName:'key.pdf',dataUrl:'data:application/pdf;base64,AAAA'}]}));
});

test('follows public redirects, revalidates private destinations and caps redirect loops',async()=>{
  const pdf=Buffer.from('%PDF-1.4\n'+'x'.repeat(100));
  let calls=0;
  const redirectTo=location=>(url,options,callback)=>{
    calls++;
    const req=new EventEmitter();req.destroy=()=>req.emit('close');
    req.end=()=>queueMicrotask(()=>{const res=Readable.from([]);res.statusCode=302;res.headers={location};res.on('close',()=>req.emit('close'));callback(res);});return req;
  };
  const redirect=redirectTo('/actual.pdf');
  const result=await downloadPdfUrl('https://example.com/download','exam',{resolver,requester:(url,options,callback)=>url.pathname==='/download'?redirect(url,options,callback):requesterFor(pdf)(url,options,callback)});
  assert.equal(result.kind,'exam');assert.equal(calls,1);
  calls=0;
  await assert.rejects(downloadPdfUrl('https://example.com/download','exam',{resolver,requester:redirectTo('https://127.0.0.1/private.pdf')}),/servidor público/);
  assert.equal(calls,1);
  await assert.rejects(downloadPdfUrl('https://example.com/download','exam',{resolver,requester:redirectTo('/download')}),/limite de redirecionamentos/);
});
