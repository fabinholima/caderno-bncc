-- Corrige a hierarquia de Biologia da 1ª série conforme o catálogo revisado
-- do Referencial Curricular do Ensino Médio de MS (2012).
-- Corrige também instituições que receberam o catálogo legado achatado.
-- IDs são preservados: itens legados deixam de aparecer, sem quebrar questões
-- que eventualmente ainda os referenciem.

BEGIN;

CREATE TEMP TABLE biology_first_year_catalog (parent_name text NOT NULL, name text NOT NULL, position integer NOT NULL) ON COMMIT DROP;
INSERT INTO biology_first_year_catalog(parent_name, name, position) VALUES
    ('Principais divisões da Biologia', 'Citologia', 1),
    ('Principais divisões da Biologia', 'Histologia', 2),
    ('Principais divisões da Biologia', 'Anatomia', 3),
    ('Principais divisões da Biologia', 'Taxonomia', 4),
    ('Principais divisões da Biologia', 'Embriologia', 5),
    ('Principais divisões da Biologia', 'Genética', 6),
    ('Principais divisões da Biologia', 'Evolução', 7),
    ('Principais divisões da Biologia', 'Ecologia', 8),
    ('Introdução à Citologia', 'Apresentação da célula', 1),
    ('Introdução à Citologia', 'Composição química da célula', 2),
    ('Introdução à Citologia', 'Membrana plasmática', 3),
    ('Citoplasma', 'Estruturas celulares', 1),
    ('Citoplasma', 'Forma, função e localização', 2),
    ('Núcleo', 'Ácidos nucleicos', 1),
    ('Núcleo', 'Divisão celular', 2),
    ('Metabolismo celular', 'Quimiossíntese', 1),
    ('Metabolismo celular', 'Fotossíntese', 2),
    ('Metabolismo celular', 'Fermentação', 3),
    ('Metabolismo celular', 'Respiração', 4),
    ('Histologia', 'Forma, localização e função', 1);

-- Padroniza a grafia antiga da série antes de completar o catálogo.
UPDATE pedagogical_topics t
SET grade_range = '1ª série', source_reference =
    'Referencial Curricular do Ensino Médio de MS (2012) — catálogo revisado'
FROM pedagogical_disciplines d
WHERE d.id = t.discipline_id AND lower(d.name) = lower('Biologia')
  AND d.stage = 'Ensino Médio' AND t.parent_id IS NULL
  AND t.grade_range = '1º ano'
  AND lower(t.name) IN (
    'origem da biologia', 'biologia como ciência',
    'principais divisões da biologia', 'origem da vida',
    'introdução à citologia', 'citoplasma', 'núcleo', 'metabolismo celular',
    'histologia', 'reprodução assexuada e sexuada',
    'desenvolvimento embrionário dos seres vivos', 'ciclos de vida'
  );

-- Insere as raízes e subtópicos que faltam em cada instituição.
WITH biology AS (SELECT d.institution_id, d.id AS discipline_id FROM pedagogical_disciplines d WHERE lower(d.name) = lower('Biologia') AND d.stage = 'Ensino Médio'), catalog(name, position) AS (
  VALUES
    ('Origem da Biologia', 1), ('Biologia como ciência', 2),
    ('Principais divisões da Biologia', 3), ('Origem da vida', 4),
    ('Introdução à Citologia', 5), ('Citoplasma', 6), ('Núcleo', 7),
    ('Metabolismo celular', 8), ('Histologia', 9),
    ('Reprodução assexuada e sexuada', 10),
    ('Desenvolvimento embrionário dos seres vivos', 11), ('Ciclos de vida', 12)
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, name, position, grade_range, source_reference)
SELECT b.institution_id, b.discipline_id, c.name, c.position, '1ª série',
       'Referencial Curricular do Ensino Médio de MS (2012) — catálogo revisado'
