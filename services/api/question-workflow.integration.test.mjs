import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs/promises';
const url=process.env.QUESTION_WORKFLOW_TEST_DATABASE_URL;
test('fluxo registra histórico e só questões aprovadas podem compor avaliações',{skip:!url},async()=>{
 const schema=`workflow_${randomUUID().replaceAll('-','')}`;const c=new pg.Client({connectionString:url});await c.connect();let pool;
 try{
  await c.query(`CREATE SCHEMA ${schema};SET search_path TO ${schema}`);
  await c.query("CREATE TYPE question_status AS ENUM('draft','review','approved','archived'); CREATE TABLE users(id uuid PRIMARY KEY,display_name text); CREATE TABLE questions(id uuid PRIMARY KEY,institution_id uuid,created_by uuid,current_revision int,status question_status,public_code text,updated_at timestamptz DEFAULT now()); CREATE TABLE audit_log(id bigserial PRIMARY KEY,institution_id uuid,user_id uuid,action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz DEFAULT now());");
  await c.query(await fs.readFile(new URL('../../database/078_question_adjustment_status.sql',import.meta.url),'utf8'));
  process.env.DATABASE_URL=url;process.env.PGOPTIONS=`-c search_path=${schema}`;pool=(await import('./db.mjs')).pool;
  const {changeQuestionStatus,questionStatusHistory,assertApprovedQuestionSelection}=await import('./question-workflow.mjs');
  const id=randomUUID(),institutionId=randomUUID(),userId=randomUUID(),other=randomUUID();await c.query("INSERT INTO users VALUES($1,'Editor'),($2,'Revisor')",[userId,other]);await c.query("INSERT INTO questions VALUES($1,$2,$3,1,'draft','TEST-1',now())",[id,institutionId,userId]);
  const args={questionId:id,institutionId,userId};
  assert.deepEqual(await questionStatusHistory(args),[]);
  assert.deepEqual(await questionStatusHistory({...args,questionId:randomUUID()}),[]);
  await assert.rejects(assertApprovedQuestionSelection(c,[institutionId],[id]),{statusCode:422});
  assert.equal(await changeQuestionStatus({...args,userId:other,input:{status:'review'}}),null);
  await changeQuestionStatus({...args,input:{status:'review',revision:1}});
  await assert.rejects(changeQuestionStatus({...args,input:{status:'approved',revision:1}}),{statusCode:403});
  await assert.rejects(changeQuestionStatus({...args,userId:other,role:'admin',input:{status:'needs_adjustments'}}),{statusCode:422});
  await changeQuestionStatus({...args,userId:other,role:'admin',input:{status:'needs_adjustments',reason:'Gabarito incorreto.'}});
  await assert.rejects(assertApprovedQuestionSelection(c,[institutionId],[id]),{statusCode:422});
  await changeQuestionStatus({...args,input:{status:'review'}});
  await assert.rejects(changeQuestionStatus({...args,userId:other,role:'admin',input:{status:'approved',revision:2}}),{statusCode:409});
  await changeQuestionStatus({...args,userId:other,role:'admin',input:{status:'approved',revision:1,reason:'Conferida.'}});
  await assertApprovedQuestionSelection(c,[institutionId],[id]);
  await assert.rejects(assertApprovedQuestionSelection(c,[randomUUID()],[id]),{statusCode:422});
  assert.deepEqual(await questionStatusHistory({...args,institutionId:randomUUID()}),[]);
  const h=await questionStatusHistory(args);assert.equal(h.length,4);assert.equal(h[0].changed_by,'Revisor');assert.equal(h[0].metadata.from,'review');assert.equal(h[0].metadata.reason,'Conferida.');
  await changeQuestionStatus({...args,userId:other,role:'admin',input:{status:'draft'}});
  await assert.rejects(assertApprovedQuestionSelection(c,[institutionId],[id]),{statusCode:422});
 }finally{if(pool)await pool.end();await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await c.end()}
});
