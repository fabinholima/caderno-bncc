-- Garante que o catálogo completo do Ensino Médio seja associado a todas as
-- instituições existentes, inclusive em bancos restaurados após as migrações 037/038.
WITH areas(source_key, name) AS (
  VALUES
    ('em-area-lgg', 'Linguagens e suas Tecnologias'),
    ('em-area-mat', 'Matemática e suas Tecnologias'),
    ('em-area-cnt', 'Ciências da Natureza e suas Tecnologias'),
    ('em-area-chs', 'Ciências Humanas e Sociais Aplicadas')
)
INSERT INTO curriculum_areas (curriculum_version, source_key, name, stage)
SELECT 'BNCC-2018', source_key, name, 'Ensino Médio' FROM areas
ON CONFLICT (curriculum_version, source_key) DO UPDATE
SET name = EXCLUDED.name, stage = EXCLUDED.stage;

WITH catalog(area_key, subject_name) AS (
  VALUES
    ('em-area-lgg','Língua Portuguesa'), ('em-area-lgg','Arte'),
    ('em-area-lgg','Educação Física'), ('em-area-lgg','Língua Inglesa'),
    ('em-area-mat','Matemática'), ('em-area-cnt','Biologia'),
    ('em-area-cnt','Física'), ('em-area-cnt','Química'),
    ('em-area-chs','História'), ('em-area-chs','Geografia'),
    ('em-area-chs','Sociologia'), ('em-area-chs','Filosofia')
), owners AS (
  SELECT DISTINCT ON (m.institution_id) m.institution_id, m.user_id
  FROM memberships m JOIN users u ON u.id = m.user_id
  ORDER BY m.institution_id, u.created_at, u.id
)
INSERT INTO pedagogical_disciplines (institution_id, area_id, name, stage, created_by)
SELECT o.institution_id, a.id, c.subject_name, 'Ensino Médio', o.user_id
FROM owners o CROSS JOIN catalog c
JOIN curriculum_areas a ON a.source_key = c.area_key AND a.curriculum_version = 'BNCC-2018'
ON CONFLICT (institution_id, area_id, name) DO UPDATE
SET stage = EXCLUDED.stage, updated_at = now();
