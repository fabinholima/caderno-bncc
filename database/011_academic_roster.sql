CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL, grade text NOT NULL, school_year integer NOT NULL CHECK (school_year BETWEEN 2000 AND 2100),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (institution_id, name, school_year)
);
CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  registration text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (institution_id, registration)
);
CREATE TABLE class_enrollments (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE, student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  number integer CHECK (number > 0), PRIMARY KEY (class_id, student_id), UNIQUE (class_id, number)
);
CREATE TABLE assessment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE, class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  scheduled_at timestamptz, status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (assessment_id, class_id)
);
CREATE INDEX classes_institution_year_idx ON classes (institution_id, school_year DESC);
CREATE INDEX students_institution_name_idx ON students (institution_id, name);
CREATE INDEX applications_institution_idx ON assessment_applications (institution_id, created_at DESC);
