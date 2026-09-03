INSERT INTO curriculum_subjects (id, name, stage) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Química', 'Ensino Médio'),
  ('30000000-0000-4000-8000-000000000002', 'Matemática', 'Ensino Fundamental')
ON CONFLICT DO NOTHING;

INSERT INTO knowledge_objects (id, subject_id, name, grade_range, description) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Transformações químicas e conservação da matéria', '1ª série', 'Relações quantitativas e conservação em transformações químicas.'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Estrutura da matéria e propriedades dos materiais', '1ª série', 'Modelos de constituição da matéria e propriedades observáveis.'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'Números inteiros', '7º ano', 'Usos, ordenação e operações com números inteiros.')
ON CONFLICT DO NOTHING;

INSERT INTO curriculum_skills (code, stage, subject, grade_range, description, knowledge_object_id) VALUES
  ('EM13CNT101', 'Ensino Médio', 'Química', '1ª série', 'Analisar transformações e conservações em sistemas que envolvem matéria e energia.', '40000000-0000-4000-8000-000000000001'),
  ('EM13CNT104', 'Ensino Médio', 'Química', '1ª série', 'Avaliar propriedades de materiais com base em modelos explicativos.', '40000000-0000-4000-8000-000000000002')
ON CONFLICT (curriculum_version, code) DO UPDATE SET knowledge_object_id = EXCLUDED.knowledge_object_id;

UPDATE curriculum_skills SET knowledge_object_id = '40000000-0000-4000-8000-000000000003'
WHERE code = 'EF07MA02' AND knowledge_object_id IS NULL;
