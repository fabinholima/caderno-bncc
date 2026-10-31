-- O aluno pode se vincular ao próprio cadastro pelo código individual
-- (students.access_code), sem convite de turma nem aprovação do professor.
-- As aprovações criadas assim não têm convite; a origem fica registrada.
-- Vínculos por convite existentes continuam válidos (source='invite').
ALTER TABLE class_join_requests ALTER COLUMN invite_id DROP NOT NULL;
ALTER TABLE class_join_requests ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'invite';
ALTER TABLE class_join_requests DROP CONSTRAINT IF EXISTS class_join_requests_source_check;
ALTER TABLE class_join_requests ADD CONSTRAINT class_join_requests_source_check
  CHECK (source IN ('invite','access_code') AND (source = 'access_code' OR invite_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS class_join_requests_student_idx ON class_join_requests(student_id) WHERE student_id IS NOT NULL;
