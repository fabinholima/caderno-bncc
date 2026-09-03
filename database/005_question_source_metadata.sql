ALTER TABLE question_revisions
  RENAME COLUMN source_name TO source_institution;

ALTER TABLE question_revisions
  ADD COLUMN source_year smallint,
  ADD CONSTRAINT question_revisions_source_year_check
    CHECK (source_year IS NULL OR source_year BETWEEN 1900 AND 2100);

CREATE INDEX question_revisions_source_idx
  ON question_revisions (source_institution, source_year);

COMMENT ON COLUMN question_revisions.source_institution IS
  'Instituição ou banca de origem da questão, como ENEM, FUVEST, UEMS ou UFMS.';

COMMENT ON COLUMN question_revisions.source_year IS
  'Ano da prova de origem; pertence à revisão da questão e não à disciplina.';
