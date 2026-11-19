import { z } from 'zod';
import { transaction } from './db.mjs';
import { verifyPassword } from './auth.mjs';

// Exclusão da conta pelo próprio usuário (app e página /excluir-conta).
// Apaga os dados pessoais e os acessos; o que pertence à escola (alunos,
// turmas, provas, notas) continua com a escola. Detalhes em
// docs/exclusao-de-conta.md.
const fail = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

export async function deleteOwnAccount(identity, input) {
  const v = z
    .object({
      confirm: z.string().max(20),
      password: z.string().max(200).optional(),
    })
    .parse(input || {});
  if (v.confirm.trim().toUpperCase() !== 'EXCLUIR')
    throw fail('Digite EXCLUIR para confirmar.', 422);
  return transaction(async (db) => {
    const found = await db.query(
      'SELECT id,password_hash,portal_admin,anonymized_at FROM users WHERE id=$1 FOR UPDATE',
      [identity.userId],
    );
    const user = found.rows[0];
    if (!user || user.anonymized_at) throw fail('Conta não encontrada.', 404);
    if (user.portal_admin)
      throw fail(
        'Administradores do portal não podem excluir a própria conta por aqui.',
        409,
      );
    // Conta com senha confirma a senha. Conta só com Google não tem senha: a
    // sessão ativa e a confirmação bastam.
    if (
      user.password_hash &&
      !(await verifyPassword(v.password || '', user.password_hash))
    )
      throw fail('Senha incorreta.', 422);
    // Escola com outras pessoas ou assinatura ativa não pode ficar sem administrador.
    const blocked = await db.query(
      `SELECT i.name FROM memberships m JOIN institutions i ON i.id=m.institution_id
       WHERE m.user_id=$1 AND m.role='admin'
         AND NOT EXISTS(SELECT 1 FROM memberships o JOIN users ou ON ou.id=o.user_id AND ou.active
                        WHERE o.institution_id=m.institution_id AND o.user_id<>$1 AND o.role='admin')
         AND (EXISTS(SELECT 1 FROM memberships o JOIN users ou ON ou.id=o.user_id AND ou.active
                     WHERE o.institution_id=m.institution_id AND o.user_id<>$1)
              OR EXISTS(SELECT 1 FROM billing_contracts b WHERE b.institution_id=m.institution_id AND b.status<>'cancelled'))
       ORDER BY i.name LIMIT 1`,
      [identity.userId],
    );
    if (blocked.rowCount)
      throw fail(
        `Você é o único administrador de "${blocked.rows[0].name}". Passe a administração para outra pessoa da escola ou cancele a assinatura antes de excluir a conta.`,
        409,
      );
    const links = await db.query(
      'DELETE FROM student_account_links WHERE user_id=$1 RETURNING student_id',
      [identity.userId],
    );
    // A foto enviada pelo aluno sai junto; o cadastro do aluno fica com a escola.
    if (links.rowCount)
      await db.query(
        "UPDATE students SET selfie_data_url='' WHERE id=ANY($1::uuid[])",
        [links.rows.map((row) => row.student_id)],
      );
    for (const sql of [
      'DELETE FROM user_sessions WHERE user_id=$1',
      'DELETE FROM push_devices WHERE user_id=$1',
      'DELETE FROM password_reset_tokens WHERE user_id=$1',
      'DELETE FROM email_verification_tokens WHERE user_id=$1',
      'DELETE FROM class_memberships WHERE user_id=$1',
      'DELETE FROM memberships WHERE user_id=$1',
      'DELETE FROM educator_profiles WHERE user_id=$1',
    ])
      await db.query(sql, [identity.userId]);
    await db.query(
      `UPDATE users SET email=NULL,display_name='Conta excluída',password_hash=NULL,google_subject=NULL,
         cpf_hash=NULL,email_verified_at=NULL,active=false,deleted_at=COALESCE(deleted_at,now()),anonymized_at=now()
       WHERE id=$1`,
      [identity.userId],
    );
    await db.query(
      "INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id) VALUES(NULL,$1,'account.self_deleted','user',$2)",
      [identity.userId, identity.userId],
    );
    return { deleted: true };
  });
}
