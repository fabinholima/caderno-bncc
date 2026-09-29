import { pool, transaction } from './db.mjs';

export function requirePortalAdmin(identity) {
  if (!identity?.portalAdmin || identity.developmentBypass || !identity.sessionId)
    throw Object.assign(new Error('Acesso exclusivo do administrador do portal.'), { statusCode: 403 });
}

export function globalBankRouteAllowed(path) {
  return /^\/api\/(?:questions|question-filters|exam-imports|curriculum|pedagogical-disciplines|pedagogical-topics|saeb|chemical-structures|render-templates|render-fonts)(?:\/|$)/.test(path) ||
    ['/api/auth/me','/api/auth/logout','/api/admin/bank-context','/api/chemistry/structures/preview'].includes(path);
}

export async function resolvePortalContext(identity, globalBank) {
  if (!identity.portalAdmin || identity.developmentBypass || !globalBank) return { ...identity, globalBank: false };
  const result = await pool.query('SELECT i.id,i.name FROM portal_settings p JOIN institutions i ON i.id=p.question_bank_id WHERE p.id=1');
  if (!result.rowCount) throw Object.assign(new Error('Banco geral não configurado.'), { statusCode:503 });
  return { ...identity, globalBank: true, institutionId: result.rows[0].id, institutionName: result.rows[0].name, role:'admin' };
}

export async function switchBank(identity,input) {
  requirePortalAdmin(identity);
  if (typeof input?.globalBank !== 'boolean') throw Object.assign(new Error('Selecione o contexto do banco.'),{statusCode:422});
  await transaction(async db=>{
    await db.query('UPDATE user_sessions SET global_bank=$2 WHERE id=$1 AND user_id=$3',[identity.sessionId,input.globalBank,identity.userId]);
    await db.query("INSERT INTO audit_log(user_id,action,metadata) VALUES($1,'portal.bank_context.changed',$2)",[identity.userId,JSON.stringify({globalBank:input.globalBank})]);
  });
  return { globalBank:input.globalBank };
}
