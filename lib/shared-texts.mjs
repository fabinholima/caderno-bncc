// Texto-base compartilhado: um mesmo texto serve a várias questões seguidas.
// Regras puras usadas pela API (montagem da prova) e pelo renderizador.

/**
 * Agrupa questões em blocos: questões seguidas com o mesmo texto-base formam
 * um bloco; as demais ficam sozinhas. Lança erro se o grupo vier separado.
 * @template {{sharedTextId?: string | null}} T
 * @param {T[]} questions
 * @returns {Array<{sharedTextId: string | null, questions: T[]}>}
 */
export function groupBySharedText(questions) {
  const groups = [];
  const closed = new Set();
  for (const question of questions) {
    const sharedTextId = question.sharedTextId || null;
    const last = groups.at(-1);
    if (sharedTextId && last?.sharedTextId === sharedTextId) {
      last.questions.push(question);
      continue;
    }
    if (last?.sharedTextId) closed.add(last.sharedTextId);
    if (sharedTextId && closed.has(sharedTextId))
      throw Object.assign(
        new Error(
          'As questões de um mesmo texto-base precisam ficar juntas, em sequência, na mesma seção da prova.',
        ),
        { statusCode: 422 },
      );
    groups.push({ sharedTextId, questions: [question] });
  }
  return groups;
}

/**
 * Título do texto-base calculado pela numeração final da prova.
 * @param {number[]} numbers
 * @param {{judgment?: boolean}} [options]
 */
export function sharedTextHeading(numbers, { judgment = false } = {}) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted.at(-1);
  const one = judgment ? 'o item' : 'a questão';
  const many = judgment ? 'os itens' : 'as questões';
  if (sorted.length === 1) return `Texto para ${one} ${first}`;
  const consecutive = sorted.every(
    (number, index) => index === 0 || number === sorted[index - 1] + 1,
  );
  if (sorted.length === 2) return `Texto para ${many} ${first} e ${last}`;
  if (consecutive) return `Texto para ${many} ${first} a ${last}`;
  return `Texto para ${many} ${sorted.slice(0, -1).join(', ')} e ${last}`;
}

/**
 * Embaralha a ordem dos blocos mantendo cada grupo de texto-base unido e na
 * ordem original interna.
 * @template {{sharedTextId?: string | null}} T
 * @param {T[]} questions
 * @param {<U>(items: U[]) => U[]} shuffle
 */
export function shuffleKeepingSharedTexts(questions, shuffle) {
  return shuffle(groupBySharedText(questions)).flatMap(
    (group) => group.questions,
  );
}

/**
 * Ordem da seção após adicionar `id`: os outros itens do mesmo texto-base
 * (`siblings`, já filtrados pelo chamador) entram logo em seguida, e o grupo
 * todo fica junto no fim da lista.
 * @param {string[]} ids
 * @param {string} id
 * @param {string[]} siblings
 * @param {(id: string) => string | null | undefined} sharedTextOf
 */
export function addKeepingSharedTexts(ids, id, siblings, sharedTextOf) {
  const textId = sharedTextOf(id);
  if (!textId) return [...ids, id];
  const group = [
    ...ids.filter((item) => sharedTextOf(item) === textId),
    id,
    ...siblings.filter((item) => item !== id && !ids.includes(item)),
  ];
  return [...ids.filter((item) => sharedTextOf(item) !== textId), ...group];
}

/**
 * Move `id` uma posição (direction -1/+1) sem separar grupos: dentro do grupo
 * troca com o vizinho; fora dele, o bloco inteiro passa sobre o bloco vizinho.
 * @param {string[]} ids
 * @param {string} id
 * @param {number} direction
 * @param {(id: string) => string | null | undefined} sharedTextOf
 */
export function moveKeepingSharedTexts(ids, id, direction, sharedTextOf) {
  const blocks = groupBySharedText(
    ids.map((item) => ({ id: item, sharedTextId: sharedTextOf(item) || null })),
  ).map((block) => block.questions.map((question) => question.id));
  const blockIndex = blocks.findIndex((block) => block.includes(id));
  if (blockIndex < 0) return ids;
  const block = blocks[blockIndex];
  const inner = block.indexOf(id) + direction;
  if (block.length > 1 && inner >= 0 && inner < block.length) {
    const moved = [...block];
    [moved[inner - direction], moved[inner]] = [
      moved[inner],
      moved[inner - direction],
    ];
    blocks[blockIndex] = moved;
    return blocks.flat();
  }
  const target = blockIndex + direction;
  if (target < 0 || target >= blocks.length) return ids;
  [blocks[blockIndex], blocks[target]] = [blocks[target], blocks[blockIndex]];
  return blocks.flat();
}
