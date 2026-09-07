-- Mantém três habilidades oficiais na camada pedagógica de Química.
WITH chemistry AS (
  SELECT discipline.id
  FROM pedagogical_disciplines discipline
  JOIN curriculum_areas area ON area.id = discipline.area_id
  WHERE discipline.name = 'Química'
    AND discipline.stage = 'Ensino Médio'
    AND area.source_key = 'em-area-cnt'
)
DELETE FROM pedagogical_discipline_skills link
USING chemistry, curriculum_skills skill
WHERE link.discipline_id = chemistry.id
  AND skill.id = link.skill_id
  AND skill.code NOT IN ('EM13CNT101', 'EM13CNT104', 'EM13CNT307');

INSERT INTO pedagogical_discipline_skills
  (discipline_id, skill_id, tagged_by, rationale)
SELECT discipline.id, skill.id, discipline.created_by,
       'Vínculo pedagógico de Química definido pela instituição.'
FROM pedagogical_disciplines discipline
JOIN curriculum_areas area ON area.id = discipline.area_id
JOIN curriculum_skills skill
  ON skill.code IN ('EM13CNT101', 'EM13CNT104', 'EM13CNT307')
WHERE discipline.name = 'Química'
  AND discipline.stage = 'Ensino Médio'
  AND area.source_key = 'em-area-cnt'
  AND skill.stage = 'Ensino Médio'
ON CONFLICT (discipline_id, skill_id) DO NOTHING;
