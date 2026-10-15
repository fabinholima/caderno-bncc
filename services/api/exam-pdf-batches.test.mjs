import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfPageGroups} from './exam-pdf-batches.mjs';
test('every page is covered once with overlap for continued questions',()=>{
 for(const total of [1,3,4,16,90]) {
  const groups=pdfPageGroups(total),pages=[];
  for(const g of groups){assert(g.contextFirst<=g.first);assert(g.contextLast>=g.last);assert(g.contextLast-g.contextFirst<5);for(let p=g.first;p<=g.last;p++)pages.push(p);}
  assert.deepEqual(pages,Array.from({length:total},(_,i)=>i+1));
 }
 assert.throws(()=>pdfPageGroups(NaN));assert.throws(()=>pdfPageGroups(501));
});
