CREATE TABLE IF NOT EXISTS pedagogical_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES pedagogical_disciplines(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES pedagogical_topics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  position integer NOT NULL DEFAULT 1 CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pedagogical_topics_root_unique
  ON pedagogical_topics (discipline_id, lower(name)) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pedagogical_topics_child_unique
  ON pedagogical_topics (parent_id, lower(name)) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedagogical_topics_discipline_idx
  ON pedagogical_topics (institution_id, discipline_id, parent_id, position);

ALTER TABLE question_revisions
  ADD COLUMN IF NOT EXISTS pedagogical_topic_id uuid
  REFERENCES pedagogical_topics(id) ON DELETE SET NULL;

INSERT INTO pedagogical_topics (institution_id, discipline_id, name, position)
SELECT institution_id, id, topic.name, topic.position
FROM pedagogical_disciplines
CROSS JOIN (VALUES ('Termoquímica', 1), ('Eletroquímica', 2)) AS topic(name, position)
WHERE pedagogical_disciplines.name = 'Química'
ON CONFLICT DO NOTHING;

INSERT INTO pedagogical_topics (institution_id, discipline_id, parent_id, name, position)
SELECT root.institution_id, root.discipline_id, root.id, child.name, child.position
FROM pedagogical_topics root
CROSS JOIN (VALUES
  ('Termoquímica', 'Lei de Hess', 1),
  ('Termoquímica', 'Entalpia de Formação', 2),
  ('Termoquímica', 'Entalpia de Ligação', 3),
  ('Eletroquímica', 'NOX', 1),
  ('Eletroquímica', 'Lei de Faraday', 2)
) AS child(parent_name, name, position)
WHERE root.parent_id IS NULL AND root.name = child.parent_name
ON CONFLICT DO NOTHING;

COMMENT ON TABLE pedagogical_topics IS
  'Hierarquia institucional de objetos e subtópicos pedagógicos usada para classificar e filtrar questões.';
