import { pool, transaction } from './db.mjs';
import { requirePortalAdmin } from './portal-admin.mjs';

export function maintenanceBlocks(state, identity) {
  return state.enabled && !(identity?.portalAdmin && identity.sessionId && !identity.developmentBypass);
}
export function validateMaintenance(input) {
  if (typeof input?.enabled !== 'boolean' || typeof input?.message !== 'string' || !input.message.trim() || input.message.trim().length > 500)
    throw Object.assign(new Error('Informe o estado e uma mensagem de até 500 caracteres.'), {statusCode:422});
  return {enabled:input.enabled,message:input.message.trim()};
}
export async function maintenanceStatus() {
  const result = await pool.query('SELECT maintenance_enabled AS enabled, maintenance_message AS message FROM portal_settings WHERE id=1');
  if (!result.rowCount) throw Object.assign(new Error('Configuração do portal indisponível.'),{statusCode:503});
  return result.rows[0];
}
export async function saveMaintenance(identity,input) {
  requirePortalAdmin(identity);
  const state = validateMaintenance(input);
  await transaction(async db => {
    await db.query('UPDATE portal_settings SET maintenance_enabled=$1,maintenance_message=$2 WHERE id=1',[state.enabled,state.message]);
    await db.query("INSERT INTO audit_log(user_id,action,metadata) VALUES($1,'portal.maintenance.changed',$2)",[identity.userId,JSON.stringify(state)]);
  });
  return state;
}
