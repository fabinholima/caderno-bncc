-- Permite repetir o mesmo nome de tópico raiz em séries distintas,
-- mantendo a unicidade dentro de cada disciplina e série.
DROP INDEX IF EXISTS pedagogical_topics_root_unique;
CREATE UNIQUE INDEX pedagogical_topics_root_unique
  ON pedagogical_topics (discipline_id, lower(name), COALESCE(grade_range, ''))
  WHERE parent_id IS NULL;
