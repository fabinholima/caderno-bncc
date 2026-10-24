-- Repair a production schema drift: the migration that originally added this
-- column is recorded as applied, but the students table is missing it.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS selfie_data_url text NOT NULL DEFAULT '';
