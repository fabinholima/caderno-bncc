import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { cpfFingerprint, normalizeCpf } from './cpf.mjs';
import { resolveUnifiedContext } from './portal-access.mjs';
import { sessionNetwork } from './admin-dashboard.mjs';

const scrypt = promisify(crypto.scrypt);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(200);
export const registerSchema = z.object({
  cpf: z.string().refine((value) => Boolean(normalizeCpf(value)), 'Informe um CPF válido.'),
  institutionName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(160),
  email,
  password,
});
export const loginSchema = z.object({ email, password: z.string().max(200) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(32), password });
export const invitationSchema = z.object({
  email,
  role: z.enum(['admin', 'coordinator', 'teacher']),
});
export const acceptInvitationSchema = z.object({ token: z.string().min(32) });

const tokenHash = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

export async function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(value, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(value, encoded) {
  if (!encoded?.startsWith('scrypt:')) return false;
  const [, salt, expectedHex] = encoded.split(':');
  const actual = Buffer.from(await scrypt(value, salt, 64));
  const expected = Buffer.from(expectedHex, 'hex');
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

function slugify(value) {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${base || 'instituicao'}-${crypto.randomBytes(3).toString('hex')}`;
}

async function createSession(client, userId) {
  const token = randomToken();
  await client.query(
    `INSERT INTO user_sessions(user_id,token_hash,expires_at,global_bank)
     SELECT id,$2,now()+interval '30 days',portal_admin FROM users WHERE id=$1`,
    [userId, tokenHash(token)],
  );
  return token;
}

export async function register(input) {
  const value = registerSchema.parse(input);
  const cpfHash = cpfFingerprint(value.cpf);
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [value.email]);
    const existing = await client.query('SELECT id FROM users WHERE lower(email)=$1', [value.email]);
    if (existing.rowCount) throw Object.assign(new Error('Não foi possível cadastrar este e-mail. Tente entrar na sua conta.'), { statusCode: 409 });
    const institution = await client.query(
      `INSERT INTO institutions(name,slug) VALUES($1,$2) RETURNING id,name`,
      [value.institutionName, slugify(value.institutionName)],
    );
    const user = await client.query(
      `INSERT INTO users(email,display_name,password_hash,cpf_hash)
       VALUES($1,$2,$3,$4) RETURNING id,email,display_name`,
      [value.email, value.displayName, await hashPassword(value.password),cpfHash],
    );
    await client.query(
      `INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'admin')`,
      [institution.rows[0].id, user.rows[0].id],
    );
    await client.query(
      `INSERT INTO institution_subscriptions(institution_id,plan_id,period_started_at,period_ends_at)
       VALUES($1,'trial',now(),now()+interval '7 days')`,
      [institution.rows[0].id],
    );
    const token = await createSession(client, user.rows[0].id);
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id)
       VALUES($1::uuid,$2::uuid,'institution.registered','institution',($1::uuid)::text)`,
      [institution.rows[0].id, user.rows[0].id],
    );
    return {
      token,
      user: {
        id: user.rows[0].id,
        email: user.rows[0].email,
        displayName: user.rows[0].display_name,
      },
      institution: institution.rows[0],
      role: 'admin',
    };
  });
}

export async function loginWithGoogle(profile, cpfHash) {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [profile.email]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`google:${profile.sub}`]);
    let user = (await client.query('SELECT id,active FROM users WHERE google_subject=$1', [profile.sub])).rows[0];
    if (user && !user.active) throw Object.assign(new Error('Conta indisponível.'), { statusCode: 403 });
    if (!user) {
      if (!cpfHash) throw Object.assign(new Error('Complete o cadastro com CPF antes de criar sua conta Google.'), { statusCode: 428 });
      const existing = await client.query('SELECT id FROM users WHERE lower(email)=$1', [profile.email]);
      if (existing.rowCount) throw Object.assign(new Error('Entre com a senha da conta existente. A vinculação automática ao Google não é permitida.'), { statusCode: 409 });
      const institutionName = `Espaço de ${profile.name || 'Professor'}`;
      const institution = await client.query('INSERT INTO institutions(name,slug) VALUES($1,$2) RETURNING id', [institutionName,slugify(institutionName)]);
      user = (await client.query('INSERT INTO users(email,display_name,google_subject,cpf_hash) VALUES($1,$2,$3,$4) RETURNING id,active', [profile.email,profile.name || 'Professor',profile.sub,cpfHash])).rows[0];
      await client.query("INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'admin')", [institution.rows[0].id,user.id]);
      await client.query("INSERT INTO institution_subscriptions(institution_id,plan_id,period_started_at,period_ends_at) VALUES($1,'trial',now(),now()+interval '7 days')", [institution.rows[0].id]);
    }
    const membership = await client.query('SELECT institution_id FROM memberships WHERE user_id=$1 LIMIT 1', [user.id]);
    if (!membership.rowCount) throw Object.assign(new Error('Conta sem instituição vinculada.'), { statusCode: 403 });
    const token = await createSession(client,user.id);
    await client.query("INSERT INTO audit_log(institution_id,user_id,action) VALUES($1,$2,'auth.google.login')", [membership.rows[0].institution_id,user.id]);
    return { token };
  });
}

