ALTER TABLE pedagogical_topics
  ADD COLUMN IF NOT EXISTS grade_range text;

WITH chemistry AS (
  SELECT id, institution_id
  FROM pedagogical_disciplines
  WHERE name = 'Química' AND stage = 'Ensino Médio'
), catalog(name, grade_range, position) AS (
  VALUES
    ('Introdução à Química', '1ª série', 1),
    ('Estrutura Atômica', '1ª série', 2),
    ('Tabela Periódica', '1ª série', 3),
    ('Ligações Químicas', '1ª série', 4),
    ('Funções Inorgânicas', '1ª série', 5),
    ('Reações Químicas', '1ª série', 6),
    ('Estequiometria', '1ª série', 7),
    ('Gases', '1ª série', 8),
    ('Soluções', '2ª série', 1),
    ('Propriedades Coligativas', '2ª série', 2),
    ('Termoquímica', '2ª série', 3),
    ('Cinética Química', '2ª série', 4),
    ('Equilíbrio Químico', '2ª série', 5),
    ('Eletroquímica', '2ª série', 6),
    ('Química Orgânica', '3ª série', 1),
    ('Polímeros', '3ª série', 2),
    ('Química Ambiental', '3ª série', 3),
    ('Radioatividade', '3ª série', 4)
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, name, grade_range, position)
SELECT chemistry.institution_id, chemistry.id, catalog.name,
       catalog.grade_range, catalog.position
FROM chemistry CROSS JOIN catalog
ON CONFLICT DO NOTHING;

WITH catalog(name, grade_range, position) AS (
  VALUES
    ('Introdução à Química', '1ª série', 1),
    ('Estrutura Atômica', '1ª série', 2),
    ('Tabela Periódica', '1ª série', 3),
    ('Ligações Químicas', '1ª série', 4),
    ('Funções Inorgânicas', '1ª série', 5),
    ('Reações Químicas', '1ª série', 6),
    ('Estequiometria', '1ª série', 7),
    ('Gases', '1ª série', 8),
    ('Soluções', '2ª série', 1),
    ('Propriedades Coligativas', '2ª série', 2),
    ('Termoquímica', '2ª série', 3),
    ('Cinética Química', '2ª série', 4),
    ('Equilíbrio Químico', '2ª série', 5),
    ('Eletroquímica', '2ª série', 6),
    ('Química Orgânica', '3ª série', 1),
    ('Polímeros', '3ª série', 2),
    ('Química Ambiental', '3ª série', 3),
    ('Radioatividade', '3ª série', 4)
)
UPDATE pedagogical_topics topic
SET grade_range = catalog.grade_range, position = catalog.position
FROM pedagogical_disciplines discipline, catalog
WHERE discipline.id = topic.discipline_id
  AND topic.parent_id IS NULL
  AND discipline.name = 'Química'
  AND discipline.stage = 'Ensino Médio'
  AND topic.name = catalog.name;

