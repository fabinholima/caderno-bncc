INSERT INTO pedagogical_topics
  (institution_id, discipline_id, name, grade_range, position)
SELECT institution_id, id, 'Bioquímica', '3ª série', 5
FROM pedagogical_disciplines
WHERE name = 'Química' AND stage = 'Ensino Médio'
ON CONFLICT DO NOTHING;

WITH catalog(name, position) AS (
  VALUES
    ('Carboidratos', 1),
    ('Proteínas', 2),
    ('Lipídios', 3)
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, grade_range, position)
SELECT root.institution_id, root.discipline_id, root.id, catalog.name,
       root.grade_range, catalog.position
FROM pedagogical_topics root
JOIN pedagogical_disciplines discipline ON discipline.id = root.discipline_id
CROSS JOIN catalog
WHERE root.parent_id IS NULL
  AND root.name = 'Bioquímica'
  AND discipline.name = 'Química'
  AND discipline.stage = 'Ensino Médio'
ON CONFLICT DO NOTHING;
