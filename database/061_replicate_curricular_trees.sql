-- Replica árvores curriculares do catálogo canônico para todas as instituições.
-- Algumas migrações do Referencial foram originalmente carregadas apenas na
-- primeira instituição criada; o catálogo deve estar disponível para cada escola.
WITH source_roots AS (
  SELECT DISTINCT ON (d.name, t.name, t.grade_range)
         d.name AS discipline_name, t.name, t.grade_range, t.position,
         t.source_reference
  FROM pedagogical_topics t
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE t.parent_id IS NULL AND d.stage = 'Ensino Médio'
  ORDER BY d.name, t.name, t.grade_range, t.id
), targets AS (
  SELECT DISTINCT i.id AS institution_id, d.id AS discipline_id,
         d.name AS discipline_name
  FROM institutions i
  JOIN pedagogical_disciplines d ON d.institution_id = i.id
  WHERE d.stage = 'Ensino Médio'
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, position, grade_range, source_reference)
SELECT x.institution_id, x.discipline_id, NULL, s.name, s.position,
       s.grade_range, s.source_reference
FROM source_roots s
JOIN targets x ON x.discipline_name = s.discipline_name
ON CONFLICT DO NOTHING;

WITH source_children AS (
  SELECT DISTINCT ON (d.name, parent.name, t.name, t.grade_range)
         d.name AS discipline_name, parent.name AS parent_name,
         parent.grade_range AS parent_grade, t.name, t.grade_range,
         t.position, t.source_reference
  FROM pedagogical_topics t
  JOIN pedagogical_topics parent ON parent.id = t.parent_id
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE d.stage = 'Ensino Médio'
  ORDER BY d.name, parent.name, t.name, t.grade_range, t.id
), target_roots AS (
  SELECT t.id, t.institution_id, d.name AS discipline_name,
         t.name, t.grade_range
  FROM pedagogical_topics t
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE t.parent_id IS NULL AND d.stage = 'Ensino Médio'
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, position, grade_range, source_reference)
SELECT r.institution_id, d.id, r.id, c.name, c.position,
       c.grade_range, c.source_reference
FROM source_children c
JOIN target_roots r
  ON r.discipline_name = c.discipline_name
 AND r.name = c.parent_name
 AND r.grade_range = c.parent_grade
JOIN pedagogical_disciplines d
  ON d.id = r.discipline_id
ON CONFLICT DO NOTHING;
