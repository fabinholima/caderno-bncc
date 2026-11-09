import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { canManageInstitutionTeam } from './institution-permissions.mjs';
import {
  educatorSchema,
  saveEducatorProfileWithClient,
} from './educator-profile.mjs';
import { cpfFingerprint, normalizeCpf } from './cpf.mjs';
import { resolveUnifiedContext } from './portal-access.mjs';
import { sessionNetwork } from './admin-dashboard.mjs';
import {
  requireMail,
  sendAuthMail,
  developmentMail,
  mailConfigured,
} from './auth-mail.mjs';

const scrypt = promisify(crypto.scrypt);
const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(10).max(200);
export const registerSchema = z.object({
  cpf: z
    .string()
    .refine((value) => Boolean(normalizeCpf(value)), 'Informe um CPF válido.'),
  institutionName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(160),
  email,
  password,
  educatorProfile: educatorSchema.optional(),
});
export const loginSchema = z.object({ email, password: z.string().max(200) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({
  token: z.string().min(32).max(128),
  password,
});
export const invitationSchema = z.object({
  email,
  role: z.enum(['admin', 'coordinator', 'teacher']),
});
export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
});

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

export async function createSession(client, userId) {
  const token = randomToken();
  const session = await client.query(
    `INSERT INTO user_sessions(user_id,token_hash,expires_at,global_bank)
     SELECT id,$2,now()+interval '30 days',portal_admin FROM users WHERE id=$1 RETURNING id`,
    [userId, tokenHash(token)],
  );
  return { token, sessionId: session.rows[0].id };
}

