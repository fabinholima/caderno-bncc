-- Repara códigos antigos cujo prefixo não correspondia à disciplina da revisão atual.
-- A numeração é preservada; em caso de colisão, o código original permanece.
WITH current_subject AS (
  SELECT q.id, q.institution_id, q.public_code,
         lower(translate(COALESCE(r.subject,''),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')) AS subject,
         regexp_replace(q.public_code, '^[^-]+-', '') AS sequence
  FROM questions q
  JOIN question_revisions r
    ON r.question_id=q.id AND r.revision=q.current_revision
), expected AS (
  SELECT *, CASE subject
    WHEN 'fisica' THEN 'FIS' WHEN 'biologia' THEN 'BIO'
    WHEN 'matematica' THEN 'MAT' WHEN 'quimica' THEN 'QUI'
    WHEN 'ciencias' THEN 'CIE' WHEN 'historia' THEN 'HIS'
    WHEN 'geografia' THEN 'GEO' WHEN 'filosofia' THEN 'FIL'
    WHEN 'sociologia' THEN 'SOC' WHEN 'lingua portuguesa' THEN 'LP'
    WHEN 'portugues' THEN 'LP' WHEN 'literatura' THEN 'LIT'
    WHEN 'lingua inglesa' THEN 'ING' WHEN 'ingles' THEN 'ING'
    WHEN 'arte' THEN 'ART' WHEN 'educacao fisica' THEN 'EDF'
    ELSE 'QST' END AS prefix
  FROM current_subject
), candidates AS (
  SELECT *, prefix || '-' || sequence AS new_code
  FROM expected
  WHERE public_code !~ ('^' || prefix || '-')
)
UPDATE questions q
SET public_code=c.new_code, updated_at=now()
FROM candidates c
WHERE q.id=c.id
  AND NOT EXISTS (
    SELECT 1 FROM questions conflict
    WHERE conflict.institution_id=c.institution_id
      AND conflict.public_code=c.new_code
      AND conflict.id<>c.id
  );
