// Tema de cada questão da prova (tópico > subtópico > detalhamento), a partir da árvore
// de pedagogical_topics. Usado para orientar a IA a criar questões sobre o mesmo conteúdo.

/**
 * @param {{ query: Function }} db  pool ou cliente
 * @param {string[]} questionIds    ids das questões do banco (sourceQuestionId)
 * @returns {Promise<Map<string, string>>} questionId -> "Raiz > Filho > Neto"
 */
export async function temasPorQuestao(db, questionIds) {
  const ids = [...new Set(questionIds.filter(Boolean))];
  const temas = new Map();
  if (!ids.length) return temas;
  const questoes = await db.query(
    'SELECT id, pedagogical_topic_id FROM questions WHERE id = ANY($1::uuid[]) AND pedagogical_topic_id IS NOT NULL',
    [ids],
  );
  const caminhoPorTopico = new Map();
  for (const linha of questoes.rows) {
    const topicoId = linha.pedagogical_topic_id;
    if (!caminhoPorTopico.has(topicoId)) {
      const caminho = await db.query(
        `WITH RECURSIVE caminho AS (
           SELECT id, name, parent_id, 1 AS profundidade FROM pedagogical_topics WHERE id = $1
           UNION ALL
           SELECT p.id, p.name, p.parent_id, c.profundidade + 1
           FROM pedagogical_topics p JOIN caminho c ON p.id = c.parent_id
         )
         SELECT name FROM caminho ORDER BY profundidade DESC`,
        [topicoId],
      );
      caminhoPorTopico.set(
        topicoId,
        caminho.rows.map((r) => r.name).join(' > '),
      );
    }
    temas.set(linha.id, caminhoPorTopico.get(topicoId));
  }
  return temas;
}
