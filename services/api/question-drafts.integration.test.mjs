import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
const url=process.env.QUESTION_DRAFT_TEST_DATABASE_URL;
test('rascunhos persistem, isolam proprietários e detectam conflitos e retries',{skip:!url},async()=>{
 const schema=`draft_test_${randomUUID().replaceAll('-','')}`;
 const admin=new pg.Client({connectionString:url});await admin.connect();
 let pool;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET search_path TO ${schema}`);
  await admin.query('CREATE TABLE institutions(id uuid PRIMARY KEY); CREATE TABLE users(id uuid PRIMARY KEY)');
  await admin.query(await fs.readFile(new URL('../../database/075_question_editor_drafts.sql',import.meta.url),'utf8'));
  process.env.DATABASE_URL=url;process.env.PGOPTIONS=`-c search_path=${schema}`;
  const db=await import('./db.mjs');pool=db.pool;
  const {saveDraft,getDraft,listDrafts,completeDraft}=await import('./question-drafts.mjs');
  const institutionId=randomUUID(),userId=randomUUID(),otherUser=randomUUID(),id=randomUUID();
  await admin.query('INSERT INTO institutions VALUES($1)',[institutionId]);await admin.query('INSERT INTO users VALUES($1),($2)',[userId,otherUser]);
  const owner={institutionId,userId,id};
  const payload={input:{subject:'Matemática',statementBlocks:[{type:'math',tex:'\\pmatrix{1}'}]},editor:{educationStage:'Ensino Médio'}};
  const first=await saveDraft({...owner,input:{version:0,payload}});assert.equal(first.version,1);
  assert.equal((await saveDraft({...owner,input:{version:0,payload}})).version,1);
  assert.deepEqual((await getDraft(owner)).payload,payload);
  assert.equal((await listDrafts({institutionId,userId:otherUser})).length,0);
  await assert.rejects(getDraft({...owner,userId:otherUser}),{statusCode:404});
  await assert.rejects(saveDraft({...owner,userId:otherUser,input:{version:1,payload}}),{statusCode:409});
  const next={...payload,input:{...payload.input,subject:'Física'}};
  assert.equal((await saveDraft({...owner,input:{version:1,payload:next}})).version,2);
  assert.equal((await saveDraft({...owner,input:{version:1,payload:next}})).version,2);
  await assert.rejects(saveDraft({...owner,input:{version:1,payload}}),{statusCode:409});
  await completeDraft(owner);assert.equal((await listDrafts({institutionId,userId})).length,0);
  await assert.rejects(saveDraft({...owner,input:{version:2,payload:next}}),{statusCode:409});
 }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end()}
});
