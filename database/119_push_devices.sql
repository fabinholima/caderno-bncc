-- Aparelhos que recebem aviso de nota nova pelo serviço de push do Expo
-- (gratuito). O token identifica o aparelho; se outra conta entrar nele, o
-- token passa para ela. notified_at evita repetir o aviso da mesma publicação
-- quando o aplicativo reenvia a autorização. Aditiva.
CREATE TABLE IF NOT EXISTS push_devices (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON push_devices (user_id);
ALTER TABLE assessment_result_publications ADD COLUMN IF NOT EXISTS notified_at timestamptz;
