ALTER TABLE saeb_matrices
  DROP CONSTRAINT IF EXISTS saeb_matrices_stage_check;

ALTER TABLE saeb_matrices
  ADD CONSTRAINT saeb_matrices_stage_check
  CHECK (stage IN ('Ensino Fundamental', 'Ensino Médio'));

COMMENT ON TABLE saeb_matrices IS
  'Matrizes de referência do Saeb para as etapas avaliadas, mantidas separadas do currículo BNCC.';
