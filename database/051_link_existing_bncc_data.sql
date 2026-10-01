-- Etapa 2: associa as habilidades BNCC já disponíveis às disciplinas do catálogo.
-- A migração é conservadora: não cria códigos BNCC que não estejam no catálogo oficial local.
INSERT INTO pedagogical_discipline_skills
  (discipline_id, skill_id, tagged_by, rationale)
SELECT d.id, s.id, d.created_by,
       'Vínculo BNCC por área e disciplina; Referencial MS usado apenas na hierarquia pedagógica.'
FROM pedagogical_disciplines d
JOIN curriculum_areas a ON a.id = d.area_id
JOIN curriculum_skills s ON s.stage = 'Ensino Médio'
 AND ((d.name = 'Matemática' AND s.code LIKE 'EM13MAT%')
   OR (d.name IN ('Biologia','Física','Química') AND s.code LIKE 'EM13CNT%')
   OR (d.name IN ('Língua Portuguesa','Arte','Educação Física','Língua Inglesa') AND s.code LIKE 'EM13LGG%')
   OR (d.name IN ('História','Geografia','Sociologia','Filosofia') AND s.code LIKE 'EM13CHS%'))
WHERE d.stage = 'Ensino Médio'
  AND a.source_key IN ('em-area-mat','em-area-cnt','em-area-lgg','em-area-chs')
ON CONFLICT (discipline_id, skill_id) DO NOTHING;
