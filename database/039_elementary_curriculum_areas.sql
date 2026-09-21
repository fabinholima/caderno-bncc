-- Áreas e componentes curriculares do Ensino Fundamental.
-- Os objetos oficiais continuam na tabela curriculum_items; esta migração
-- cria as áreas necessárias para o catálogo pedagógico hierárquico.
WITH areas(source_key, name) AS (
  VALUES
    ('ef-area-linguagens', 'Linguagens'),
    ('ef-area-mat', 'Matemática'),
    ('ef-area-cnt', 'Ciências da Natureza'),
    ('ef-area-ch', 'Ciências Humanas')
)
INSERT INTO curriculum_areas (curriculum_version, source_key, name, stage)
SELECT 'BNCC-2018', source_key, name, 'Ensino Fundamental'
FROM areas
ON CONFLICT (curriculum_version, source_key) DO UPDATE
SET name = EXCLUDED.name, stage = EXCLUDED.stage;

WITH catalog(area_key, subject_name) AS (
  VALUES
    ('ef-area-linguagens', 'Língua Portuguesa'),
    ('ef-area-linguagens', 'Arte'),
    ('ef-area-linguagens', 'Educação Física'),
    ('ef-area-linguagens', 'Língua Inglesa'),
    ('ef-area-mat', 'Matemática'),
    ('ef-area-cnt', 'Ciências'),
    ('ef-area-ch', 'História'),
    ('ef-area-ch', 'Geografia')
), first_user AS (SELECT id FROM users ORDER BY created_at LIMIT 1)
INSERT INTO pedagogical_disciplines (institution_id, area_id, name, stage, created_by)
SELECT i.id, a.id, c.subject_name, 'Ensino Fundamental', u.id
FROM institutions i
JOIN first_user u ON true
JOIN catalog c ON true
JOIN curriculum_areas a
  ON a.curriculum_version = 'BNCC-2018' AND a.source_key = c.area_key
ON CONFLICT (institution_id, area_id, name)
DO UPDATE SET stage = EXCLUDED.stage, updated_at = now();