export async function register(input) {
  const value = registerSchema.parse(input);
  const cpfHash = cpfFingerprint(value.cpf);
  requireMail();
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      value.email,
    ]);
    const existing = await client.query(
      'SELECT id FROM users WHERE lower(email)=$1',
      [value.email],
    );
    if (existing.rowCount)
      throw Object.assign(
        new Error(
          'Não foi possível cadastrar este e-mail. Tente entrar na sua conta.',
        ),
        { statusCode: 409 },
      );
    const institution = await client.query(
      `INSERT INTO institutions(name,slug) VALUES($1,$2) RETURNING id,name`,
      [value.institutionName, slugify(value.institutionName)],
    );
    const user = await client.query(
      `INSERT INTO users(email,display_name,password_hash,cpf_hash,email_verification_required)
       VALUES($1,$2,$3,$4,true) RETURNING id,email,display_name`,
      [
        value.email,
        value.displayName,
        await hashPassword(value.password),
        cpfHash,
      ],
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
    if (value.educatorProfile)
      await saveEducatorProfileWithClient(
        client,
        user.rows[0].id,
        value.educatorProfile,
      );
    const verificationToken = await issueVerification(
      client,
      user.rows[0].id,
      value.email,
    );
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id)
       VALUES($1::uuid,$2::uuid,'institution.registered','institution',($1::uuid)::text)`,
      [institution.rows[0].id, user.rows[0].id],
    );
    return {
      verificationRequired: true,
      ...(developmentMail() ? { developmentToken: verificationToken } : {}),
    };
  });
}

export const studentRegisterSchema = z
  .object({ displayName: z.string().trim().min(2).max(160), email, password })
  .strict();
export async function registerStudent(input) {
  const value = studentRegisterSchema.parse(input);
  requireMail();
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      value.email,
    ]);
    if (
      (
        await client.query('SELECT id FROM users WHERE lower(email)=$1', [
          value.email,
        ])
      ).rowCount
    )
      throw Object.assign(
        new Error(
          'Este e-mail já possui uma conta. Entre ou recupere sua senha.',
        ),
        { statusCode: 409 },
      );
    const user = await client.query(
      "INSERT INTO users(email,display_name,password_hash,account_type,email_verification_required) VALUES($1,$2,$3,'student',true) RETURNING id",
      [value.email, value.displayName, await hashPassword(value.password)],
    );
    const verificationToken = await issueVerification(
      client,
      user.rows[0].id,
      value.email,
    );
    await client.query(
      "INSERT INTO audit_log(user_id,action) VALUES($1,'student.registered')",
      [user.rows[0].id],
    );
    return {
      verificationRequired: true,
      ...(developmentMail() ? { developmentToken: verificationToken } : {}),
    };
  });
}

export async function loginWithGoogle(
  profile,
  cpfHash,
  accountType = 'educator',
) {
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      profile.email,
    ]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `google:${profile.sub}`,
    ]);
    let user = (
      await client.query(
        'SELECT id,active FROM users WHERE google_subject=$1',
        [profile.sub],
      )
    ).rows[0];
    if (user && !user.active)
      throw Object.assign(new Error('Conta indisponível.'), {
        statusCode: 403,
      });
    if (!user) {
      if (accountType !== 'student' && !cpfHash)
        throw Object.assign(
          new Error(
            'Complete o cadastro com CPF antes de criar sua conta Google.',
          ),
          { statusCode: 428 },
        );
      const existing = await client.query(
        'SELECT id FROM users WHERE lower(email)=$1',
        [profile.email],
      );
      if (existing.rowCount)
        throw Object.assign(
          new Error(
            'Entre com a senha da conta existente. A vinculação automática ao Google não é permitida.',
          ),
          { statusCode: 409 },
        );
      if (accountType === 'student') {
        user = (
          await client.query(
            "INSERT INTO users(email,display_name,google_subject,account_type,email_verified_at) VALUES($1,$2,$3,'student',now()) RETURNING id,active",
            [profile.email, profile.name || 'Aluno', profile.sub],
          )
        ).rows[0];
      } else {
        const institutionName = `Espaço de ${profile.name || 'Professor'}`;
        const institution = await client.query(
          'INSERT INTO institutions(name,slug) VALUES($1,$2) RETURNING id',
          [institutionName, slugify(institutionName)],
        );
        user = (
          await client.query(
            'INSERT INTO users(email,display_name,google_subject,cpf_hash,email_verified_at) VALUES($1,$2,$3,$4,now()) RETURNING id,active',
            [profile.email, profile.name || 'Professor', profile.sub, cpfHash],
          )
        ).rows[0];
        await client.query(
          "INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'admin')",
          [institution.rows[0].id, user.id],
        );
        await client.query(
          "INSERT INTO institution_subscriptions(institution_id,plan_id,period_started_at,period_ends_at) VALUES($1,'trial',now(),now()+interval '7 days')",
          [institution.rows[0].id],
        );
      }
    }
    const membership = await client.query(
      'SELECT institution_id FROM memberships WHERE user_id=$1 LIMIT 1',
      [user.id],
    );
    if (
      !membership.rowCount &&
      (
        await client.query('SELECT account_type FROM users WHERE id=$1', [
          user.id,
        ])
      ).rows[0]?.account_type !== 'student'
    )
      throw Object.assign(new Error('Conta sem instituição vinculada.'), {
        statusCode: 403,
      });
    const session = await createSession(client, user.id);
    await client.query(
      "INSERT INTO audit_log(institution_id,user_id,action) VALUES($1,$2,'auth.google.login')",
      [membership.rows[0]?.institution_id || null, user.id],
    );
    return { ...session, userId: user.id };
  });
}

export async function login(input) {
  const value = loginSchema.parse(input);
  const result = await pool.query(
    `SELECT u.id,u.email,u.display_name,u.password_hash,u.email_verification_required,u.email_verified_at,m.institution_id,
            m.role,i.name institution_name,u.account_type
     FROM users u LEFT JOIN memberships m ON m.user_id=u.id
     LEFT JOIN institutions i ON i.id=m.institution_id
     WHERE u.email=$1 AND u.active AND (u.account_type='student' OR m.institution_id IS NOT NULL) ORDER BY m.role='admin' DESC LIMIT 1`,
    [value.email],
  );
  const row = result.rows[0];
  if (!row || !(await verifyPassword(value.password, row.password_hash)))
    throw Object.assign(new Error('E-mail ou senha inválidos.'), {
      statusCode: 401,
    });
  if (row.email_verification_required && !row.email_verified_at)
    throw Object.assign(
      new Error(
        'Confirme seu e-mail antes de entrar. Você pode reenviar o link de confirmação.',
      ),
      { statusCode: 403 },
    );
  const { token } = await transaction((client) =>
    createSession(client, row.id),
  );
  await pool.query(
    `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id)
     VALUES($1::uuid,$2::uuid,'auth.login','user',($2::uuid)::text)`,
    [row.institution_id, row.id],
  );
  return {
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name },
    institution: row.institution_id
      ? { id: row.institution_id, name: row.institution_name }
      : null,
    role: row.account_type === 'student' ? 'student' : row.role,
  };
}

// Registra IP e navegador já na criação da sessão, para a tela Assinantes
// mostrar de onde veio um login mesmo antes de a sessão ser usada de novo.
export async function recordSessionNetwork(token, request) {
  const network = sessionNetwork(request);
  await pool.query(
    "UPDATE user_sessions SET last_ip=$2::inet,user_agent=NULLIF($3,''),last_seen_at=now() WHERE token_hash=$1",
    [tokenHash(token), network.ip, network.agent],
  );
}

export async function completeCpf(identity, input) {
  const fingerprint = cpfFingerprint(input?.cpf);
  const updated = await pool.query(
    'UPDATE users SET cpf_hash=$2 WHERE id=$1 AND cpf_hash IS NULL RETURNING id',
    [identity.userId, fingerprint],
  );
  if (!updated.rowCount)
    throw Object.assign(
      new Error('CPF já cadastrado nesta conta. Alterações exigem suporte.'),
      { statusCode: 409 },
    );
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
      `SELECT u.id user_id,u.email,u.display_name,u.portal_admin,u.cpf_hash,u.google_subject,m.institution_id,m.role,
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
        portalAdmin: Boolean(row.portal_admin),
        cpfComplete: Boolean(row.cpf_hash),
        googleLinked: Boolean(row.google_subject),
        profileComplete: true,
        developmentBypass: true,
      };
    }
  }
  const cookie = request.headers.cookie || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(
    request.headers.authorization || '',
  )?.[1];
  const token = bearer || /(?:^|;\s*)caderno_session=([^;]+)/.exec(cookie)?.[1];
  if (!token) return null;
  const result = await pool.query(
    `SELECT s.id session_id,s.global_bank,s.last_seen_at,u.portal_admin,u.portal_editor,u.id user_id,u.email,u.display_name,u.cpf_hash,u.google_subject,
            (EXISTS(SELECT 1 FROM educator_profiles ep WHERE ep.user_id=u.id) AND EXISTS(SELECT 1 FROM educator_schools es WHERE es.user_id=u.id)) profile_complete,
            m.institution_id,m.role,i.name institution_name,u.account_type
     FROM user_sessions s JOIN users u ON u.id=s.user_id AND u.active
     LEFT JOIN memberships m ON m.user_id=u.id
     LEFT JOIN institutions i ON i.id=m.institution_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen_at>now()-interval '14 days' AND (u.account_type='student' OR m.institution_id IS NOT NULL) AND (NOT u.email_verification_required OR u.email_verified_at IS NOT NULL)
     ORDER BY (m.institution_id=s.active_institution_id) IS TRUE DESC,m.role='admin' DESC,i.name,m.institution_id LIMIT 1`,
    [tokenHash(decodeURIComponent(token))],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  // Sessão vale 30 dias, mas expira após 14 dias sem uso. O "visto por último"
  // só é gravado a cada 5 minutos, em vez de uma escrita por requisição.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    const network = sessionNetwork(request);
    await pool.query(
      "UPDATE user_sessions SET last_seen_at=now(),last_ip=COALESCE($2::inet,last_ip),user_agent=COALESCE(NULLIF($3,''),user_agent) WHERE id=$1",
      [row.session_id, network.ip, network.agent],
    );
  }
  return resolveUnifiedContext(
    {
      sessionId: row.session_id,
      portalAdmin: Boolean(row.portal_admin),
      portalEditor: Boolean(row.portal_editor),
      cpfComplete: Boolean(row.cpf_hash),
      googleLinked: Boolean(row.google_subject),
      profileComplete: Boolean(row.profile_complete),
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      role: row.account_type === 'student' ? 'student' : row.role,
    },
    row.global_bank,
  );
}

