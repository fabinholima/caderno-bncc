-- A instituição proprietária do portal é a própria UFA Prova.
UPDATE institutions
SET name = 'UFA Prova', slug = 'ufa-prova'
WHERE slug = 'colegio-horizonte' OR name = 'Colégio Horizonte';
