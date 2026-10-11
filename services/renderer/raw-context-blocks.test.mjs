import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRawContextBlocks} from '../../lib/raw-context-blocks.mjs';
import {renderAssessment} from './render-contract.mjs';
import fs from 'node:fs';
test('cola texto e fórmula em um único campo ConTeXt, na ordem original',()=>{
 const converted=normalizeRawContextBlocks([{type:'paragraph',text:'Antes da fórmula: 10% e \\unit{2 kilogram}.'},{type:'contextFormula',code:'\\pmatrix{1}'},{type:'paragraph',text:'Depois da fórmula.'}]);
 assert.equal(converted.length,1);assert.equal(converted[0].type,'contextRaw');
 assert.equal(converted[0].code,'Antes da fórmula: 10\\% e \\unit{2 kilogram}.\n\n\\startformula\n\\pmatrix{1}\n\\stopformula\n\nDepois da fórmula.');
 assert.deepEqual(normalizeRawContextBlocks(converted),converted);
});
test('mantém listas e imagens em sua posição',()=>{
 const image={type:'image',dataUrl:'data:image/png;base64,AA==',alt:'Figura',caption:''};
 const converted=normalizeRawContextBlocks([{type:'paragraph',text:'Antes'},image,{type:'romanList',items:['Primeiro','Segundo']},{type:'paragraph',text:'Depois'}]);
 assert.equal(converted[1],image);assert.match(converted[2].code,/\\startitemize\[R\][\s\S]*Primeiro[\s\S]*Segundo[\s\S]*Depois/);
});
test('fonte do PDF conserva a ordem do enunciado e das alternativas',()=>{
 const snapshot=JSON.parse(fs.readFileSync(new URL('../../samples/assessment-snapshot.json',import.meta.url),'utf8'));
 snapshot.questions[0].statement=normalizeRawContextBlocks([{type:'paragraph',text:'TRECHO_ANTES'},{type:'contextFormula',code:'1+2'},{type:'paragraph',text:'TRECHO_DEPOIS'}]);
 const tex=renderAssessment(snapshot);assert(tex.indexOf('TRECHO_ANTES')<tex.indexOf('1+2'));assert(tex.indexOf('1+2')<tex.indexOf('TRECHO_DEPOIS'));
});
