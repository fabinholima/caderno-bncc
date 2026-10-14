-- Corrige instituições em que Física foi criada depois da associação inicial.
-- Não remove vínculos existentes nem altera questões já cadastradas.
INSERT INTO pedagogical_discipline_skills
  (discipline_id, skill_id, tagged_by, rationale)
SELECT d.id, s.id, d.created_by,
       'Vínculo BNCC corrigido para Física (área Ciências da Natureza).'
FROM pedagogical_disciplines d
JOIN curriculum_areas a ON a.id=d.area_id
JOIN curriculum_skills s
  ON s.stage='Ensino Médio' AND s.code LIKE 'EM13CNT%'
WHERE d.name='Física'
  AND d.stage='Ensino Médio'
  AND a.source_key='em-area-cnt'
ON CONFLICT (discipline_id, skill_id) DO NOTHING;
