-- Replace abbreviated demonstration content with the official BNCC wording.
-- The earlier seed used valid codes with invented summaries; ON CONFLICT DO
-- NOTHING in migration 079 left those summaries visible in existing databases.
-- IDs are retained so existing question and curriculum links remain intact.

WITH area AS (
  SELECT id
  FROM curriculum_areas
  WHERE curriculum_version = 'BNCC-2018'
    AND source_key = 'em-area-cnt'
), official_skills(code, description) AS (
  VALUES
    (
      'EM13CNT101',
      'Analisar e representar, com ou sem o uso de dispositivos e de aplicativos digitais específicos, as transformações e conservações em sistemas que envolvam quantidade de matéria, de energia e de movimento para realizar previsões sobre seus comportamentos em situações cotidianas e em processos produtivos que priorizem o desenvolvimento sustentável, o uso consciente dos recursos naturais e a preservação da vida em todas as suas formas.'
    ),
    (
      'EM13CNT104',
      'Avaliar os benefícios e os riscos à saúde e ao ambiente, considerando a composição, a toxicidade e a reatividade de diferentes materiais e produtos, como também o nível de exposição a eles, posicionando-se criticamente e propondo soluções individuais e/ou coletivas para seus usos e descartes responsáveis.'
    ),
    (
      'EM13CNT307',
      'Analisar as propriedades dos materiais para avaliar a adequação de seu uso em diferentes aplicações (industriais, cotidianas, arquitetônicas ou tecnológicas) e/ ou propor soluções seguras e sustentáveis considerando seu contexto local e cotidiano.'
    )
)
UPDATE curriculum_skills skill
SET stage = 'Ensino Médio',
    subject = 'Ciências da Natureza e suas Tecnologias',
    grade_range = 'Ensino Médio (sem seriação)',
    description = official_skills.description,
    knowledge_object_id = NULL,
    source_metadata = COALESCE(skill.source_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'documento', 'bncc-2018',
        'arquivo', 'BNCC_Ensino_Medio.xlsx',
        'fonte', 'Download da BNCC — MEC',
        'localizador_pdf', 'Base-Nacional-Comum-Curricular-BNCC.pdf, páginas 557 e 561'
      )
FROM official_skills, area
WHERE skill.curriculum_version = 'BNCC-2018'
  AND skill.code = official_skills.code;

-- Correct the competency summaries seeded with the same abbreviated data.
WITH area AS (
  SELECT id
  FROM curriculum_areas
  WHERE curriculum_version = 'BNCC-2018'
    AND source_key = 'em-area-cnt'
), official_competencies(number, description) AS (
  VALUES
    (1, 'Analisar fenômenos naturais e processos tecnológicos, com base nas interações e relações entre matéria e energia, para propor ações individuais e coletivas que aperfeiçoem processos produtivos, minimizem impactos socioambientais e melhorem as condições de vida em âmbito local, regional e global.'),
    (2, 'Analisar e utilizar interpretações sobre a dinâmica da Vida, da Terra e do Cosmos para elaborar argumentos, realizar previsões sobre o funcionamento e a evolução dos seres vivos e do Universo, e fundamentar e defender decisões éticas e responsáveis.'),
    (3, 'Investigar situações-problema e avaliar aplicações do conhecimento científico e tecnológico e suas implicações no mundo, utilizando procedimentos e linguagens próprios das Ciências da Natureza, para propor soluções que considerem demandas locais, regionais e/ou globais, e comunicar suas descobertas e conclusões a públicos variados, em diversos contextos e por meio de diferentes mídias e tecnologias digitais de informação e comunicação (TDIC).')
)
UPDATE curriculum_competencies competency
SET description = official_competencies.description
FROM official_competencies, area
WHERE competency.area_id = area.id
  AND competency.number = official_competencies.number;

-- A habilidade belongs to the specific BNCC competency indicated by its first
-- trailing digit. This also removes the incorrect EM13CNT104 -> competency 2
-- link created by the demonstration seed (the code belongs to competency 1).
DELETE FROM skill_competencies link
USING curriculum_skills skill
WHERE link.skill_id = skill.id
  AND skill.curriculum_version = 'BNCC-2018'
  AND skill.code ~ '^EM13CNT[123][0-9]{2}$';

INSERT INTO skill_competencies(skill_id, competency_id)
SELECT skill.id, competency.id
FROM curriculum_skills skill
JOIN curriculum_areas area
  ON area.curriculum_version = skill.curriculum_version
 AND area.source_key = 'em-area-cnt'
JOIN curriculum_competencies competency
  ON competency.area_id = area.id
 AND competency.number = substring(skill.code FROM 8 FOR 1)::integer
WHERE skill.curriculum_version = 'BNCC-2018'
  AND skill.code ~ '^EM13CNT[123][0-9]{2}$'
ON CONFLICT (skill_id, competency_id) DO NOTHING;
