import test from 'node:test';
import assert from 'node:assert/strict';
import {draftSchema,draftIdSchema} from './question-drafts.mjs';
test('rascunho aceita questão incompleta e preserva conteúdo científico',()=>{
 const payload={input:{subject:'Matemática',statementBlocks:[{type:'math',tex:'\\pmatrix{1}'}],alternatives:[]},editor:{educationStage:'Ensino Médio'}};
 assert.deepEqual(draftSchema.parse({version:0,payload}).payload,payload);
});
test('valida identificador, versão e envelope de rascunho',()=>{
 for(const value of ['../outra-conta','não-uuid'])assert.throws(()=>draftIdSchema.parse(value));
 assert.throws(()=>draftSchema.parse({version:-1,payload:{input:{},editor:{}}}));
 assert.throws(()=>draftSchema.parse({version:1,payload:{input:'texto',editor:{}}}));
 assert.throws(()=>draftSchema.parse({version:0,payload:{input:{statement:'x'.repeat(8_000_001)},editor:{}}}));
});
