import { isIP } from 'node:net';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { requirePortalAdmin } from './portal-admin.mjs';

export const reportSchema=z.object({year:z.coerce.number().int().min(2000).max(2100)});
export function sessionNetwork(request) {
  const raw=request.socket?.remoteAddress || '';
  const ip=raw.startsWith('::ffff:')?raw.slice(7):raw;
  return {ip:isIP(ip)?ip:null,agent:String(request.headers['user-agent'] || '').slice(0,512)};
}
export async function revenueReport(identity,input) {
  requirePortalAdmin(identity);
  const {year}=reportSchema.parse(input);
  const result=await pool.query(`WITH months AS (SELECT generate_series(1,12) AS month_number),
    approved AS (
      SELECT extract(month FROM p.paid_at AT TIME ZONE 'America/Campo_Grande')::int AS month_number,
        count(*)::int payments, sum(p.amount_cents)::bigint gross,
        count(DISTINCT c.institution_id)::int subscribers
      FROM billing_payments p JOIN billing_contracts c ON c.id=p.contract_id
      WHERE extract(year FROM p.paid_at AT TIME ZONE 'America/Campo_Grande')=$1
      GROUP BY 1),
    refunds AS (
      SELECT extract(month FROM observed_at AT TIME ZONE 'America/Campo_Grande')::int AS month_number,
        sum(amount_cents)::bigint refunded FROM billing_refund_events
      WHERE extract(year FROM observed_at AT TIME ZONE 'America/Campo_Grande')=$1 GROUP BY 1)
    SELECT m.month_number AS month,coalesce(a.payments,0) payments,coalesce(a.gross,0)::text gross,
      coalesce(r.refunded,0)::text refunded,(coalesce(a.gross,0)-coalesce(r.refunded,0))::text net,
      coalesce(a.subscribers,0) subscribers
    FROM months m LEFT JOIN approved a USING(month_number) LEFT JOIN refunds r USING(month_number) ORDER BY m.month_number`,[year]);
  const gaps=await pool.query("SELECT count(*)::int n FROM billing_payments WHERE status IN ('refunded','charged_back') AND refund_cents=0");
  return {year,months:result.rows,unreconciledRefunds:gaps.rows[0].n,refundBasis:'Data de recebimento da confirmação de estorno; não é a data de liquidação bancária.',subscriberBasis:'Instituições com pagamento aprovado no mês, inclusive pagamentos posteriormente estornados.'};
}
export const subscriberFilter=z.object({q:z.string().trim().max(120).default(''),ip:z.string().trim().refine(v=>!v||Boolean(isIP(v)),'Informe um IP válido.').default(''),page:z.coerce.number().int().min(1).default(1)});
export async function listSubscribers(identity,input) {
  requirePortalAdmin(identity);
  const {q,ip,page}=subscriberFilter.parse(input);
  const result=await pool.query(`SELECT u.id,u.email,u.display_name,u.active,u.deleted_at,u.portal_editor,u.portal_admin,
    count(*) OVER()::int total,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'ip',host(s.last_ip),'agent',s.user_agent,'lastSeen',s.last_seen_at))
      FROM user_sessions s WHERE s.user_id=u.id AND s.expires_at>now()),'[]') sessions,
    coalesce((SELECT jsonb_agg(jsonb_build_object('institution',i.name,'plan',sub.plan_id,'status',sub.status))
      FROM memberships m JOIN institutions i ON i.id=m.institution_id LEFT JOIN institution_subscriptions sub ON sub.institution_id=i.id WHERE m.user_id=u.id),'[]') subscriptions
    FROM users u WHERE ($1='' OR u.email ILIKE '%'||$1||'%' OR u.display_name ILIKE '%'||$1||'%')
    AND ($2::inet IS NULL OR EXISTS(SELECT 1 FROM user_sessions s WHERE s.user_id=u.id AND s.last_ip=$2::inet AND s.expires_at>now()))
    ORDER BY u.created_at DESC,u.id LIMIT 25 OFFSET $3`,[q,ip||null,(page-1)*25]);
  return {users:result.rows,total:result.rows[0]?.total||0,page};
}
export async function manageSubscriber(identity,input) {
  requirePortalAdmin(identity);
  const v=z.object({userId:z.uuid(),action:z.enum(['block','unblock','delete','restore','revoke-session']),sessionId:z.uuid().optional()}).parse(input);
  return transaction(async db=>{
    const found=await db.query('SELECT id,portal_admin,deleted_at FROM users WHERE id=$1 FOR UPDATE',[v.userId]);
    if(!found.rowCount) throw Object.assign(new Error('Conta não encontrada.'),{statusCode:404});
    if(v.userId===identity.userId || found.rows[0].portal_admin) throw Object.assign(new Error('Não é permitido bloquear ou excluir administradores por esta tela.'),{statusCode:403});
    if(v.action==='revoke-session') {
      if(!v.sessionId) throw Object.assign(new Error('Selecione a sessão.'),{statusCode:422});
      const result=await db.query('DELETE FROM user_sessions WHERE id=$1 AND user_id=$2',[v.sessionId,v.userId]);
      if(!result.rowCount) throw Object.assign(new Error('Sessão não encontrada.'),{statusCode:404});
    } else {
      if(v.action==='unblock' && found.rows[0].deleted_at) throw Object.assign(new Error('Restaure a conta excluída primeiro.'),{statusCode:422});
      await db.query(`UPDATE users SET active=$2,deleted_at=CASE WHEN $3='delete' THEN now() WHEN $3='restore' THEN NULL ELSE deleted_at END WHERE id=$1`,[v.userId,['unblock','restore'].includes(v.action),v.action]);
      if(['block','delete'].includes(v.action)) await db.query('DELETE FROM user_sessions WHERE user_id=$1',[v.userId]);
    }
    await db.query("INSERT INTO audit_log(user_id,action,entity_type,entity_id,metadata) VALUES($1,'admin.subscriber.changed','user',$2,$3)",[identity.userId,v.userId,JSON.stringify({action:v.action,sessionId:v.sessionId})]);
    return {changed:true};
  });
}
