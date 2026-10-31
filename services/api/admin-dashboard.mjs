import { isIP } from 'node:net';
import { clientIp } from './request-security.mjs';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { requirePortalAdmin } from './portal-admin.mjs';

export const reportSchema=z.object({year:z.coerce.number().int().min(2000).max(2100)});
export function sessionNetwork(request) {
  return {ip:clientIp(request),agent:String(request.headers['user-agent'] || '').slice(0,512)};
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
export const subscriberFilter=z.object({
  q:z.string().trim().max(120).default(''),
  ip:z.string().trim().refine(v=>!v||Boolean(isIP(v)),'Informe um IP válido.').default(''),
  status:z.enum(['all','active','blocked','deleted']).default('all'),
  plan:z.string().trim().max(60).default(''),
  sort:z.enum(['recent','access','name']).default('recent'),
  page:z.coerce.number().int().min(1).default(1),
});
const subscriberPageSize=25;
// Filtros por texto ($1), IP ($2), situação da conta ($3) e plano ($4).
const subscriberWhere=`WHERE ($1='' OR u.email ILIKE '%'||$1||'%' OR u.display_name ILIKE '%'||$1||'%')
    AND ($2::inet IS NULL OR EXISTS(SELECT 1 FROM user_sessions s WHERE s.user_id=u.id AND s.last_ip=$2::inet AND s.expires_at>now()))
    AND ($3='all' OR ($3='deleted' AND u.deleted_at IS NOT NULL) OR ($3='blocked' AND u.deleted_at IS NULL AND NOT u.active) OR ($3='active' AND u.deleted_at IS NULL AND u.active))
    AND ($4='' OR EXISTS(SELECT 1 FROM memberships m JOIN institution_subscriptions sub ON sub.institution_id=m.institution_id WHERE m.user_id=u.id AND sub.plan_id=$4))`;
const subscriberOrder={recent:'u.created_at DESC,u.id',access:'last_access DESC NULLS LAST,u.id',name:'lower(u.display_name),u.id'};
export async function listSubscribers(identity,input) {
  requirePortalAdmin(identity);
  const {q,ip,status,plan,sort,page}=subscriberFilter.parse(input);
  const result=await pool.query(`SELECT * FROM (SELECT u.id,u.email,u.display_name,u.active,u.deleted_at,u.portal_editor,u.portal_admin,u.created_at,
    -- Sessões encerradas somem; o histórico de login mantém o último acesso.
    GREATEST((SELECT max(s.last_seen_at) FROM user_sessions s WHERE s.user_id=u.id),
      (SELECT max(al.created_at) FROM audit_log al WHERE al.user_id=u.id AND al.action='auth.login')) last_access,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'ip',host(s.last_ip),'agent',s.user_agent,'lastSeen',s.last_seen_at) ORDER BY s.last_seen_at DESC NULLS LAST)
      FROM user_sessions s WHERE s.user_id=u.id AND s.expires_at>now()),'[]') sessions,
    coalesce((SELECT jsonb_agg(jsonb_build_object('institution',i.name,'planId',sub.plan_id,'plan',sp.name,'status',sub.status))
      FROM memberships m JOIN institutions i ON i.id=m.institution_id LEFT JOIN institution_subscriptions sub ON sub.institution_id=i.id
      LEFT JOIN subscription_plans sp ON sp.id=sub.plan_id WHERE m.user_id=u.id),'[]') subscriptions
    FROM users u ${subscriberWhere}
    ) u
    ORDER BY ${subscriberOrder[sort]} LIMIT ${subscriberPageSize} OFFSET $5`,[q,ip||null,status,plan,(page-1)*subscriberPageSize]);
  const counted=await pool.query(`SELECT count(*)::int n FROM users u ${subscriberWhere}`,[q,ip||null,status,plan]);
  const summary=await pool.query(`SELECT count(*)::int total,
    count(*) FILTER (WHERE deleted_at IS NULL AND active)::int active,
    count(*) FILTER (WHERE deleted_at IS NULL AND NOT active)::int blocked,
    count(*) FILTER (WHERE deleted_at IS NOT NULL)::int deleted,
    count(*) FILTER (WHERE EXISTS(SELECT 1 FROM memberships m JOIN institution_subscriptions sub ON sub.institution_id=m.institution_id WHERE m.user_id=u.id AND sub.status='trialing'))::int trialing,
    count(*) FILTER (WHERE EXISTS(SELECT 1 FROM memberships m JOIN institution_subscriptions sub ON sub.institution_id=m.institution_id WHERE m.user_id=u.id AND sub.status='active'))::int paying
    FROM users u`);
  // Só os planos em uso: evita opções vazias ou internas no filtro.
  const plans=await pool.query('SELECT DISTINCT sp.id,sp.name FROM subscription_plans sp JOIN institution_subscriptions sub ON sub.plan_id=sp.id ORDER BY sp.name');
  const total=counted.rows[0].n;
  return {users:result.rows,total,page,pageSize:subscriberPageSize,totalPages:Math.max(1,Math.ceil(total/subscriberPageSize)),summary:summary.rows[0],plans:plans.rows};
}
export async function manageSubscriber(identity,input) {
  requirePortalAdmin(identity);
  const v=z.object({userId:z.uuid(),action:z.enum(['block','unblock','delete','restore','revoke-session','revoke-all-sessions']),sessionId:z.uuid().optional()}).parse(input);
  return transaction(async db=>{
    const found=await db.query('SELECT id,portal_admin,deleted_at FROM users WHERE id=$1 FOR UPDATE',[v.userId]);
    if(!found.rowCount) throw Object.assign(new Error('Conta não encontrada.'),{statusCode:404});
    if(v.userId===identity.userId || found.rows[0].portal_admin) throw Object.assign(new Error('Não é permitido bloquear ou excluir administradores por esta tela.'),{statusCode:403});
    if(v.action==='revoke-session') {
      if(!v.sessionId) throw Object.assign(new Error('Selecione a sessão.'),{statusCode:422});
      const result=await db.query('DELETE FROM user_sessions WHERE id=$1 AND user_id=$2',[v.sessionId,v.userId]);
      if(!result.rowCount) throw Object.assign(new Error('Sessão não encontrada.'),{statusCode:404});
    } else if(v.action==='revoke-all-sessions') {
      await db.query('DELETE FROM user_sessions WHERE user_id=$1',[v.userId]);
    } else {
      if(v.action==='unblock' && found.rows[0].deleted_at) throw Object.assign(new Error('Restaure a conta excluída primeiro.'),{statusCode:422});
      await db.query(`UPDATE users SET active=$2,deleted_at=CASE WHEN $3='delete' THEN now() WHEN $3='restore' THEN NULL ELSE deleted_at END WHERE id=$1`,[v.userId,['unblock','restore'].includes(v.action),v.action]);
      if(['block','delete'].includes(v.action)) await db.query('DELETE FROM user_sessions WHERE user_id=$1',[v.userId]);
    }
    await db.query("INSERT INTO audit_log(user_id,action,entity_type,entity_id,metadata) VALUES($1,'admin.subscriber.changed','user',$2,$3)",[identity.userId,v.userId,JSON.stringify({action:v.action,sessionId:v.sessionId})]);
    return {changed:true};
  });
}
