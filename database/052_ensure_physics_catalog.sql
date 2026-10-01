-- Garante o catálogo mínimo de Física por série para instituições restauradas.
WITH discipline AS (
  SELECT d.id, d.institution_id
  FROM pedagogical_disciplines d
  JOIN curriculum_areas a ON a.id = d.area_id
  WHERE d.name = 'Física' AND d.stage = 'Ensino Médio'
    AND a.source_key = 'em-area-cnt'
), catalog(name, grade_range, position) AS (
  VALUES
    ('Cinemática','1ª série',1), ('Dinâmica','1ª série',2),
    ('Estática','1ª série',3), ('Gravitação','1ª série',4),
    ('Trabalho, Energia e Potência','1ª série',5), ('Hidrostática','1ª série',6),
    ('Termologia','2ª série',1), ('Termodinâmica','2ª série',2),
    ('Ondulatória e Acústica','2ª série',3), ('Óptica','2ª série',4),
    ('Eletrostática','3ª série',1), ('Eletrodinâmica','3ª série',2),
    ('Eletromagnetismo','3ª série',3), ('Física Moderna','3ª série',4)
)
INSERT INTO pedagogical_topics (institution_id, discipline_id, name, grade_range, position)
SELECT d.institution_id, d.id, c.name, c.grade_range, c.position
FROM discipline d CROSS JOIN catalog c
ON CONFLICT (discipline_id, lower(name)) WHERE parent_id IS NULL
DO UPDATE SET grade_range = EXCLUDED.grade_range, position = EXCLUDED.position;
