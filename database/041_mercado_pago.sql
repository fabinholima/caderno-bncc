-- Run once after 040. No credentials or card data are stored here.
INSERT INTO subscription_plans(id,name,monthly_assessments,max_students,storage_mb,concurrent_renders)
VALUES ('professor','Professor',30,100,500,1),('escola','Escola',200,3000,20000,4)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  plan_id text NOT NULL REFERENCES subscription_plans(id),
  months integer NOT NULL CHECK(months IN (1,12)),
  amount_cents integer NOT NULL CHECK(amount_cents > 0),
  provider_id text UNIQUE,
  checkout_url text,
  status text NOT NULL DEFAULT 'creating',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_one_open_contract
ON billing_contracts(institution_id) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS billing_payments (
  provider_id text PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES billing_contracts(id),
  status text NOT NULL,
  amount_cents integer NOT NULL,
  paid_at timestamptz,
  access_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
