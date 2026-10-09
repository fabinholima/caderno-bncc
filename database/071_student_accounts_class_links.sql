ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'educator' CHECK (account_type IN ('educator','student'));
ALTER TABLE oauth_login_attempts ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'educator' CHECK (account_type IN ('educator','student'));
ALTER TABLE mobile_google_login_attempts ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'educator' CHECK (account_type IN ('educator','student'));
CREATE TABLE IF NOT EXISTS student_account_links (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL UNIQUE REFERENCES students(id) ON DELETE RESTRICT,
  linked_by uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(institution_id,user_id)
);
ALTER TABLE class_invites ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES educator_schools(id) ON DELETE RESTRICT;
