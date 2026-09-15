-- Tópicos e subtópicos pedagógicos do Ensino Médio.
-- São classificações institucionais complementares à BNCC.

BEGIN;

INSERT INTO curriculum_areas
  (curriculum_version, source_key, name, stage, source_metadata)
VALUES
  ('BNCC-2018', 'em-area-mat', 'Matemática e suas Tecnologias',
   'Ensino Médio', '{"documento":"bncc-2018"}'::jsonb),
  ('BNCC-2018', 'em-area-cnt', 'Ciências da Natureza e suas Tecnologias',
   'Ensino Médio', '{"documento":"bncc-2018"}'::jsonb)
ON CONFLICT (curriculum_version, source_key) DO NOTHING;

WITH disciplines(name, area_key) AS (
  VALUES ('Matemática', 'em-area-mat'), ('Física', 'em-area-cnt')
)
INSERT INTO pedagogical_disciplines
  (institution_id, area_id, name, created_by)
SELECT institution.id, area.id, disciplines.name, owner.id
FROM institutions institution
JOIN LATERAL (
  SELECT users.id FROM memberships
  JOIN users ON users.id = memberships.user_id
  WHERE memberships.institution_id = institution.id
  ORDER BY users.created_at, users.id LIMIT 1
) owner ON true
CROSS JOIN disciplines
JOIN curriculum_areas area
  ON area.curriculum_version = 'BNCC-2018'
 AND area.source_key = disciplines.area_key
ON CONFLICT (institution_id, area_id, name) DO NOTHING;

CREATE TEMP TABLE high_school_topic_catalog (
  discipline text, topic text, grade_range text, position integer
) ON COMMIT DROP;

INSERT INTO high_school_topic_catalog VALUES
  ('Matemática','Números e Álgebra','1ª série',1),
  ('Matemática','Funções','1ª série',2),
  ('Matemática','Sequências e Progressões','1ª série',3),
  ('Matemática','Geometria Plana','1ª série',4),
  ('Matemática','Trigonometria','1ª série',5),
  ('Matemática','Matrizes e Sistemas Lineares','2ª série',1),
  ('Matemática','Análise Combinatória','2ª série',2),
  ('Matemática','Probabilidade','2ª série',3),
  ('Matemática','Geometria Espacial','2ª série',4),
  ('Matemática','Geometria Analítica','3ª série',1),
  ('Matemática','Números Complexos','3ª série',2),
  ('Matemática','Polinômios e Equações Algébricas','3ª série',3),
  ('Matemática','Estatística','3ª série',4),
  ('Matemática','Matemática Financeira','3ª série',5),
  ('Física','Cinemática','1ª série',1),
  ('Física','Dinâmica','1ª série',2),
  ('Física','Estática','1ª série',3),
  ('Física','Gravitação','1ª série',4),
  ('Física','Trabalho, Energia e Potência','1ª série',5),
  ('Física','Hidrostática','1ª série',6),
  ('Física','Termologia','2ª série',1),
  ('Física','Termodinâmica','2ª série',2),
  ('Física','Ondulatória e Acústica','2ª série',3),
  ('Física','Óptica','2ª série',4),
  ('Física','Eletrostática','3ª série',1),
  ('Física','Eletrodinâmica','3ª série',2),
  ('Física','Eletromagnetismo','3ª série',3),
  ('Física','Física Moderna','3ª série',4);

INSERT INTO pedagogical_topics
  (institution_id, discipline_id, name, grade_range, position)
SELECT discipline.institution_id, discipline.id, catalog.topic,
       catalog.grade_range, catalog.position
FROM pedagogical_disciplines discipline
JOIN high_school_topic_catalog catalog
  ON catalog.discipline = discipline.name
WHERE discipline.stage = 'Ensino Médio'
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE high_school_subtopic_catalog (
  discipline text, topic text, subtopic text, position integer
) ON COMMIT DROP;

