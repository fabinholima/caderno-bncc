-- Padroniza todas as variações usadas pelos catálogos importados.
UPDATE pedagogical_topics
SET grade_range = CASE
  WHEN grade_range ~* '(^|[^0-9])1([^0-9]|$)' AND grade_range ~* '(ano|s[ée]rie)' THEN '1ª série'
  WHEN grade_range ~* '(^|[^0-9])2([^0-9]|$)' AND grade_range ~* '(ano|s[ée]rie)' THEN '2ª série'
  WHEN grade_range ~* '(^|[^0-9])3([^0-9]|$)' AND grade_range ~* '(ano|s[ée]rie)' THEN '3ª série'
  ELSE grade_range
END
WHERE grade_range ~* '(ano|s[ée]rie)';
