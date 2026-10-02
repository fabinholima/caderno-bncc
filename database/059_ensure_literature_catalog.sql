-- Garante que Literatura esteja disponível no catálogo de Linguagens do Ensino Médio.
WITH owners AS (
  SELECT DISTINCT ON (m.institution_id) m.institution_id, m.user_id
  FROM memberships m
  JOIN users u ON u.id = m.user_id
  ORDER BY m.institution_id, u.created_at, u.id
)
INSERT INTO pedagogical_disciplines (institution_id, area_id, name, stage, created_by)
SELECT o.institution_id, a.id, 'Literatura', 'Ensino Médio', o.user_id
FROM owners o
JOIN curriculum_areas a
  ON a.source_key = 'em-area-lgg'
 AND a.curriculum_version = 'BNCC-2018'
ON CONFLICT (institution_id, area_id, name) DO UPDATE
SET stage = EXCLUDED.stage, updated_at = now();

