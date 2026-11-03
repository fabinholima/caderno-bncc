-- Primeiro acesso do aluno pelo código pessoal (students.access_code), sem e-mail.
-- O aluno confirma os dados, cria a própria senha e passa a entrar com código e
-- senha. Esqueceu a senha: o professor gera um novo código, que vale uma vez.
-- Aditiva: contas existentes continuam com e-mail; só contas de aluno podem não ter.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_required_check;
ALTER TABLE users ADD CONSTRAINT users_email_required_check
  CHECK (email IS NOT NULL OR account_type = 'student');
-- Momento em que o código atual foi usado no primeiro acesso; nulo = ainda vale.
ALTER TABLE students ADD COLUMN IF NOT EXISTS access_code_used_at timestamptz;
