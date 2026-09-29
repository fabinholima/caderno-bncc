CREATE TABLE IF NOT EXISTS educator_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  professional_role text NOT NULL CHECK(professional_role IN ('teacher','coordinator')),
  phone text NOT NULL DEFAULT '',
  subjects text[] NOT NULL DEFAULT '{}',
  grades text[] NOT NULL DEFAULT '{}',
  stages text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Self-reported schools for the personal assessment header. These records do
-- not create memberships or grant access to any shared institutional bank.
CREATE TABLE IF NOT EXISTS educator_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  school_type text NOT NULL,
  cnpj text NOT NULL DEFAULT '',
  inep text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  logo_data_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS educator_schools_user_idx ON educator_schools(user_id);