export async function logout(sessionId) {
  if (sessionId)
    await pool.query('DELETE FROM user_sessions WHERE id=$1', [sessionId]);
}

// Encerra todas as sessões da conta (celular, outros navegadores, app).
export async function logoutAll(identity) {
  const result = await pool.query(
    'DELETE FROM user_sessions WHERE user_id=$1',
    [identity.userId],
  );
  await pool.query(
    "INSERT INTO audit_log(institution_id,user_id,action) VALUES($1,$2,'auth.logout_all')",
    [identity.institutionId || null, identity.userId],
  );
  return { loggedOut: true, sessions: result.rowCount };
}

async function issueVerification(client, userId, recipient) {
  const token = randomToken();
  await client.query(
    `INSERT INTO email_verification_tokens(user_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '24 hours')`,
    [userId, tokenHash(token)],
  );
  await sendAuthMail('verify', recipient, token);
  return token;
}

export async function requestEmailVerification(input) {
  const value = forgotSchema.parse(input);
  requireMail();
  return transaction(async (client) => {
    const user = (
      await client.query(
        'SELECT id,email FROM users WHERE email=$1 AND active AND email_verification_required AND email_verified_at IS NULL FOR UPDATE',
        [value.email],
      )
    ).rows[0];
    if (!user) return { accepted: true };
    const recent = await client.query(
      "SELECT 1 FROM email_verification_tokens WHERE user_id=$1 AND created_at>now()-interval '1 minute' LIMIT 1",
      [user.id],
    );
    if (recent.rowCount) return { accepted: true };
    const token = await issueVerification(client, user.id, user.email);
    return {
      accepted: true,
      ...(developmentMail() ? { developmentToken: token } : {}),
    };
  });
}

