import {z} from 'zod';
import {pool,transaction} from './db.mjs';
import {checkQuestionTransition} from '../../lib/question-workflow.mjs';
export const workflowSchema=z.object({status:z.enum(['draft','review','needs_adjustments','approved','archived']),reason:z.string().trim().max(1000).default(''),revision:z.number().int().positive().optional()});
export async function changeQuestionStatus({institutionId,userId,role='teacher',questionId,input}){
 const value=workflowSchema.parse(input),reviewer=role==='admin';
 if(value.status==='approved' && !value.revision)throw Object.assign(new Error('Informe a revisão conferida para aprovar a questão.'),{statusCode:422});
 return transaction(async db=>{
  const previous=await db.query('SELECT id,status,created_by,current_revision FROM questions WHERE id=$1 AND institution_id=$2 FOR UPDATE',[questionId,institutionId]);
  if(!previous.rowCount || (!reviewer && previous.rows[0].created_by!==userId))return null;
  const old=previous.rows[0];
  if(value.revision && value.revision!==old.current_revision)throw Object.assign(new Error('A questão foi editada. Revise a versão atual antes de alterar o status.'),{statusCode:409});
  checkQuestionTransition(old.status,value.status,reviewer,value.reason);
  const r=await db.query('UPDATE questions SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,public_code,current_revision,status,updated_at',[questionId,value.status]);
  await db.query("INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'question.status_changed','question',$3,$4::jsonb)",[institutionId,userId,questionId,JSON.stringify({from:old.status,status:value.status,reason:value.reason || 'Sem observação adicional.',revision:old.current_revision})]);
  return {id:r.rows[0].id,code:r.rows[0].public_code,revision:r.rows[0].current_revision,status:r.rows[0].status,updatedAt:r.rows[0].updated_at};
 });
}
export async function questionStatusHistory({institutionId,questionId}){
 const r=await pool.query("SELECT a.created_at,u.display_name AS changed_by,a.metadata FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.institution_id=$1 AND a.entity_id=$2::text AND a.action='question.status_changed' AND EXISTS(SELECT 1 FROM questions q WHERE q.id=$2::uuid AND q.institution_id=$1) ORDER BY a.created_at DESC,a.id DESC LIMIT 50",[institutionId,questionId]);return r.rows;
}

export async function assertApprovedQuestionSelection(db,institutionIds,questionIds){
 const r=await db.query("SELECT id FROM questions WHERE id=ANY($2::uuid[]) AND institution_id=ANY($1::uuid[]) AND status='approved' ORDER BY id FOR SHARE",[institutionIds,questionIds]);
 if(r.rowCount!==questionIds.length)throw Object.assign(new Error('Somente questões aprovadas podem entrar na avaliação. Atualize a seleção de questões.'),{statusCode:422});
}