export async function login(input) {
  const value = loginSchema.parse(input);
  const result = await pool.query(
    `SELECT u.id,u.email,u.display_name,u.password_hash,m.institution_id,
            m.role,i.name institution_name
     FROM users u JOIN memberships m ON m.user_id=u.id
     JOIN institutions i ON i.id=m.institution_id
     WHERE u.email=$1 AND u.active ORDER BY m.role='admin' DESC LIMIT 1`,
    [value.email],
  );
  const row = result.rows[0];
  if (!row || !(await verifyPassword(value.password, row.password_hash)))
    throw Object.assign(new Error('E-mail ou senha inválidos.'), {
      statusCode: 401,
    });
  const token = await transaction((client) => createSession(client, row.id));
  await pool.query(
    `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id)
     VALUES($1::uuid,$2::uuid,'auth.login','user',($2::uuid)::text)`,
    [row.institution_id, row.id],
  );
  return {
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name },
    institution: { id: row.institution_id, name: row.institution_name },
    role: row.role,
  };
}

export async function completeCpf(identity, input) {
  const fingerprint = cpfFingerprint(input?.cpf);
  const updated = await pool.query('UPDATE users SET cpf_hash=$2 WHERE id=$1 AND cpf_hash IS NULL RETURNING id', [identity.userId,fingerprint]);
  if (!updated.rowCount) throw Object.assign(new Error('CPF já cadastrado nesta conta. Alterações exigem suporte.'), { statusCode: 409 });
  return { completed: true };
}

