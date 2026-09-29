ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_hash_unique ON users(cpf_hash) WHERE cpf_hash IS NOT NULL;
ALTER TABLE oauth_login_attempts ADD COLUMN IF NOT EXISTS cpf_hash text;
