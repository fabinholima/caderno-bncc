-- O portal usa a nomenclatura de série do Ensino Médio. O catálogo legado do
-- Referencial MS usava "ano", o que fazia os tópicos desaparecerem no filtro.
UPDATE pedagogical_topics
SET grade_range = CASE grade_range
  WHEN '1º ano' THEN '1ª série'
  WHEN '2º ano' THEN '2ª série'
  WHEN '3º ano' THEN '3ª série'
  ELSE grade_range
END
WHERE grade_range IN ('1º ano','2º ano','3º ano');

-- Garante que cada disciplina de uma área tenha todas as habilidades oficiais
-- disponíveis dessa área, sem remover associações manuais existentes.
INSERT INTO pedagogical_discipline_skills (discipline_id, skill_id, tagged_by, rationale)
SELECT d.id, s.id, d.created_by,
       'Vínculo BNCC por área (reparo de catálogo); associações existentes preservadas.'
FROM pedagogical_disciplines d
JOIN curriculum_areas a ON a.id=d.area_id
JOIN curriculum_skills s ON s.stage='Ensino Médio'
 AND ((d.name='Matemática' AND s.code LIKE 'EM13MAT%')
   OR (d.name IN ('Biologia','Física','Química') AND s.code LIKE 'EM13CNT%')
   OR (d.name IN ('Língua Portuguesa','Arte','Educação Física','Língua Inglesa') AND s.code LIKE 'EM13LGG%')
   OR (d.name IN ('História','Geografia','Sociologia','Filosofia') AND s.code LIKE 'EM13CHS%'))
WHERE d.stage='Ensino Médio'
ON CONFLICT (discipline_id, skill_id) DO NOTHING;