export async function authenticate(request) {
  if (
    process.env.DEV_AUTH_BYPASS === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    const requestedRole = ['admin', 'coordinator', 'teacher'].includes(
      process.env.DEV_AUTH_BYPASS_ROLE,
    )
      ? process.env.DEV_AUTH_BYPASS_ROLE
      : 'admin';
    const developmentUser = await pool.query(
      `SELECT u.id user_id,u.email,u.display_name,m.institution_id,m.role,
              i.name institution_name
       FROM users u
       JOIN memberships m ON m.user_id=u.id
       JOIN institutions i ON i.id=m.institution_id
       WHERE u.active
       ORDER BY (m.role=$1) DESC,(m.role='admin') DESC,u.created_at
       LIMIT 1`,
      [requestedRole],
    );
    if (developmentUser.rowCount) {
      const row = developmentUser.rows[0];
      return {
        sessionId: null,
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        institutionId: row.institution_id,
        institutionName: row.institution_name,
        role: row.role,
        developmentBypass: true,
      };
    }
  }
  const cookie = request.headers.cookie || '';
  const token = /(?:^|;\s*)caderno_session=([^;]+)/.exec(cookie)?.[1];
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.id session_id,s.global_bank,u.portal_admin,u.portal_editor,u.id user_id,u.email,u.display_name,u.cpf_hash,
            (EXISTS(SELECT 1 FROM educator_profiles ep WHERE ep.user_id=u.id) AND EXISTS(SELECT 1 FROM educator_schools es WHERE es.user_id=u.id)) profile_complete,
            m.institution_id,m.role,i.name institution_name
     FROM user_sessions s JOIN users u ON u.id=s.user_id AND u.active
     JOIN memberships m ON m.user_id=u.id
     JOIN institutions i ON i.id=m.institution_id
     WHERE s.token_hash=$1 AND s.expires_at>now()
     ORDER BY m.role='admin' DESC LIMIT 1`,
    [tokenHash(decodeURIComponent(token))],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const network=sessionNetwork(request);
  await pool.query('UPDATE user_sessions SET last_seen_at=now(),last_ip=COALESCE($2::inet,last_ip),user_agent=COALESCE(NULLIF($3,\'\'),user_agent) WHERE id=$1', [row.session_id,network.ip,network.agent]);
  return resolveUnifiedContext({
    sessionId: row.session_id,
    portalAdmin: Boolean(row.portal_admin),
    portalEditor: Boolean(row.portal_editor),
    cpfComplete: Boolean(row.cpf_hash),
    profileComplete: Boolean(row.profile_complete),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    role: row.role,
  }, row.global_bank);
}

export async function logout(sessionId) {
  if (sessionId)
    await pool.query('DELETE FROM user_sessions WHERE id=$1', [sessionId]);
}

export async function requestPasswordReset(input) {
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEV_RESET_TOKENS !== 'true')
    throw Object.assign(new Error('O envio de e-mail de recuperação ainda não está configurado. Solicite ao administrador do servidor um link temporário de recuperação.'), { statusCode: 503 });
  const value = forgotSchema.parse(input);
  const user = await pool.query(
    'SELECT id FROM users WHERE email=$1 AND active',
    [value.email],
  );
  if (!user.rowCount) return { accepted: true };
  const token = randomToken();
  await pool.query(
    `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
     VALUES($1,$2,now()+interval '30 minutes')`,
    [user.rows[0].id, tokenHash(token)],
  );
  return {
    accepted: true,
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : { developmentToken: token }),
  };
}

export async function resetPassword(input) {
  const value = resetSchema.parse(input);
  return transaction(async (client) => {
    const reset = await client.query(
      `UPDATE password_reset_tokens SET used_at=now()
       WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()
       RETURNING user_id`,
      [tokenHash(value.token)],
    );
    if (!reset.rowCount)
      throw Object.assign(new Error('Token inválido ou expirado.'), {
        statusCode: 422,
      });
    await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      reset.rows[0].user_id,
      await hashPassword(value.password),
    ]);
    await client.query('DELETE FROM user_sessions WHERE user_id=$1', [
      reset.rows[0].user_id,
    ]);
    return { changed: true };
  });
}

export async function createInvitation(identity, input) {
  if (!['admin', 'coordinator'].includes(identity.role))
    throw Object.assign(new Error('Permissão insuficiente.'), {
      statusCode: 403,
    });
  const value = invitationSchema.parse(input);
  const token = randomToken();
  await pool.query(
    `INSERT INTO institution_invitations
       (institution_id,email,role,token_hash,invited_by,expires_at)
     VALUES($1,$2,$3,$4,$5,now()+interval '7 days')`,
    [
      identity.institutionId,
      value.email,
      value.role,
      tokenHash(token),
      identity.userId,
    ],
  );
  await audit(identity, 'invitation.created', 'invitation', value.email, {
    role: value.role,
  });
  return {
    email: value.email,
    role: value.role,
    expiresInDays: 7,
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : { developmentToken: token }),
  };
}

export async function acceptInvitation(identity, input) {
  const value = acceptInvitationSchema.parse(input);
  const result = await pool.query(
    `UPDATE institution_invitations inv SET accepted_at=now()
     WHERE inv.token_hash=$1 AND inv.email=$2 AND inv.accepted_at IS NULL
       AND inv.expires_at>now()
     RETURNING institution_id,role`,
    [tokenHash(value.token), identity.email],
  );
  if (!result.rowCount)
    throw Object.assign(new Error('Convite inválido ou expirado.'), {
      statusCode: 422,
    });
  await pool.query(
    `INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,$3)
     ON CONFLICT(institution_id,user_id) DO UPDATE SET role=excluded.role`,
    [result.rows[0].institution_id, identity.userId, result.rows[0].role],
  );
  return { accepted: true };
}

export async function getSubscription(identity) {
  const result = await pool.query(
    `SELECT sp.*,CASE WHEN sub.period_ends_at <= now() THEN 'past_due' ELSE sub.status END status,sub.period_started_at,sub.period_ends_at,
       COALESCE((SELECT sum(quantity) FROM usage_events ue
                 WHERE ue.institution_id=sub.institution_id AND ue.kind='assessment'
                   AND ue.created_at>=GREATEST(sub.period_started_at,date_trunc('month',now()))),0)::int assessments_used,
       (SELECT count(*)::int FROM students s
        WHERE s.institution_id=sub.institution_id AND s.active) students_used
     FROM institution_subscriptions sub
     JOIN subscription_plans sp ON sp.id=sub.plan_id
     WHERE sub.institution_id=$1`,
    [identity.institutionId],
  );
  return result.rows[0] || null;
}

export async function assertInstitutionLimit({ institutionId, kind, portalAdmin = false }) {
  // Administradores gerais precisam conseguir validar o portal e o compositor
  // independentemente do plano da instituição selecionada.
  if (portalAdmin) return;
  const subscription = await pool.query(
    `SELECT sp.monthly_assessments,sp.max_students,GREATEST(sub.period_started_at,date_trunc('month',now())) period_started_at
     FROM institution_subscriptions sub
     JOIN subscription_plans sp ON sp.id=sub.plan_id
     WHERE sub.institution_id=$1 AND sub.status IN ('trialing','active') AND sub.period_ends_at>now()`,
    [institutionId],
  );
  if (!subscription.rowCount)
    throw Object.assign(new Error('Assinatura inativa.'), { statusCode: 402 });
  const plan = subscription.rows[0];
  if (kind === 'assessment') {
    const usage = await pool.query(
      `SELECT COALESCE(sum(quantity),0)::int used FROM usage_events
       WHERE institution_id=$1 AND kind='assessment' AND created_at>=$2`,
      [institutionId, plan.period_started_at],
    );
    if (usage.rows[0].used >= plan.monthly_assessments)
      throw Object.assign(new Error('Limite mensal de avaliações atingido.'), {
        statusCode: 402,
      });
  }
  if (kind === 'student') {
    const usage = await pool.query(
      `SELECT count(*)::int used FROM students WHERE institution_id=$1 AND active`,
      [institutionId],
    );
    if (usage.rows[0].used >= plan.max_students)
      throw Object.assign(new Error('Limite de alunos do plano atingido.'), {
        statusCode: 402,
      });
  }
}

export async function audit(
  identity,
  action,
  entityType,
  entityId,
  metadata = {},
) {
  await pool.query(
    `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      identity.institutionId,
      identity.userId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    ],
  );
}
