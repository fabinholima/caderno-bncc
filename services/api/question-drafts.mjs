import { z } from 'zod';
import {pool,transaction} from './db.mjs';
export const draftIdSchema=z.uuid();
export const draftSchema=z.object({version:z.number().int().min(0),payload:z.object({input:z.record(z.string(),z.unknown()),editor:z.record(z.string(),z.unknown())})}).refine(v=>Buffer.byteLength(JSON.stringify(v.payload))<=8_000_000,'O rascunho excede 8 MB.');
const notFound=()=>Object.assign(new Error('Rascunho não encontrado.'),{statusCode:404});
export async function listDrafts({institutionId,userId}) {
 const r=await pool.query("SELECT id,version,updated_at,payload->'input'->>'subject' AS subject,left(payload->'input'->>'statement',120) AS title FROM question_editor_drafts WHERE institution_id=$1 AND user_id=$2 AND completed_at IS NULL ORDER BY updated_at DESC LIMIT 50",[institutionId,userId]);return r.rows;
}
export async function getDraft({institutionId,userId,id}) {
 const r=await pool.query('SELECT id,version,payload,updated_at FROM question_editor_drafts WHERE id=$1 AND institution_id=$2 AND user_id=$3 AND completed_at IS NULL',[draftIdSchema.parse(id),institutionId,userId]);if(!r.rowCount)throw notFound();return r.rows[0];
}
export async function saveDraft({institutionId,userId,id,input}) {
 id=draftIdSchema.parse(id);const value=draftSchema.parse(input);
 return transaction(async db=>{
  if(value.version===0){
   await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
   const count=await db.query('SELECT count(*)::int AS n FROM question_editor_drafts WHERE institution_id=$1 AND user_id=$2 AND completed_at IS NULL',[institutionId,userId]);
   if(count.rows[0].n>=50)throw Object.assign(new Error('Limite de 50 rascunhos. Retome e conclua os anteriores.'),{statusCode:422});
   const r=await db.query('INSERT INTO question_editor_drafts(id,institution_id,user_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id,version,updated_at',[id,institutionId,userId,JSON.stringify(value.payload)]);
   if(r.rowCount)return r.rows[0];
  }else{
   const r=await db.query('UPDATE question_editor_drafts SET payload=$4,version=version+1,updated_at=now() WHERE id=$1 AND institution_id=$2 AND user_id=$3 AND version=$5 AND completed_at IS NULL RETURNING id,version,updated_at',[id,institutionId,userId,JSON.stringify(value.payload),value.version]);if(r.rowCount)return r.rows[0];
  }
  // An identical retry after a lost HTTP response must not overwrite another tab.
  const retry=await db.query('SELECT id,version,updated_at FROM question_editor_drafts WHERE id=$1 AND institution_id=$2 AND user_id=$3 AND version=$5+1 AND payload=$4::jsonb AND completed_at IS NULL',[id,institutionId,userId,JSON.stringify(value.payload),value.version]);
  if(retry.rowCount)return retry.rows[0];
  throw Object.assign(new Error('O rascunho mudou em outra aba ou já foi concluído. Reabra o rascunho antes de continuar.'),{statusCode:409});
 });
}
export async function completeDraft({institutionId,userId,id}) {
 const r=await pool.query('UPDATE question_editor_drafts SET completed_at=now() WHERE id=$1 AND institution_id=$2 AND user_id=$3 RETURNING id',[draftIdSchema.parse(id),institutionId,userId]);if(!r.rowCount)throw notFound();return {completed:true};
}
