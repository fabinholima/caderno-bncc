-- Componentes curriculares do Ensino Médio, organizados pelas áreas oficiais da BNCC.
-- Objetos e subtópicos pedagógicos permanecem em catálogos revisados separados.
WITH catalog(area_key, subject_name) AS (
  VALUES
    ('em-area-lgg','Língua Portuguesa'),
    ('em-area-lgg','Arte'),
    ('em-area-lgg','Educação Física'),
    ('em-area-lgg','Língua Inglesa'),
    ('em-area-mat','Matemática'),
    ('em-area-cnt','Biologia'),
    ('em-area-cnt','Física'),
    ('em-area-cnt','Química'),
    ('em-area-chs','História'),
    ('em-area-chs','Geografia'),
    ('em-area-chs','Sociologia'),
    ('em-area-chs','Filosofia')
), first_user AS (
  SELECT id FROM users ORDER BY created_at LIMIT 1
)
INSERT INTO pedagogical_disciplines (institution_id, area_id, name, stage, created_by)
SELECT i.id, a.id, c.subject_name, 'Ensino Médio', u.id
FROM institutions i
JOIN first_user u ON true
JOIN catalog c ON true
JOIN curriculum_areas a ON a.curriculum_version='BNCC-2018' AND a.source_key=c.area_key
ON CONFLICT (institution_id, area_id, name) DO UPDATE SET stage=EXCLUDED.stage, updated_at=now();