export async function verifyEmail(input) {
  const value = acceptInvitationSchema.parse(input);
  return transaction(async (client) => {
    // Lock the account before consuming tokens, serializing concurrent confirmations.
    const user = (
      await client.query(
        `SELECT u.id FROM users u JOIN email_verification_tokens t ON t.user_id=u.id
      WHERE t.token_hash=$1 AND u.active FOR UPDATE OF u`,
        [tokenHash(value.token)],
      )
    ).rows[0];
    if (!user)
      throw Object.assign(new Error('Link inválido ou expirado.'), {
        statusCode: 422,
      });
    const used = await client.query(
      `UPDATE email_verification_tokens SET used_at=now()
      WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id`,
      [tokenHash(value.token)],
    );
    if (!used.rowCount)
      throw Object.assign(new Error('Link inválido ou expirado.'), {
        statusCode: 422,
      });
    await client.query(
      'UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',
      [user.id],
    );
    await client.query(
      'UPDATE email_verification_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
      [user.id],
    );
    return { verified: true };
  });
}

export async function requestPasswordReset(input) {
  const value = forgotSchema.parse(input);
  requireMail();
  return transaction(async (client) => {
    const user = (
      await client.query(
        'SELECT id,email FROM users WHERE email=$1 AND active AND password_hash IS NOT NULL FOR UPDATE',
        [value.email],
      )
    ).rows[0];
    if (!user) return { accepted: true };
    const recent = await client.query(
      "SELECT 1 FROM password_reset_tokens WHERE user_id=$1 AND created_at>now()-interval '1 minute' LIMIT 1",
      [user.id],
    );
    if (recent.rowCount) return { accepted: true };
    const token = randomToken();
    await client.query(
      `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
      VALUES($1,$2,now()+interval '30 minutes')`,
      [user.id, tokenHash(token)],
    );
    await sendAuthMail('reset', user.email, token);
    return {
      accepted: true,
      ...(developmentMail() ? { developmentToken: token } : {}),
    };
  });
}

