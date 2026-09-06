WITH RECURSIVE topic_tree AS (
  SELECT topic.id, topic.institution_id, topic.name,
         topic.parent_id, ARRAY[topic.name] AS names
  FROM pedagogical_topics topic
  JOIN pedagogical_disciplines discipline ON discipline.id=topic.discipline_id
  WHERE topic.parent_id IS NULL AND discipline.name='Química'
  UNION ALL
  SELECT child.id, child.institution_id, child.name,
         child.parent_id, tree.names || child.name
  FROM pedagogical_topics child
  JOIN topic_tree tree ON tree.id=child.parent_id
), mapping(public_code, grade, topic_path) AS (
  VALUES
    ('QUI-0002', '1ª série', 'Reações Químicas > Classificação das reações'),
    ('QUI-0003', '1ª série', 'Funções Inorgânicas > Teorias ácido-base'),
    ('QUI-0004', '2ª série', 'Cinética Química > Catálise'),
    ('QUI-0005', '2ª série', 'Termoquímica > Entalpia de Ligação'),
    ('QUI-0006', '3ª série', 'Química Orgânica > Reações orgânicas'),
    ('QUI-0007', '1ª série', 'Reações Químicas > Reações de oxirredução')
), resolved AS (
  SELECT mapping.public_code, mapping.grade, mapping.topic_path, tree.id topic_id,
         tree.institution_id
  FROM mapping
  JOIN topic_tree tree ON array_to_string(tree.names, ' > ')=mapping.topic_path
)
UPDATE question_revisions revision
SET grade=resolved.grade,
    knowledge_topic=resolved.topic_path,
    pedagogical_topic_id=resolved.topic_id
FROM questions question, resolved
WHERE revision.question_id=question.id
  AND revision.revision=question.current_revision
  AND question.public_code=resolved.public_code
  AND question.institution_id=resolved.institution_id
  AND revision.subject='Química'
  AND revision.grade='Ensino Médio (sem seriação)';
