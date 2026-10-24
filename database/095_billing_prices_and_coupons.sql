ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer,
  ADD COLUMN IF NOT EXISTS annual_price_cents integer;

ALTER TABLE subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_monthly_price_cents_check,
  ADD CONSTRAINT subscription_plans_monthly_price_cents_check
    CHECK (monthly_price_cents IS NULL OR monthly_price_cents > 0),
  DROP CONSTRAINT IF EXISTS subscription_plans_annual_price_cents_check,
  ADD CONSTRAINT subscription_plans_annual_price_cents_check
    CHECK (annual_price_cents IS NULL OR annual_price_cents > 0);

UPDATE subscription_plans
SET monthly_price_cents = COALESCE(monthly_price_cents, 4990),
    annual_price_cents = COALESCE(annual_price_cents, 49900)
WHERE id = 'professor';

UPDATE subscription_plans
SET monthly_price_cents = COALESCE(monthly_price_cents, 19990),
    annual_price_cents = COALESCE(annual_price_cents, 199900)
WHERE id = 'escola';

CREATE TABLE IF NOT EXISTS billing_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  plan_id text REFERENCES subscription_plans(id),
  cycle_months integer CHECK (cycle_months IN (1,12)),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE billing_contracts
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES billing_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS base_amount_cents integer,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0
    CHECK (discount_cents >= 0);

CREATE INDEX IF NOT EXISTS billing_coupons_active_idx
  ON billing_coupons (active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS billing_contracts_coupon_idx
  ON billing_contracts (coupon_id) WHERE coupon_id IS NOT NULL;