WITH catalog(parent_name, name, position) AS (
  VALUES
    ('Introdução à Química', 'Matéria, corpo e objeto', 1),
    ('Introdução à Química', 'Propriedades da matéria', 2),
    ('Introdução à Química', 'Substâncias e misturas', 3),
    ('Introdução à Química', 'Separação de misturas', 4),
    ('Estrutura Atômica', 'Modelos atômicos', 1),
    ('Estrutura Atômica', 'Partículas subatômicas', 2),
    ('Estrutura Atômica', 'Distribuição eletrônica', 3),
    ('Estrutura Atômica', 'Íons, isótopos, isóbaros e isótonos', 4),
    ('Tabela Periódica', 'Organização da tabela periódica', 1),
    ('Tabela Periódica', 'Propriedades periódicas', 2),
    ('Tabela Periódica', 'Famílias e períodos', 3),
    ('Ligações Químicas', 'Ligação iônica', 1),
    ('Ligações Químicas', 'Ligação covalente', 2),
    ('Ligações Químicas', 'Ligação metálica', 3),
    ('Ligações Químicas', 'Geometria molecular', 4),
    ('Ligações Químicas', 'Polaridade e forças intermoleculares', 5),
    ('Funções Inorgânicas', 'Ácidos', 1),
    ('Funções Inorgânicas', 'Bases', 2),
    ('Funções Inorgânicas', 'Sais', 3),
    ('Funções Inorgânicas', 'Óxidos', 4),
    ('Funções Inorgânicas', 'Teorias ácido-base', 5),
    ('Reações Químicas', 'Classificação das reações', 1),
    ('Reações Químicas', 'Balanceamento de equações', 2),
    ('Reações Químicas', 'Reações de oxirredução', 3),
    ('Estequiometria', 'Mol e massa molar', 1),
    ('Estequiometria', 'Leis ponderais', 2),
    ('Estequiometria', 'Cálculos estequiométricos', 3),
    ('Estequiometria', 'Reagente limitante e em excesso', 4),
    ('Estequiometria', 'Pureza e rendimento', 5),
    ('Gases', 'Transformações gasosas', 1),
    ('Gases', 'Equação de Clapeyron', 2),
    ('Gases', 'Misturas gasosas', 3),
    ('Soluções', 'Concentração comum e quantidade de matéria', 1),
    ('Soluções', 'Diluição e mistura de soluções', 2),
    ('Soluções', 'Solubilidade', 3),
    ('Soluções', 'Titulação', 4),
    ('Propriedades Coligativas', 'Tonoscopia', 1),
    ('Propriedades Coligativas', 'Ebulioscopia', 2),
    ('Propriedades Coligativas', 'Crioscopia', 3),
    ('Propriedades Coligativas', 'Osmose', 4),
    ('Termoquímica', 'Entalpia de reação', 1),
    ('Termoquímica', 'Lei de Hess', 2),
    ('Termoquímica', 'Entalpia de Formação', 3),
    ('Termoquímica', 'Entalpia de Ligação', 4),
    ('Cinética Química', 'Velocidade das reações', 1),
    ('Cinética Química', 'Energia de ativação', 2),
    ('Cinética Química', 'Fatores que alteram a velocidade', 3),
    ('Cinética Química', 'Lei de velocidade', 4),
    ('Cinética Química', 'Catálise', 5),
    ('Equilíbrio Químico', 'Constantes de equilíbrio', 1),
    ('Equilíbrio Químico', 'Deslocamento do equilíbrio', 2),
    ('Equilíbrio Químico', 'Equilíbrio iônico e pH', 3),
    ('Equilíbrio Químico', 'Hidrólise salina', 4),
    ('Equilíbrio Químico', 'Produto de solubilidade', 5),
    ('Eletroquímica', 'NOX', 1),
    ('Eletroquímica', 'Pilhas', 2),
    ('Eletroquímica', 'Eletrólise', 3),
    ('Eletroquímica', 'Lei de Faraday', 4),
    ('Eletroquímica', 'Corrosão', 5),
    ('Química Orgânica', 'Características do carbono', 1),
    ('Química Orgânica', 'Cadeias carbônicas', 2),
    ('Química Orgânica', 'Funções orgânicas', 3),
    ('Química Orgânica', 'Nomenclatura orgânica', 4),
    ('Química Orgânica', 'Isomeria', 5),
    ('Química Orgânica', 'Reações orgânicas', 6),
    ('Polímeros', 'Polímeros de adição', 1),
    ('Polímeros', 'Polímeros de condensação', 2),
    ('Polímeros', 'Polímeros naturais e sintéticos', 3),
    ('Química Ambiental', 'Química da atmosfera', 1),
    ('Química Ambiental', 'Química da água e do solo', 2),
    ('Química Ambiental', 'Combustíveis e energia', 3),
    ('Química Ambiental', 'Resíduos e química verde', 4),
    ('Radioatividade', 'Emissões radioativas', 1),
    ('Radioatividade', 'Cinética das desintegrações', 2),
    ('Radioatividade', 'Fissão e fusão nuclear', 3),
    ('Radioatividade', 'Aplicações da radioatividade', 4)
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, grade_range, position)
SELECT root.institution_id, root.discipline_id, root.id, catalog.name,
       root.grade_range, catalog.position
FROM pedagogical_topics root
JOIN pedagogical_disciplines discipline ON discipline.id = root.discipline_id
JOIN catalog ON catalog.parent_name = root.name
WHERE root.parent_id IS NULL AND discipline.name = 'Química'
  AND discipline.stage = 'Ensino Médio'
ON CONFLICT DO NOTHING;

WITH catalog(parent_name, name, position) AS (
  VALUES
    ('Funções orgânicas', 'Funções Orgânicas Oxigenadas', 1),
    ('Funções orgânicas', 'Funções Orgânicas Nitrogenadas', 2),
    ('Funções orgânicas', 'Funções Orgânicas Sulfuradas', 3),
    ('Funções orgânicas', 'Funções Orgânicas Mistas', 4),
    ('Isomeria', 'Isomeria plana', 1),
    ('Isomeria', 'Isomeria geométrica', 2),
    ('Isomeria', 'Isomeria óptica', 3)
)
INSERT INTO pedagogical_topics
  (institution_id, discipline_id, parent_id, name, grade_range, position)
SELECT parent.institution_id, parent.discipline_id, parent.id, catalog.name,
       parent.grade_range, catalog.position
FROM pedagogical_topics parent
JOIN pedagogical_disciplines discipline
  ON discipline.id = parent.discipline_id
JOIN pedagogical_topics root ON root.id = parent.parent_id
JOIN catalog ON catalog.parent_name = parent.name
WHERE root.name = 'Química Orgânica'
  AND discipline.name = 'Química'
  AND discipline.stage = 'Ensino Médio'
ON CONFLICT DO NOTHING;

UPDATE pedagogical_topics child
SET grade_range = parent.grade_range
FROM pedagogical_topics parent
WHERE child.parent_id = parent.id AND child.grade_range IS NULL;

COMMENT ON COLUMN pedagogical_topics.grade_range IS
  'Seriação pedagógica institucional; não representa seriação oficial das habilidades da BNCC do Ensino Médio.';
