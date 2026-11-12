-- Texto-base sempre em largura total (uma coluna) nas provas de duas
-- colunas, como a opção "Usar sempre uma coluna" das questões. Texto com
-- linhas numeradas já sai em largura total independentemente desta opção.
ALTER TABLE question_shared_texts
  ADD COLUMN full_width boolean NOT NULL DEFAULT false;
