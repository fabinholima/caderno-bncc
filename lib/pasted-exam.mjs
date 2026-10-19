// Explicit boundaries keep TeX/MetaPost source unchanged and out of structural parsing.
export const CONTEXT_PASTE_MARKER = '% UFA-CONTEXT-PASTE';
export const PASTED_EXAM_EXAMPLE = String.raw`QUESTÃO 1
Calcule a área de um quadrado de lado 3 cm.
(A) 3 cm²
(B) 6 cm²
(C) 9 cm²
(D) 12 cm²
(E) 15 cm²
GABARITO: C
HABILIDADE:
RESOLUÇÃO:
\startformula
A = l^2 = 3^2 = 9
\stopformula
FIM DA QUESTÃO`;

function linesOutsideBlocks(text) {
  const stack = [];
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const outside = stack.length === 0;
      const code = line.replace(/(?<!\\)%.*$/, '');
      for (const match of code.matchAll(/\\(start|stop)([A-Za-z]+)/g)) {
        if (match[1] === 'start') stack.push(match[2]);
        else if (stack.pop() !== match[2])
          throw new Error(
            'Blocos ConTeXt incompatíveis. Confira os comandos start/stop.',
          );
      }
      return { line, outside };
    })
    .concat(
      stack.length
        ? (() => {
            throw new Error(
              'Bloco ConTeXt não finalizado. Confira os comandos start/stop.',
            );
          })()
        : [],
    );
}

export function parseContextQuestion(text) {
  const sections = { statement: [], resolution: [], note: [] };
  const alternatives = {};
  let target = sections.statement;
  let correctAnswers = [];
  let skill;
  for (const { line, outside } of linesOutsideBlocks(text)) {
    const trimmed = line
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*\*(.*?)\*\*\s*(.*)$/, '$1 $2')
      .trim();
    if (outside && /^```(?:context|tex|text|markdown)?\s*$/i.test(trimmed))
      continue;
    if (
      outside &&
      (trimmed === CONTEXT_PASTE_MARKER ||
        /^FIM DA QUEST[ÃA]O\s*$/i.test(trimmed))
    )
      continue;
    const skillMatch =
      outside && trimmed.match(/^HABILIDADE(?: BNCC)?\s*:\s*(.*)$/i);
    if (skillMatch) {
      if (skill !== undefined)
        throw new Error('Campo HABILIDADE repetido na questão.');
      const value = skillMatch[1].trim().toUpperCase();
      skill = value.match(/^(EM13[A-Z]{3}\d{3}|EF\d{2}[A-Z]{2}\d{2,3})(?=\s|$|[—–:;-])/)?.[1] || value;
      if (
        skill &&
        !/^(?:EM13[A-Z]{3}\d{3}|EF\d{2}[A-Z]{2}\d{2,3})$/.test(skill)
      )
        throw new Error(`Código de habilidade BNCC inválido: ${skill}.`);
      continue;
    }
    const answer = outside && trimmed.match(/^GABARITO\s*:\s*(.*)$/i);
    const resolution =
      outside && trimmed.match(/^RESOLU[ÇC][ÃA]O\s*:\s*(.*)$/i);
    const note =
      outside && trimmed.match(/^(?:NOTE E ADOTE|ADOTE)\s*:\s*(.*)$/i);
    if (answer) {
      if (answer[1] && !/^[A-Ea-e](?:\s*[,;]\s*[A-Ea-e])*\s*$/.test(answer[1]))
        throw new Error(
          'Gabarito inválido. Use letras A–E separadas por vírgula.',
        );
      correctAnswers = [
        ...new Set(answer[1].toUpperCase().match(/[A-E]/g) || []),
      ];
      target = [];
      continue;
    }
    if (resolution) {
      target = sections.resolution;
      target.push(resolution[1]);
      continue;
    }
    if (note) {
      target = sections.note;
      target.push(note[1]);
      continue;
    }
    const alt =
      outside &&
      target !== sections.resolution &&
      trimmed.match(/^(?:\(([A-Ea-e])\)|([A-Ea-e])[.)])\s+(.*)$/);
    if (alt) {
      const key = (alt[1] || alt[2]).toUpperCase();
      if (alternatives[key]) throw new Error(`Alternativa ${key} repetida.`);
      target = alternatives[key] = [alt[3]];
      continue;
    }
    target.push(line);
  }
  return {
    statement: sections.statement.join('\n').trim(),
    resolution: sections.resolution.join('\n').trim(),
    adoteNote: sections.note.join('\n').trim(),
    alternatives: Object.fromEntries(
      Object.entries(alternatives).map(([key, value]) => [
        key,
        value.join('\n').trim(),
      ]),
    ),
    correctAnswers,
    skill,
  };
}

export function parsePastedExam(text) {
  if (typeof text !== 'string' || text.length > 1_000_000)
    throw new Error('Cole até 1 milhão de caracteres por lote.');
  const groups = [];
  let current;
  for (const { line, outside } of linesOutsideBlocks(text)) {
    const structural = line
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*\*(.*?)\*\*\s*$/, '$1');
    if (outside && /^```(?:context|tex|text|markdown)?\s*$/i.test(structural))
      continue;
    const marker =
      outside && structural.match(/^\s*QUEST[ÃA]O\s+(\d{1,4})\s*[.):-]?\s*$/i);
    if (marker) {
      current = { sourceNumber: Number(marker[1]), lines: [] };
      groups.push(current);
    } else if (current) current.lines.push(line);
    else if (line.trim())
      throw new Error('Comece o lote com QUESTÃO 1, em uma linha separada.');
  }
  if (!groups.length || groups.length > 100)
    throw new Error('Informe entre 1 e 100 questões por lote.');
  const seen = new Set();
  return groups.map(({ sourceNumber, lines }) => {
    if (seen.has(sourceNumber))
      throw new Error(`Número de questão repetido: ${sourceNumber}.`);
    seen.add(sourceNumber);
    const parsed = parseContextQuestion(lines.join('\n'));
    if (parsed.statement.length < 20)
      throw new Error(
        `Questão ${sourceNumber}: enunciado deve ter ao menos 20 caracteres.`,
      );
    if (parsed.correctAnswers.some((key) => !parsed.alternatives[key]))
      throw new Error(
        `Questão ${sourceNumber}: gabarito aponta para alternativa ausente.`,
      );
    const rawText = [
      CONTEXT_PASTE_MARKER,
      parsed.statement,
      ...Object.entries(parsed.alternatives).map(
        ([key, value]) => `${key}) ${value}`,
      ),
    ].join('\n\n');
    if (
      rawText.length > 30000 ||
      parsed.resolution.length > 20000 ||
      parsed.adoteNote.length > 8000
    )
      throw new Error(
        `Questão ${sourceNumber}: texto excede o limite por campo.`,
      );
    return { ...parsed, sourceNumber, rawText };
  });
}

// Single-question entry uses the same lossless reader as text batches.
export function parseSinglePastedQuestion(text) {
  const source = text.trim();
  const questions = parsePastedExam(/^\s*(?:#{1,6}\s+)?(?:\*\*)?QUEST[ÃA]O\s+\d+/i.test(source)
    ? source : `QUESTÃO 1\n${source}`);
  if (questions.length !== 1)
    throw new Error('Cole apenas uma questão aqui. Para várias questões, use a importação em lote.');
  return questions[0];
}
