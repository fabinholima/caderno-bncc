import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';

const scrypt = promisify(crypto.scrypt);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(200);
export const registerSchema = z.object({
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
    `INSERT INTO user_sessions(user_id,token_hash,expires_at)
     VALUES($1,$2,now()+interval '30 days')`,
    [userId, tokenHash(token)],
  );
  return token;
}

export async function register(input) {
  const value = registerSchema.parse(input);
  return transaction(async (client) => {
    const institution = await client.query(
      `INSERT INTO institutions(name,slug) VALUES($1,$2) RETURNING id,name`,
      [value.institutionName, slugify(value.institutionName)],
    );
    const user = await client.query(
      `INSERT INTO users(email,display_name,password_hash)
       VALUES($1,$2,$3) RETURNING id,email,display_name`,
      [value.email, value.displayName, await hashPassword(value.password)],
    );
    await client.query(
      `INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'admin')`,
      [institution.rows[0].id, user.rows[0].id],
    );
    await client.query(
      `INSERT INTO institution_subscriptions(institution_id,plan_id)
       VALUES($1,'trial')`,
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

export async function authenticate(request) {
  const cookie = request.headers.cookie || '';
  const token = /(?:^|;\s*)caderno_session=([^;]+)/.exec(cookie)?.[1];
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.id session_id,u.id user_id,u.email,u.display_name,
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
  await pool.query('UPDATE user_sessions SET last_seen_at=now() WHERE id=$1', [
    row.session_id,
  ]);
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    role: row.role,
  };
}

export async function logout(sessionId) {
  if (sessionId)
    await pool.query('DELETE FROM user_sessions WHERE id=$1', [sessionId]);
}

export async function requestPasswordReset(input) {
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
    `SELECT sp.*,sub.status,sub.period_started_at,sub.period_ends_at,
       COALESCE((SELECT sum(quantity) FROM usage_events ue
                 WHERE ue.institution_id=sub.institution_id AND ue.kind='assessment'
                   AND ue.created_at>=sub.period_started_at),0)::int assessments_used,
       (SELECT count(*)::int FROM students s
        WHERE s.institution_id=sub.institution_id AND s.active) students_used
     FROM institution_subscriptions sub
     JOIN subscription_plans sp ON sp.id=sub.plan_id
     WHERE sub.institution_id=$1`,
    [identity.institutionId],
  );
  return result.rows[0] || null;
}

export async function assertInstitutionLimit({ institutionId, kind }) {
  const subscription = await pool.query(
    `SELECT sp.monthly_assessments,sp.max_students,sub.period_started_at
     FROM institution_subscriptions sub
     JOIN subscription_plans sp ON sp.id=sub.plan_id
     WHERE sub.institution_id=$1 AND sub.status IN ('trialing','active')`,
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
