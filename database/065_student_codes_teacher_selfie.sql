ALTER TABLE students ADD COLUMN IF NOT EXISTS access_code text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS selfie_data_url text NOT NULL DEFAULT '';
ALTER TABLE educator_profiles ADD COLUMN IF NOT EXISTS selfie_data_url text NOT NULL DEFAULT '';
UPDATE students SET access_code = 'UFA-' || upper(substr(replace(id::text, '-', ''), 1, 8)) WHERE access_code IS NULL OR access_code = '';
CREATE UNIQUE INDEX IF NOT EXISTS students_access_code_unique ON students (lower(access_code));
CREATE INDEX IF NOT EXISTS students_teacher_idx ON students (teacher_id, institution_id);
