import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db.mjs';
import {
  enqueueExamImportAnalysis,
  processExamImportJob,
} from './exam-import-jobs.mjs';

test('daily admission counts distinct exams and lets already admitted exams finish their batches', async () => {
  const original = pool.connect;
  let admitted = false,
    inserted = 0;
  const queries = [];
  pool.connect = async () => ({
    release() {},
    async query(sql) {
      queries.push(sql);
      if (sql.includes('SELECT id FROM exam_imports'))
        return { rowCount: 1, rows: [{ id: 'exam' }] };
      if (sql.includes('SELECT id,status')) return { rowCount: 0, rows: [] };
      if (sql.includes('AS day')) return { rows: [{ day: '2026-10-15' }] };
      if (sql.includes('SELECT 1 FROM exam_ai_daily_admissions'))
        return { rowCount: admitted ? 1 : 0, rows: [] };
      if (sql.includes('count(*)::int AS total FROM exam_ai_daily_admissions'))
        return { rows: [{ total: 3 }] };
      if (sql.includes('INSERT INTO exam_ai_daily_admissions')) inserted++;
      if (sql.includes('sp.concurrent_imports'))
        return { rows: [{ total: 0, concurrent_imports: 1 }] };
      if (sql.includes('INSERT INTO exam_import_jobs'))
        return { rows: [{ id: 'job', status: 'queued' }] };
      return { rows: [], rowCount: 0 };
    },
  });
  try {
    await assert.rejects(
      enqueueExamImportAnalysis({
        institutionId: 'school',
        userId: 'user',
        examImportId: 'fourth',
      }),
      (e) => e.statusCode === 429,
    );
    assert(queries.includes('ROLLBACK'));
    admitted = true;
    assert.equal(
      (
        await enqueueExamImportAnalysis({
          institutionId: 'school',
          userId: 'user',
          examImportId: 'exam',
        })
      ).status,
      'queued',
    );
    assert.equal(inserted, 0);
    assert(queries.some((q) => q.includes('pg_advisory_xact_lock')));
  } finally {
    pool.connect = original;
  }
});

test('worker reschedules Gemini quota exhaustion without marking the job failed', async () => {
  const query=pool.query, fetcher=globalThis.fetch;
  const previous={provider:process.env.EXAM_AI_PROVIDER,key:process.env.GEMINI_API_KEY};
  const updates=[];
  process.env.EXAM_AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='test-only';
  globalThis.fetch=async()=>({ok:false,status:429,headers:{get:()=>null}});
  pool.query=async(sql,args)=>{
    if(sql.startsWith('SELECT extracted_candidates')) return {rowCount:1,rows:[{extracted_candidates:[{id:'q1',rawText:'Enunciado de uma questão para testar.',selected:true,status:'review'}]}]};
    if(sql.includes('SELECT cancellation_requested')) return {rows:[{cancellation_requested:false}]};
    if(sql.includes('UPDATE exam_import_jobs')) updates.push({sql,args});
    return {rows:[],rowCount:0};
  };
  try {
    await processExamImportJob({id:'job',exam_import_id:'exam',institution_id:'school',job_type:'ai_analysis'});
    const waiting=updates.find(x=>x.sql.includes('waiting_quota'));
    assert(waiting);assert.equal(waiting.args[1],3600);
    assert(!updates.some(x=>x.args?.[1]==='failed'));
  } finally {
    pool.query=query;globalThis.fetch=fetcher;
    if(previous.provider===undefined) delete process.env.EXAM_AI_PROVIDER;else process.env.EXAM_AI_PROVIDER=previous.provider;
    if(previous.key===undefined) delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous.key;
  }
});
