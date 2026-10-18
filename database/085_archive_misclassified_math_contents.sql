-- A extração usada em 057 continuou além do capítulo de Matemática e
-- importou os capítulos de Ciências da Natureza como Matemática/Conteúdos.
-- Arquiva somente o ramo com essa origem conhecida, inclusive suas cópias
-- institucionais feitas por 061/063/064. Preserva IDs e vínculos de questões.
WITH RECURSIVE incorrect_topics AS (
  SELECT topic.id
  FROM pedagogical_topics topic
  JOIN pedagogical_disciplines discipline ON discipline.id = topic.discipline_id
  WHERE discipline.name = 'Matemática'
    AND discipline.stage = 'Ensino Médio'
    AND topic.parent_id IS NULL
    AND lower(topic.name) = lower('Conteúdos')
    AND topic.source_reference = 'Referencial Curricular do Ensino Médio de MS (2012)'
  UNION
  SELECT child.id
  FROM pedagogical_topics child
  JOIN incorrect_topics parent ON parent.id = child.parent_id
)
UPDATE pedagogical_topics
SET active = false
WHERE id IN (SELECT id FROM incorrect_topics) AND active;
