-- Competências e habilidades do Ensino Médio usadas na classificação de questões.
-- A migração é idempotente para instalações existentes e novas.
WITH area AS (
  SELECT id FROM curriculum_areas
  WHERE curriculum_version = 'BNCC-2018' AND source_key = 'em-area-cnt'
), competencies(number, source_key, description) AS (
  VALUES
    (1, 'EM13CNT-COMP1', 'Analisar fenômenos naturais e processos tecnológicos para propor ações responsáveis.'),
    (2, 'EM13CNT-COMP2', 'Analisar interpretações sobre a dinâmica da vida, da Terra e do cosmos.'),
    (3, 'EM13CNT-COMP3', 'Investigar situações-problema e comunicar soluções com base em conhecimentos científicos.')
)
INSERT INTO curriculum_competencies (area_id, source_key, number, description)
SELECT area.id, competencies.source_key, competencies.number, competencies.description
FROM area CROSS JOIN competencies
ON CONFLICT (area_id, source_key) DO UPDATE
SET number = EXCLUDED.number, description = EXCLUDED.description;

INSERT INTO curriculum_skills
  (curriculum_version, code, stage, subject, grade_range, description)
VALUES
  ('BNCC-2018', 'EM13CNT307', 'Ensino Médio', 'Química', '1ª, 2ª e 3ª séries',
   'Analisar questões relacionadas à produção e ao uso de materiais e tecnologias, considerando seus impactos sociais e ambientais.')
ON CONFLICT (curriculum_version, code) DO UPDATE
SET stage = EXCLUDED.stage, subject = EXCLUDED.subject,
    grade_range = EXCLUDED.grade_range, description = EXCLUDED.description;

WITH area AS (
  SELECT id FROM curriculum_areas
  WHERE curriculum_version = 'BNCC-2018' AND source_key = 'em-area-cnt'
), links(code, competency_number) AS (
  VALUES ('EM13CNT101', 1), ('EM13CNT104', 2), ('EM13CNT307', 3)
)
INSERT INTO skill_competencies (skill_id, competency_id)
SELECT skill.id, competency.id
FROM links
JOIN curriculum_skills skill ON skill.code = links.code
JOIN curriculum_competencies competency
  ON competency.area_id = (SELECT id FROM area)
 AND competency.number = links.competency_number
ON CONFLICT DO NOTHING;