FROM biology b CROSS JOIN catalog c
WHERE NOT EXISTS (
  SELECT 1 FROM pedagogical_topics t WHERE t.discipline_id = b.discipline_id
    AND t.parent_id IS NULL AND lower(t.name) = lower(c.name)
    AND t.grade_range IN ('1ª série', '1º ano')
)
ON CONFLICT DO NOTHING;

-- Atualiza a série e os metadados de todas as raízes canônicas.
WITH biology AS (SELECT d.institution_id, d.id AS discipline_id FROM pedagogical_disciplines d WHERE lower(d.name) = lower('Biologia') AND d.stage = 'Ensino Médio'), catalog(name, position) AS (
  VALUES
    ('Origem da Biologia', 1), ('Biologia como ciência', 2),
    ('Principais divisões da Biologia', 3), ('Origem da vida', 4),
    ('Introdução à Citologia', 5), ('Citoplasma', 6), ('Núcleo', 7),
    ('Metabolismo celular', 8), ('Histologia', 9),
    ('Reprodução assexuada e sexuada', 10),
    ('Desenvolvimento embrionário dos seres vivos', 11), ('Ciclos de vida', 12)
)
UPDATE pedagogical_topics t
SET position = c.position, grade_range = '1ª série',
    source_reference = 'Referencial Curricular do Ensino Médio de MS (2012) — catálogo revisado'
FROM biology b JOIN catalog c ON true
WHERE t.discipline_id = b.discipline_id AND t.parent_id IS NULL
  AND lower(t.name) = lower(c.name) AND t.grade_range IN ('1ª série', '1º ano');

INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, position, grade_range, source_reference)
SELECT parent.institution_id, parent.discipline_id, parent.id, c.name, c.position,
       parent.grade_range,
       'Referencial Curricular do Ensino Médio de MS (2012) — catálogo revisado'
FROM biology_first_year_catalog c
JOIN pedagogical_topics parent ON parent.parent_id IS NULL
  AND lower(parent.name) = lower(c.parent_name)
  AND parent.grade_range = '1ª série'
JOIN pedagogical_disciplines d ON d.id = parent.discipline_id
  AND lower(d.name) = lower('Biologia') AND d.stage = 'Ensino Médio'
ON CONFLICT (parent_id, lower(name)) WHERE parent_id IS NOT NULL
DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position,
  grade_range = EXCLUDED.grade_range, active = true,
  source_reference = EXCLUDED.source_reference;

UPDATE pedagogical_topics child
SET active = false,
    source_reference = 'Registro legado substituído pelo catálogo revisado do Referencial Curricular de MS (2012)'
FROM pedagogical_disciplines d, pedagogical_topics parent
WHERE d.id = child.discipline_id AND lower(d.name) = lower('Biologia')
  AND d.stage = 'Ensino Médio' AND parent.id = child.parent_id
  AND parent.discipline_id = d.id AND parent.grade_range = '1ª série'
  AND NOT EXISTS (
    SELECT 1 FROM biology_first_year_catalog c
    WHERE lower(c.parent_name) = lower(parent.name)
      AND lower(c.name) = lower(child.name)
  );

-- A migração original colocou todos os itens numa mesma camada. Inativa os
-- nomes legados que não pertencem ao catálogo de raízes da 1ª série.
UPDATE pedagogical_topics t
SET active = false,
    source_reference = 'Registro legado substituído pelo catálogo revisado do Referencial Curricular de MS (2012)'
FROM pedagogical_disciplines d
WHERE d.id = t.discipline_id AND lower(d.name) = lower('Biologia')
  AND d.stage = 'Ensino Médio' AND t.parent_id IS NULL
  AND t.grade_range IN ('1ª série', '1º ano')
  AND lower(t.name) IN (
    'citologia, histologia, anatomia, taxonomia, embriologia, genética, evolução e ecologia',
    'apresentação da célula', 'composição química da célula', 'membrana plasmática',
    'estruturas celulares', 'forma, função e localização', 'ácidos nucleicos',
    'divisão celular', 'quimiossíntese, fotossíntese, fermentação e respiração',
    'forma, localização, função'
  );

COMMIT;
