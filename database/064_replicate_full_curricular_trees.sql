-- Garante que o catálogo completo (objeto, subtópico e detalhamento) esteja
-- disponível na instituição da sessão. As migrações anteriores copiavam apenas
-- os dois primeiros níveis e, por isso, Química podia aparecer sem subtópicos.

WITH source_roots AS (
  SELECT DISTINCT ON (d.name, t.name)
         d.name AS discipline_name, t.name, t.grade_range, t.position,
         t.source_reference
  FROM pedagogical_topics t
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE t.parent_id IS NULL AND d.stage = 'Ensino Médio'
  ORDER BY d.name, t.name, t.id
), targets AS (
  SELECT d.id AS discipline_id, d.name AS discipline_name
  FROM pedagogical_disciplines d
  WHERE d.stage = 'Ensino Médio'
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, position, grade_range, source_reference)
SELECT d.institution_id, d.discipline_id, NULL, s.name, s.position,
       s.grade_range, s.source_reference
FROM source_roots s
JOIN targets x ON x.discipline_name = s.discipline_name
JOIN pedagogical_disciplines d ON d.id = x.discipline_id
ON CONFLICT DO NOTHING;

WITH source_children AS (
  SELECT DISTINCT ON (d.name, p.name, t.name)
         d.name AS discipline_name, p.name AS parent_name,
         t.name, t.grade_range, t.position, t.source_reference
  FROM pedagogical_topics t
  JOIN pedagogical_topics p ON p.id = t.parent_id
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE p.parent_id IS NULL AND d.stage = 'Ensino Médio'
  ORDER BY d.name, p.name, t.name, t.id
), target_roots AS (
  SELECT t.id, t.discipline_id, d.name AS discipline_name, t.name,
         t.grade_range
  FROM pedagogical_topics t
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE t.parent_id IS NULL AND d.stage = 'Ensino Médio'
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, position, grade_range, source_reference)
SELECT r.institution_id, r.discipline_id, r.id, s.name, s.position,
       COALESCE(s.grade_range, r.grade_range), s.source_reference
FROM source_children s
JOIN target_roots r ON r.discipline_name = s.discipline_name
                    AND r.name = s.parent_name
ON CONFLICT DO NOTHING;

WITH source_details AS (
  SELECT DISTINCT ON (d.name, gp.name, p.name, t.name)
         d.name AS discipline_name, gp.name AS root_name,
         p.name AS parent_name, t.name, t.grade_range, t.position,
         t.source_reference
  FROM pedagogical_topics t
  JOIN pedagogical_topics p ON p.id = t.parent_id
  JOIN pedagogical_topics gp ON gp.id = p.parent_id
  JOIN pedagogical_disciplines d ON d.id = t.discipline_id
  WHERE gp.parent_id IS NULL AND d.stage = 'Ensino Médio'
  ORDER BY d.name, gp.name, p.name, t.name, t.id
), target_parents AS (
  SELECT p.id, p.institution_id, p.discipline_id,
         d.name AS discipline_name, gp.name AS root_name, p.name AS parent_name,
         p.grade_range
  FROM pedagogical_topics p
  JOIN pedagogical_topics gp ON gp.id = p.parent_id
  JOIN pedagogical_disciplines d ON d.id = p.discipline_id
  WHERE gp.parent_id IS NULL AND d.stage = 'Ensino Médio'
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, position, grade_range, source_reference)
SELECT p.institution_id, p.discipline_id, p.id, s.name, s.position,
       COALESCE(s.grade_range, p.grade_range), s.source_reference
FROM source_details s
JOIN target_parents p ON p.discipline_name = s.discipline_name
                     AND p.root_name = s.root_name
                     AND p.parent_name = s.parent_name
ON CONFLICT DO NOTHING;

UPDATE pedagogical_topics child
SET grade_range = parent.grade_range
FROM pedagogical_topics parent
WHERE child.parent_id = parent.id
  AND child.grade_range IS NULL;
