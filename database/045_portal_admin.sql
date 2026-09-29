ALTER TABLE users ADD COLUMN IF NOT EXISTS portal_admin boolean NOT NULL DEFAULT false;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS global_bank boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS portal_settings (
  id integer PRIMARY KEY CHECK(id=1),
  question_bank_id uuid NOT NULL UNIQUE REFERENCES institutions(id)
);
DO $$
DECLARE bank_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal_settings WHERE id=1) THEN
    INSERT INTO institutions(name,slug) VALUES('Banco geral UfaProva','ufaprova-global-'||gen_random_uuid()::text) RETURNING id INTO bank_id;
    INSERT INTO portal_settings(id,question_bank_id) VALUES(1,bank_id);
  END IF;
END $$;
INSERT INTO subscription_plans(id,name,monthly_assessments,max_students,storage_mb,concurrent_renders)
VALUES('portal-editorial','Operação editorial interna',1000,1,20000,2) ON CONFLICT(id) DO NOTHING;
INSERT INTO institution_subscriptions(institution_id,plan_id,status,period_started_at,period_ends_at)
SELECT question_bank_id,'portal-editorial','active',now(),'infinity'::timestamptz FROM portal_settings
ON CONFLICT(institution_id) DO NOTHING;
