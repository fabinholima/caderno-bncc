import { resolve4 } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address,prefix,'ipv4');
const fail = message => Object.assign(new Error(message), {statusCode:422});
export async function publicPdfTarget(value, resolver = resolve4) {
  let url;
  try { url = new URL(value); } catch { throw fail('URL do PDF inválida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hostname.includes(':')) throw fail('Use uma URL HTTPS pública de PDF, sem senha ou porta personalizada.');
  let addresses;
  try { addresses = isIP(url.hostname) ? [url.hostname] : await resolver(url.hostname); } catch { throw fail('Não foi possível localizar o servidor do PDF.'); }
  if (!addresses.length || addresses.some(ip => isIP(ip)!==4 || blocked.check(ip,'ipv4'))) throw fail('A URL deve apontar para um servidor público.');
  return {url,address:addresses[0]};
}
export async function downloadPdfUrl(value, kind, {resolver=resolve4, requester=request, redirects=0}={}) {
  const target = await publicPdfTarget(value,resolver);
  const contents = await new Promise((resolve,reject)=>{
    const req=requester(target.url, {method:'GET',headers:{accept:'application/pdf'},
      lookup:(_host, options, callback)=>callback(null,options?.all ? [{address:target.address,family:4}] : target.address,4)}, res=>{
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 4) { reject(fail('O link do PDF excedeu o limite de redirecionamentos.')); return; }
        try { resolve({redirect:new URL(res.headers.location,target.url).href}); }
        catch { reject(fail('O link do PDF retornou um redirecionamento inválido.')); }
        return;
      }
      if(res.statusCode!==200) {res.resume();reject(fail(`O servidor do PDF respondeu HTTP ${res.statusCode}. Use um link de download público, sem login.`));return;}
      if(Number(res.headers['content-length'])>15_000_000) {res.destroy();reject(fail('O PDF da URL excede 15 MB.'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>15_000_000){res.destroy();reject(fail('O PDF da URL excede 15 MB.'));}else chunks.push(chunk);});
      res.on('end',()=>resolve(Buffer.concat(chunks)));
      res.on('error',()=>reject(fail('Falha ao baixar o PDF da URL.')));
    });
    const timer=setTimeout(()=>{req.destroy();reject(fail('Tempo limite ao baixar o PDF.'));},20000);
    req.on('close',()=>clearTimeout(timer));
    req.on('error',()=>{clearTimeout(timer);reject(fail('Não foi possível baixar o PDF.'));});
    req.end();
  });
  if (contents.redirect) return downloadPdfUrl(contents.redirect,kind,{resolver,requester,redirects:redirects+1});
  if(contents.length<100 || contents.subarray(0,5).toString('ascii')!=='%PDF-') throw fail('A URL não retornou um arquivo PDF válido.');
  return {kind,fileName:kind==='exam'?'prova.pdf':'gabarito.pdf',dataUrl:`data:application/pdf;base64,${contents.toString('base64')}`};
}
