// Texto-base detectado pela IA na importação de provas (itens Certo/Errado).
// A IA devolve, no item que traz o texto, `sharedText` com o conteúdo e os
// números dos itens que ele atende ("Texto para os itens 1 a 5"). Aqui as
// definições repetidas (lotes que se sobrepõem) são unidas e cada item C/E do
// intervalo recebe o grupo, mesmo que o texto não esteja no rawText dele.

/**
 * @typedef {{title?: string, source?: string, content?: string, sourceNumbers?: number[]}} SharedTextDraft
 * @typedef {{key: string, title: string, source: string, content: string, sourceNumbers: number[], sharedTextId: string | null, candidateIds: string[]}} ExamSharedTextGroup
 */

const MAX_GROUP_ITEMS = 60;

/** Normaliza a definição devolvida pela IA; conteúdo vazio = sem texto-base. */
export function normalizeSharedTextDraft(value, ownNumber) {
  const content = String(value?.content || '').trim();
  if (!content) return null;
  const numbers = [
    ...new Set(
      [...(value?.sourceNumbers || []), ownNumber]
        .map(Number)
        .filter((number) => Number.isInteger(number) && number > 0),
    ),
  ].sort((a, b) => a - b);
  // Um intervalo absurdo ("itens 1 a 999") não pode capturar a prova toda.
  if (numbers.length > MAX_GROUP_ITEMS) return null;
  return {
    title: String(value?.title || '')
      .trim()
      .slice(0, 300),
    source: String(value?.source || '')
      .trim()
      .slice(0, 500),
    content: content.slice(0, 30_000),
    sourceNumbers: numbers,
  };
}

const contentKey = (content) =>
  content
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase()
    .slice(0, 160);

/**
 * @param {Array<{id: string, sourceNumber: number, questionType?: string, status?: string, sharedText?: SharedTextDraft | null, sharedTextId?: string | null}>} candidates
 * @returns {{groups: ExamSharedTextGroup[], byCandidate: Map<string, ExamSharedTextGroup>}}
 */
export function examSharedTextGroups(candidates) {
  const judgment = candidates.filter(
    (candidate) =>
      candidate.questionType === 'true_false' && candidate.status !== 'ignored',
  );
  /** @type {Array<ExamSharedTextGroup & {contentKeys: Set<string>}>} */
  const groups = [];
  for (const candidate of judgment) {
    const draft = normalizeSharedTextDraft(
      candidate.sharedText,
      candidate.sourceNumber,
    );
    if (!draft) continue;
    const key = contentKey(draft.content);
    const matches = groups.filter(
      (group) =>
        group.contentKeys.has(key) ||
        draft.sourceNumbers.some((number) =>
          group.sourceNumbers.includes(number),
        ),
    );
    const merged = matches[0] || {
      key: '',
      title: '',
      source: '',
      content: '',
      sourceNumbers: [],
      sharedTextId: null,
      candidateIds: [],
      contentKeys: new Set(),
    };
    for (const other of matches.slice(1)) {
      merged.sourceNumbers.push(...other.sourceNumbers);
      other.contentKeys.forEach((item) => merged.contentKeys.add(item));
      // A versão mais completa (lotes vizinhos podem cortar o texto) prevalece.
      if (other.content.length > merged.content.length)
        Object.assign(merged, {
          title: other.title,
          source: other.source,
          content: other.content,
        });
      groups.splice(groups.indexOf(other), 1);
    }
    merged.sourceNumbers = [
      ...new Set([...merged.sourceNumbers, ...draft.sourceNumbers]),
    ].sort((a, b) => a - b);
    merged.contentKeys.add(key);
    if (draft.content.length > merged.content.length)
      Object.assign(merged, {
        title: draft.title || merged.title,
        source: draft.source || merged.source,
        content: draft.content,
      });
    if (!matches.length) groups.push(merged);
  }
  const byCandidate = new Map();
  for (const group of groups) {
    group.key = `texto-${group.sourceNumbers[0]}-${group.sourceNumbers.at(-1)}`;
    for (const candidate of judgment) {
      if (!group.sourceNumbers.includes(candidate.sourceNumber)) continue;
      // Um item pertence a um só texto: o primeiro grupo que o reivindicou.
      if (byCandidate.has(candidate.id)) continue;
      group.candidateIds.push(candidate.id);
      group.sharedTextId ||= candidate.sharedTextId || null;
      byCandidate.set(candidate.id, group);
    }
    delete group.contentKeys;
  }
  return {
    groups: groups.filter((group) => group.candidateIds.length),
    byCandidate,
  };
}
