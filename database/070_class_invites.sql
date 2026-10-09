ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('admin','coordinator','teacher','student'));

CREATE TABLE IF NOT EXISTS class_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  code_hint text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS class_invites_active_class_idx ON class_invites(class_id) WHERE active;

CREATE TABLE IF NOT EXISTS class_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES class_invites(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid REFERENCES students(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id),
  UNIQUE(class_id,user_id)
);
CREATE INDEX IF NOT EXISTS class_join_requests_class_status_idx ON class_join_requests(class_id,status,requested_at);
CREATE INDEX IF NOT EXISTS class_join_requests_user_idx ON class_join_requests(user_id,status);

