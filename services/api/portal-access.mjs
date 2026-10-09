import { pool, transaction } from './db.mjs';
import { z } from 'zod';
import { requirePortalAdmin } from './portal-admin.mjs';

export function sharedCatalogRoute(path) {
  return /^\/api\/(?:questions|question-filters|exam-imports|curriculum|pedagogical-disciplines|pedagogical-topics|saeb|chemical-structures|render-templates|render-fonts)(?:\/|$)/.test(path) || path === '/api/chemistry/structures/preview';
}

export function catalogAccess(identity, method, path) {
  const canEdit = Boolean(identity.portalAdmin || identity.portalEditor) && !identity.developmentBypass;
  const preview = method === 'POST' && ['/api/questions/preview','/api/chemistry/structures/preview'].includes(path);
  if (sharedCatalogRoute(path) && !canEdit && (path.startsWith('/api/exam-imports') || (!['GET','HEAD'].includes(method) && !preview)))
    throw Object.assign(new Error('Somente administradores e editores podem alterar o banco de questões e o catálogo.'), {statusCode:403});
  return canEdit;
}

export async function resolveUnifiedContext(identity) {
  if(identity.role === 'student') return {...identity,portalAdmin:false,portalEditor:false,globalBank:false,questionBankId:null,portalRole:'student'};
  const result = await pool.query('SELECT question_bank_id FROM portal_settings WHERE id=1');
  return { ...identity, globalBank:false, questionBankId:result.rows[0]?.question_bank_id || identity.institutionId,
    portalRole:identity.portalAdmin ? 'admin' : identity.portalEditor ? 'editor' : 'teacher' };
}

export async function setPortalEditor(identity,input) {
  requirePortalAdmin(identity);
  const value=z.object({email:z.string().trim().toLowerCase().email(),editor:z.boolean()}).parse(input);
  return transaction(async db=>{
    const result=await db.query('SELECT id,portal_admin FROM users WHERE lower(email)=$1 AND active FOR UPDATE',[value.email]);
    if(result.rowCount!==1) throw Object.assign(new Error('Conta ativa não encontrada. O usuário precisa se cadastrar primeiro.'),{statusCode:404});
    if(result.rows[0].portal_admin) throw Object.assign(new Error('Esta conta já é administradora geral.'),{statusCode:422});
    await db.query('UPDATE users SET portal_editor=$2 WHERE id=$1',[result.rows[0].id,value.editor]);
    await db.query("INSERT INTO audit_log(user_id,action,entity_type,entity_id,metadata) VALUES($1,'portal.editor.changed','user',$2,$3)",[identity.userId,result.rows[0].id,JSON.stringify({editor:value.editor})]);
    return {email:value.email,editor:value.editor};
  });
}
