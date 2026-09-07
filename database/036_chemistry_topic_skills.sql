CREATE TABLE IF NOT EXISTS pedagogical_topic_skills (
  topic_id uuid NOT NULL REFERENCES pedagogical_topics(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES curriculum_skills(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, skill_id)
);

CREATE INDEX IF NOT EXISTS pedagogical_topic_skills_skill_idx
  ON pedagogical_topic_skills (skill_id, topic_id);

-- Cada descendente herda a habilidade definida para seu objeto raiz.
WITH RECURSIVE chemistry_tree AS (
  SELECT topic.id, topic.id AS root_id, topic.name AS root_name
  FROM pedagogical_topics topic
  JOIN pedagogical_disciplines discipline ON discipline.id = topic.discipline_id
  WHERE topic.parent_id IS NULL
    AND discipline.name = 'Química'
    AND discipline.stage = 'Ensino Médio'
  UNION ALL
  SELECT child.id, tree.root_id, tree.root_name
  FROM pedagogical_topics child
  JOIN chemistry_tree tree ON tree.id = child.parent_id
), mapping(root_name, skill_code) AS (
  VALUES
    ('Estequiometria', 'EM13CNT101'),
    ('Termoquímica', 'EM13CNT101'),
    ('Cinética Química', 'EM13CNT101'),
    ('Equilíbrio Químico', 'EM13CNT101'),
    ('Funções Inorgânicas', 'EM13CNT104'),
    ('Radioatividade', 'EM13CNT104'),
    ('Química Ambiental', 'EM13CNT104'),
    ('Bioquímica', 'EM13CNT104'),
    ('Ligações Químicas', 'EM13CNT307'),
    ('Eletroquímica', 'EM13CNT307'),
    ('Polímeros', 'EM13CNT307'),
    ('Química Orgânica', 'EM13CNT307')
)
INSERT INTO pedagogical_topic_skills (topic_id, skill_id)
SELECT tree.id, skill.id
FROM chemistry_tree tree
JOIN mapping ON mapping.root_name = tree.root_name
JOIN curriculum_skills skill ON skill.code = mapping.skill_code
ON CONFLICT (topic_id, skill_id) DO NOTHING;

COMMENT ON TABLE pedagogical_topic_skills IS
  'Relação pedagógica institucional entre conteúdos e habilidades oficiais; não altera a BNCC.';
