import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from './db.mjs';
import {updateExamImportCandidate} from './exam-imports.mjs';
const institutionId='11111111-1111-4111-8111-111111111111';
const questionId='22222222-2222-4222-8222-222222222222';
async function withCandidate(candidate,question,action) {
  const original=pool.connect,queries=[];
  pool.connect=async()=>({release(){},async query(sql,args){
    queries.push({sql,args});
    if(sql.includes('SELECT extracted_candidates'))return {rowCount:1,rows:[{extracted_candidates:[{id:'candidate',...candidate}]}]};
    if(sql.includes('SELECT id,public_code FROM questions'))return {rowCount:question?1:0,rows:question?[{id:questionId,public_code:'MAT-0042'}]:[]};
    return {rowCount:1,rows:[]};
  }});
  try {await action(queries, input=>updateExamImportCandidate({institutionId,examImportId:'import',candidateId:'candidate',userId:institutionId,input}));}
  finally {pool.connect=original;}
}
test('cadastro persiste vínculo e data no histórico e retira a seleção pendente',async()=>{
  await withCandidate({status:'review',selected:true},true,async(queries,update)=>{
    await update({registeredQuestionId:questionId,registeredQuestionCode:'MAT-9999'});
    const persisted=JSON.parse(queries.find(q=>q.sql.includes('UPDATE exam_imports')).args[2])[0];
    assert.equal(persisted.status,'completed');assert.equal(persisted.selected,false);
    assert.equal(persisted.registeredQuestionId,questionId);assert.equal(persisted.registeredQuestionCode,'MAT-0042');
    assert.ok(persisted.registeredAt);assert.equal(queries.at(-1).sql,'COMMIT');
  });
});
test('não vincula questão externa nem devolve uma importação cadastrada às pendências',async()=>{
  await withCandidate({status:'review'},false,async(queries,update)=>{
    await assert.rejects(update({registeredQuestionId:questionId}),{statusCode:422});
    await assert.rejects(update({status:'completed'}),{statusCode:422});
    assert.equal(queries.at(-1).sql,'ROLLBACK');
  });
  await withCandidate({status:'completed',registeredQuestionId:questionId},true,async(queries,update)=>{
    await assert.rejects(update({status:'review'}),{statusCode:409});
    assert(!queries.some(q=>q.sql.includes('UPDATE exam_imports')));
  });
});
test('descarte e restauração mudam apenas a importação, preservando o banco de questões',async()=>{
  for(const [status,next] of [['review','ignored'],['ignored','review']]) {
    await withCandidate({status},false,async(queries,update)=>{
      await update({status:next,selected:next==='review'});
      assert(!queries.some(q=>/\b(?:UPDATE|DELETE FROM) questions\b/.test(q.sql)));
      assert.equal(JSON.parse(queries.find(q=>q.sql.includes('UPDATE exam_imports')).args[2])[0].status,next);
    });
  }
});
