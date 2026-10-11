/** Convert legacy text blocks into ConTeXt without changing their order.
 * Images and other structured resources remain separate blocks.
 * @template {{type:string,[key:string]:any}} T @param {T[]} blocks
 * @returns {Array<T|{type:'contextRaw',code:string}>} */
export function normalizeRawContextBlocks(blocks) {
 const result=[];let parts=[];
 const flush=()=>{if(parts.length){result.push({type:'contextRaw',code:parts.join('\n\n')});parts=[];}};
 for(const block of blocks){
  let code;
  switch(block.type){
   case 'paragraph': code=String(block.text||'').replace(/(?<!\\)([%&#])/g,'\\$1');break;
   case 'contextRaw': case 'contextInline': code=String(block.code||'');break;
   case 'contextFormula': code=`\\startformula\n${block.code||''}\n\\stopformula`;break;
   case 'math': code=block.display?`\\startformula\n${block.tex||''}\n\\stopformula`:`\\m{${block.tex||''}}`;break;
   case 'romanList': code=`\\startitemize[R]\n${(block.items||[]).map(item=>`\\item ${item}`).join('\n')}\n\\stopitemize`;break;
   default: flush();result.push(block);continue;
  }
  parts.push(code);
 }
 flush();return result;
}
