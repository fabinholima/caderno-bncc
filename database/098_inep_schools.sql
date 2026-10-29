-- Catálogo público do Censo Escolar. Mantido separado das escolas cadastradas
-- pelos usuários em educator_schools.
CREATE TABLE IF NOT EXISTS escolas (
  inep_code text PRIMARY KEY CHECK (inep_code ~ '^[0-9]{8}$'),
  name text NOT NULL,
  name_normalized text NOT NULL,
  school_type text NOT NULL DEFAULT '' CHECK (school_type IN ('', 'federal', 'estadual', 'municipal', 'privada')),
  cnpj text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  address_number text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state char(2) NOT NULL CHECK (state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  postal_code text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  census_year integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escolas_name_normalized_idx
  ON escolas (name_normalized text_pattern_ops);
CREATE INDEX IF NOT EXISTS escolas_state_name_idx
  ON escolas (state, name_normalized text_pattern_ops);
CREATE INDEX IF NOT EXISTS escolas_state_idx ON escolas (state);
