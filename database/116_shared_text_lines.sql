-- Opções de linhas do texto-base:
-- keep_line_breaks: cada linha cadastrada é uma linha impressa (poemas e
--   textos transcritos linha a linha, como no original).
-- line_numbering: numera as linhas, para questões que citam "(l. 3-4)".
--   Na prova, texto numerado sai em largura total para não quebrar linhas.
ALTER TABLE question_shared_texts
  ADD COLUMN keep_line_breaks boolean NOT NULL DEFAULT false,
  ADD COLUMN line_numbering boolean NOT NULL DEFAULT false;
