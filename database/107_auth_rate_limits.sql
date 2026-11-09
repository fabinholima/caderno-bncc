-- Limite de tentativas de login, convites e códigos de aluno compartilhado
-- entre instâncias e preservado em reinícios (antes ficava em memória).
-- A chave é guardada como hash: e-mails e códigos não ficam legíveis aqui.
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL CHECK (attempts > 0),
  window_ends_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx ON auth_rate_limits (window_ends_at);
