-- Arquiva a questão de teste solicitada sem apagar o histórico das avaliações.
UPDATE questions
SET status = 'archived', updated_at = now()
WHERE public_code = 'MAT-0001' AND status <> 'archived';