INSERT INTO high_school_subtopic_catalog VALUES
  ('Matemática','Números e Álgebra','Conjuntos numéricos e intervalos',1),
  ('Matemática','Números e Álgebra','Razão, proporção e porcentagem',2),
  ('Matemática','Números e Álgebra','Equações, inequações e sistemas',3),
  ('Matemática','Funções','Conceito, domínio, imagem e gráficos',1),
  ('Matemática','Funções','Função afim e quadrática',2),
  ('Matemática','Funções','Função exponencial e logarítmica',3),
  ('Matemática','Funções','Função modular',4),
  ('Matemática','Sequências e Progressões','Sequências numéricas',1),
  ('Matemática','Sequências e Progressões','Progressão aritmética',2),
  ('Matemática','Sequências e Progressões','Progressão geométrica',3),
  ('Matemática','Geometria Plana','Polígonos e ângulos',1),
  ('Matemática','Geometria Plana','Semelhança e relações métricas',2),
  ('Matemática','Geometria Plana','Áreas, circunferência e círculo',3),
  ('Matemática','Trigonometria','Razões trigonométricas',1),
  ('Matemática','Trigonometria','Ciclo e funções trigonométricas',2),
  ('Matemática','Trigonometria','Leis dos senos e dos cossenos',3),
  ('Matemática','Matrizes e Sistemas Lineares','Operações com matrizes',1),
  ('Matemática','Matrizes e Sistemas Lineares','Determinantes',2),
  ('Matemática','Matrizes e Sistemas Lineares','Sistemas lineares',3),
  ('Matemática','Análise Combinatória','Princípio fundamental da contagem',1),
  ('Matemática','Análise Combinatória','Permutações, arranjos e combinações',2),
  ('Matemática','Análise Combinatória','Binômio de Newton',3),
  ('Matemática','Probabilidade','Espaço amostral e eventos',1),
  ('Matemática','Probabilidade','Probabilidade condicional e independência',2),
  ('Matemática','Geometria Espacial','Prismas e pirâmides',1),
  ('Matemática','Geometria Espacial','Cilindros, cones e esferas',2),
  ('Matemática','Geometria Espacial','Áreas e volumes',3),
  ('Matemática','Geometria Analítica','Ponto e reta',1),
  ('Matemática','Geometria Analítica','Circunferência',2),
  ('Matemática','Geometria Analítica','Cônicas',3),
  ('Matemática','Números Complexos','Forma algébrica e operações',1),
  ('Matemática','Números Complexos','Plano de Argand-Gauss',2),
  ('Matemática','Números Complexos','Forma trigonométrica',3),
  ('Matemática','Polinômios e Equações Algébricas','Operações, divisão e fatoração',1),
  ('Matemática','Polinômios e Equações Algébricas','Raízes de equações algébricas',2),
  ('Matemática','Estatística','Tabelas e gráficos',1),
  ('Matemática','Estatística','Medidas de tendência central',2),
  ('Matemática','Estatística','Medidas de dispersão',3),
  ('Matemática','Matemática Financeira','Juros simples e compostos',1),
  ('Matemática','Matemática Financeira','Taxas e amortização',2),
  ('Física','Cinemática','Movimento uniforme e uniformemente variado',1),
  ('Física','Cinemática','Movimento circular',2),
  ('Física','Cinemática','Lançamentos e composição de movimentos',3),
  ('Física','Dinâmica','Leis de Newton',1),
  ('Física','Dinâmica','Forças de atrito, elástica e centrípeta',2),
  ('Física','Dinâmica','Impulso, quantidade de movimento e colisões',3),
  ('Física','Estática','Equilíbrio e torque',1),
  ('Física','Gravitação','Leis de Kepler',1),
  ('Física','Gravitação','Gravitação universal e satélites',2),
  ('Física','Trabalho, Energia e Potência','Trabalho e potência',1),
  ('Física','Trabalho, Energia e Potência','Energia e conservação',2),
  ('Física','Hidrostática','Densidade e pressão',1),
  ('Física','Hidrostática','Stevin, Pascal e Arquimedes',2),
  ('Física','Termologia','Escalas e dilatação térmica',1),
  ('Física','Termologia','Calorimetria e mudanças de estado',2),
  ('Física','Termologia','Transmissão de calor',3),
  ('Física','Termodinâmica','Gases ideais',1),
  ('Física','Termodinâmica','Leis da termodinâmica e máquinas térmicas',2),
  ('Física','Ondulatória e Acústica','Elementos e fenômenos ondulatórios',1),
  ('Física','Ondulatória e Acústica','Ondas estacionárias e acústica',2),
  ('Física','Ondulatória e Acústica','Efeito Doppler',3),
  ('Física','Óptica','Reflexão e espelhos',1),
  ('Física','Óptica','Refração e lentes',2),
  ('Física','Óptica','Instrumentos ópticos e visão',3),
  ('Física','Eletrostática','Carga, força e campo elétrico',1),
  ('Física','Eletrostática','Potencial, energia e capacitores',2),
  ('Física','Eletrodinâmica','Corrente, resistência e leis de Ohm',1),
  ('Física','Eletrodinâmica','Circuitos e leis de Kirchhoff',2),
  ('Física','Eletrodinâmica','Potência e consumo de energia',3),
  ('Física','Eletromagnetismo','Campo e força magnética',1),
  ('Física','Eletromagnetismo','Indução eletromagnética',2),
  ('Física','Eletromagnetismo','Geradores, motores e transformadores',3),
  ('Física','Física Moderna','Relatividade restrita',1),
  ('Física','Física Moderna','Física quântica e efeito fotoelétrico',2),
  ('Física','Física Moderna','Física nuclear e radioatividade',3);

INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, grade_range, position)
SELECT topic.institution_id, topic.discipline_id, topic.id,
       catalog.subtopic, topic.grade_range, catalog.position
FROM pedagogical_topics topic
JOIN pedagogical_disciplines discipline ON discipline.id = topic.discipline_id
JOIN high_school_subtopic_catalog catalog
  ON catalog.discipline = discipline.name AND catalog.topic = topic.name
WHERE topic.parent_id IS NULL AND discipline.stage = 'Ensino Médio'
ON CONFLICT DO NOTHING;

-- Matemática usa as habilidades EM13MAT; Física usa a área integrada EM13CNT.
INSERT INTO pedagogical_discipline_skills
  (discipline_id, skill_id, tagged_by, rationale)
SELECT discipline.id, skill.id, discipline.created_by,
       'Vínculo inicial com as habilidades da área BNCC do Ensino Médio.'
FROM pedagogical_disciplines discipline
JOIN curriculum_areas area ON area.id = discipline.area_id
JOIN curriculum_skills skill
  ON skill.stage = 'Ensino Médio'
 AND ((discipline.name = 'Matemática' AND skill.code LIKE 'EM13MAT%')
   OR (discipline.name = 'Física' AND skill.code LIKE 'EM13CNT%'))
WHERE discipline.name IN ('Matemática', 'Física')
  AND area.source_key IN ('em-area-mat', 'em-area-cnt')
ON CONFLICT (discipline_id, skill_id) DO NOTHING;

COMMENT ON TABLE pedagogical_topics IS
  'Hierarquia institucional de tópicos e subtópicos usada para classificar e filtrar questões.';

COMMIT;
