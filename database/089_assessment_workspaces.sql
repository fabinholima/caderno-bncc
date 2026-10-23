-- Editable assemblies are separate from immutable assessments and applications.
CREATE TABLE assessment_workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 created_by uuid NOT NULL REFERENCES users(id),
 configuration jsonb NOT NULL,
 assessment_id uuid REFERENCES assessments(id),
 pinned boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_workspaces_owner ON assessment_workspaces(institution_id,created_by,updated_at DESC);
