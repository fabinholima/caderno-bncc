-- Padroniza a seriação curricular do Ensino Médio.
-- O Referencial do MS usa "ano", enquanto o restante do catálogo usa "série".
UPDATE pedagogical_topics
SET grade_range = CASE grade_range
  WHEN '1º ano' THEN '1ª série'
  WHEN '2º ano' THEN '2ª série'
  WHEN '3º ano' THEN '3ª série'
  ELSE grade_range
END
WHERE grade_range IN ('1º ano', '2º ano', '3º ano');

UPDATE knowledge_objects
SET grade_range = CASE grade_range
  WHEN '1º ano' THEN '1ª série'
  WHEN '2º ano' THEN '2ª série'
  WHEN '3º ano' THEN '3ª série'
  ELSE grade_range
END
WHERE grade_range IN ('1º ano', '2º ano', '3º ano');

UPDATE curriculum_skills
SET grade_range = CASE grade_range
  WHEN '1º ano' THEN '1ª série'
  WHEN '2º ano' THEN '2ª série'
  WHEN '3º ano' THEN '3ª série'
  ELSE grade_range
END
WHERE grade_range IN ('1º ano', '2º ano', '3º ano');
