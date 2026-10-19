-- Remove apenas o ramo importado por engano em Matemática e arquivado por 085.
-- Não remove assuntos nas disciplinas corretas nem arquivos editoriais comuns.
-- A cópia JSON preserva os registros e suas relações para recuperação.
CREATE TABLE IF NOT EXISTS pedagogical_topic_cleanup_backups (
  topic_id uuid PRIMARY KEY,
  migration text NOT NULL,
  topic jsonb NOT NULL,
  skill_links jsonb NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now()
);

-- Impede que um vínculo seja criado entre a verificação e a exclusão.
LOCK TABLE pedagogical_topics, question_revisions, question_editor_drafts,
  pedagogical_topic_skills, exam_imports IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE misclassified_topic_cleanup ON COMMIT DROP AS
WITH RECURSIVE subtree AS (
  SELECT topic.id, topic.id AS root_id, topic.active
  FROM pedagogical_topics topic
  JOIN pedagogical_disciplines discipline ON discipline.id = topic.discipline_id
  WHERE discipline.name = 'Matemática'
    AND discipline.stage = 'Ensino Médio'
    AND topic.parent_id IS NULL
    AND lower(topic.name) = lower('Conteúdos')
    AND topic.source_reference = 'Referencial Curricular do Ensino Médio de MS (2012)'
    AND NOT topic.active
  UNION ALL
  SELECT child.id, parent.root_id, child.active
  FROM pedagogical_topics child
  JOIN subtree parent ON child.parent_id = parent.id
), safe_roots AS (
  SELECT root_id
  FROM subtree
  GROUP BY root_id
  HAVING bool_and(NOT active)
    AND NOT EXISTS (
      SELECT 1 FROM question_revisions revision
      JOIN subtree linked ON linked.id = revision.pedagogical_topic_id
      WHERE linked.root_id = subtree.root_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM question_editor_drafts draft
      JOIN subtree linked ON draft.payload::text LIKE '%' || linked.id::text || '%'
      WHERE draft.completed_at IS NULL AND linked.root_id = subtree.root_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM exam_imports imported
      JOIN subtree linked ON imported.extracted_candidates::text LIKE '%' || linked.id::text || '%'
      WHERE linked.root_id = subtree.root_id
    )
)
SELECT id FROM subtree WHERE root_id IN (SELECT root_id FROM safe_roots);

INSERT INTO pedagogical_topic_cleanup_backups (topic_id, migration, topic, skill_links)
SELECT topic.id, '087_remove_unused_misclassified_math_topics.sql', to_jsonb(topic),
       COALESCE((SELECT jsonb_agg(to_jsonb(relation))
                 FROM pedagogical_topic_skills relation WHERE relation.topic_id = topic.id), '[]'::jsonb)
FROM pedagogical_topics topic
JOIN misclassified_topic_cleanup cleanup ON cleanup.id = topic.id
ON CONFLICT (topic_id) DO NOTHING;

DELETE FROM pedagogical_topics
WHERE id IN (SELECT id FROM misclassified_topic_cleanup);
