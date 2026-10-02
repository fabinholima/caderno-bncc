-- Garante o catálogo institucional completo do Ensino Médio para o Planejamento.
WITH catalog(area_key, subject_name) AS (
  VALUES
    ('em-area-lgg','Língua Portuguesa'), ('em-area-lgg','Literatura'),
    ('em-area-lgg','Arte'), ('em-area-lgg','Educação Física'),
    ('em-area-lgg','Língua Inglesa'), ('em-area-mat','Matemática'),
    ('em-area-cnt','Biologia'), ('em-area-cnt','Física'), ('em-area-cnt','Química'),
    ('em-area-chs','História'), ('em-area-chs','Geografia'),
    ('em-area-chs','Sociologia'), ('em-area-chs','Filosofia')
), owners AS (
  SELECT i.id AS institution_id,
         COALESCE(
           (SELECT m.user_id FROM memberships m WHERE m.institution_id = i.id ORDER BY m.user_id LIMIT 1),
           (SELECT d.created_by FROM pedagogical_disciplines d WHERE d.institution_id = i.id LIMIT 1)
         ) AS user_id
  FROM institutions i
)
INSERT INTO pedagogical_disciplines (institution_id, area_id, name, stage, created_by)
SELECT o.institution_id, a.id, c.subject_name, 'Ensino Médio', o.user_id
FROM owners o
JOIN catalog c ON TRUE
JOIN curriculum_areas a
  ON a.source_key = c.area_key AND a.curriculum_version = 'BNCC-2018'
WHERE o.user_id IS NOT NULL
ON CONFLICT (institution_id, area_id, name) DO UPDATE
SET stage = EXCLUDED.stage, updated_at = now();
