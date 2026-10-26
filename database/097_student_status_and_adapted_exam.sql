ALTER TABLE students ADD COLUMN status text;
ALTER TABLE students ADD COLUMN adapted_exam boolean NOT NULL DEFAULT false;

-- Preserve the unknown reason for legacy inactive students.
UPDATE students SET status = 'ativo' WHERE active;
ALTER TABLE students ALTER COLUMN status SET DEFAULT 'ativo';
ALTER TABLE students ADD CONSTRAINT students_status_check
  CHECK (status IN ('ativo', 'transferido', 'remanejado', 'atestado', 'regime_domiciliar'));
