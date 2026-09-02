INSERT INTO institutions (id, name, slug) VALUES ('10000000-0000-4000-8000-000000000001', 'Colégio Horizonte', 'colegio-horizonte') ON CONFLICT DO NOTHING;
INSERT INTO users (id, email, display_name) VALUES ('20000000-0000-4000-8000-000000000001', 'professor@caderno.local', 'Professor de demonstração') ON CONFLICT DO NOTHING;
INSERT INTO memberships (institution_id, user_id, role) VALUES ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'teacher') ON CONFLICT DO NOTHING;
INSERT INTO curriculum_skills (code, stage, subject, grade_range, description) VALUES
  ('EF07MA02', 'Ensino Fundamental', 'Matemática', '7º ano', 'Resolver e elaborar problemas que envolvam porcentagens.'),
  ('EF89LP05', 'Ensino Fundamental', 'Língua Portuguesa', '8º e 9º anos', 'Analisar efeitos de sentido decorrentes do uso de mecanismos de intertextualidade.'),
  ('EF06CI04', 'Ensino Fundamental', 'Ciências', '6º ano', 'Associar a produção de medicamentos e outros materiais ao desenvolvimento científico.'),
  ('EF09HI05', 'Ensino Fundamental', 'História', '9º ano', 'Identificar processos da urbanização e modernização da sociedade brasileira.')
ON CONFLICT DO NOTHING;
