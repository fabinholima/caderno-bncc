-- Etapa 1: identifica a hierarquia pedagógica baseada no Referencial MS 2012.
-- Bimestre não faz parte do modelo; a seriação fica em grade_range.
ALTER TABLE pedagogical_topics
  ADD COLUMN IF NOT EXISTS source_reference text;

UPDATE pedagogical_topics
SET source_reference = 'Referencial Curricular do Ensino Médio - MS (2012)'
WHERE source_reference IS NULL;
