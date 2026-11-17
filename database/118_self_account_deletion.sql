-- Exclusão da conta pelo próprio usuário (exigência da Play Store e LGPD).
-- A linha de users fica, porque provas, questões e registros da escola apontam
-- para ela, mas os dados pessoais são apagados (anonymized_at). Uma conta
-- anonimizada não tem e-mail nem forma de entrar, e o portal não a restaura.
-- Aditiva.
ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_required_check;
ALTER TABLE users ADD CONSTRAINT users_email_required_check
  CHECK (email IS NOT NULL OR account_type = 'student' OR anonymized_at IS NOT NULL);
