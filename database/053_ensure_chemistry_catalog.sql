-- Garante o catálogo de Química por série, com tópicos e subtópicos.
WITH discipline AS (
  SELECT d.id, d.institution_id
  FROM pedagogical_disciplines d
  JOIN curriculum_areas a ON a.id = d.area_id
  WHERE d.name = 'Química' AND d.stage = 'Ensino Médio'
    AND a.source_key = 'em-area-cnt'
), catalog(name, grade_range, position) AS (
  VALUES
    ('Introdução à Química','1ª série',1), ('Estrutura Atômica','1ª série',2),
    ('Tabela Periódica','1ª série',3), ('Ligações Químicas','1ª série',4),
    ('Funções Inorgânicas','1ª série',5), ('Reações Químicas','1ª série',6),
    ('Estequiometria','1ª série',7), ('Gases','1ª série',8),
    ('Soluções','2ª série',1), ('Propriedades Coligativas','2ª série',2),
    ('Termoquímica','2ª série',3), ('Cinética Química','2ª série',4),
    ('Equilíbrio Químico','2ª série',5), ('Eletroquímica','2ª série',6),
    ('Química Orgânica','3ª série',1), ('Polímeros','3ª série',2),
    ('Química Ambiental','3ª série',3), ('Radioatividade','3ª série',4)
), roots AS (
  INSERT INTO pedagogical_topics (institution_id, discipline_id, name, grade_range, position)
  SELECT d.institution_id, d.id, c.name, c.grade_range, c.position
  FROM discipline d CROSS JOIN catalog c
  ON CONFLICT (discipline_id, lower(name)) WHERE parent_id IS NULL
  DO UPDATE SET grade_range = EXCLUDED.grade_range, position = EXCLUDED.position
  RETURNING id, discipline_id, name
)
SELECT 1;
