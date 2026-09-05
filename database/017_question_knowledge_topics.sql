ALTER TABLE question_revisions
  ADD COLUMN knowledge_topic text;

COMMENT ON COLUMN question_revisions.knowledge_topic IS
  'Tema ou objeto pedagógico informado pelo professor; não altera a taxonomia oficial da BNCC.';