export async function resetPassword(input) {
  const value = resetSchema.parse(input);
  return transaction(async (client) => {
    const user = (
      await client.query(
        `SELECT u.id FROM users u JOIN password_reset_tokens t ON t.user_id=u.id WHERE t.token_hash=$1 AND u.active FOR UPDATE OF u`,
        [tokenHash(value.token)],
      )
    ).rows[0];
    if (!user)
      throw Object.assign(new Error('Token inválido ou expirado.'), {
        statusCode: 422,
      });
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
    await client.query(
      'UPDATE users SET password_hash=$2,email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',
      [reset.rows[0].user_id, await hashPassword(value.password)],
    );
    await client.query('DELETE FROM user_sessions WHERE user_id=$1', [
      reset.rows[0].user_id,
    ]);
    await client.query(
      'UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
      [user.id],
    );
    await client.query(
      'UPDATE email_verification_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
      [user.id],
    );
    return { changed: true };
  });
}

export async function createInvitation(identity, input) {
  if (!canManageInstitutionTeam(identity))
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
  // Em produção o convite sempre segue por e-mail; localmente, sem Resend, o
  // token volta na resposta (developmentToken) para testes manuais.
  const emailSent = mailConfigured() || process.env.NODE_ENV === 'production';
  if (emailSent) await sendAuthMail('invite', value.email, token);
  await audit(identity, 'invitation.created', 'invitation', value.email, {
    role: value.role,
  });
  return {
    email: value.email,
    role: value.role,
    expiresInDays: 7,
    emailSent,
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
  const institutionId = result.rows[0].institution_id;
  // O convite aceito passa a ser a instituição ativa desta sessão.
  if (identity.sessionId)
    await pool.query(
      'UPDATE user_sessions SET active_institution_id=$2 WHERE id=$1',
      [identity.sessionId, institutionId],
    );
  await pool.query(
    "INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id) VALUES($1,$2,'invitation.accepted','institution',$3)",
    [institutionId, identity.userId, institutionId],
  );
  return { accepted: true, institutionId, role: result.rows[0].role };
}

/** Instituições da conta, para o seletor do portal. */
export async function listMyInstitutions(identity) {
  if (identity.role === 'student') return [];
  const result = await pool.query(
    `SELECT i.id,i.name,m.role FROM memberships m JOIN institutions i ON i.id=m.institution_id
     WHERE m.user_id=$1 ORDER BY i.name,i.id`,
    [identity.userId],
  );
  return result.rows;
}

export const switchInstitutionSchema = z.object({ institutionId: z.uuid() });

/** Troca a instituição ativa da sessão; só vale para instituições em que a conta é membro. */
export async function switchInstitution(identity, input) {
  const value = switchInstitutionSchema.parse(input);
  if (!identity.sessionId)
    throw Object.assign(
      new Error('Sessão sem suporte à troca de instituição.'),
      { statusCode: 422 },
    );
  const membership = await pool.query(
    'SELECT role FROM memberships WHERE user_id=$1 AND institution_id=$2',
    [identity.userId, value.institutionId],
  );
  if (!membership.rowCount)
    throw Object.assign(new Error('Instituição não encontrada.'), {
      statusCode: 404,
    });
  await pool.query(
    'UPDATE user_sessions SET active_institution_id=$2 WHERE id=$1 AND user_id=$3',
    [identity.sessionId, value.institutionId, identity.userId],
  );
  await pool.query(
    "INSERT INTO audit_log(institution_id,user_id,action) VALUES($1,$2,'auth.institution_switched')",
    [value.institutionId, identity.userId],
  );
  return { institutionId: value.institutionId, role: membership.rows[0].role };
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

export async function assertInstitutionLimit({
  institutionId,
  kind,
  portalAdmin = false,
  developmentBypass = false,
  quantity = 1,
  db = pool,
}) {
  // Administradores gerais precisam conseguir validar o portal e o compositor
  // independentemente do plano da instituição selecionada.
  if (portalAdmin || developmentBypass) return;
  const subscription = await db.query(
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
    const usage = await db.query(
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
    const usage = await db.query(
      `SELECT count(*)::int used FROM students WHERE institution_id=$1 AND active`,
      [institutionId],
    );
    if (usage.rows[0].used + quantity > plan.max_students)
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
