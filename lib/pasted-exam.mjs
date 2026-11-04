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
DISCIPLINA:
SÉRIE:
TÓPICO:
SUBTÓPICO:
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

// Normalize Markdown wrappers only to recognize structural lines. Original
// content lines remain unchanged when added to the question body.
function markdownStructure(line) {
  return line
    .trim()
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/^\*\*(.*?)\*\*\s*$/, '$1')
    .replace(/^\*\*(.*?)\*\*\s+/, '$1 ')
    .trim();
}

const CLASSIFICATION_FIELDS = {
  DISCIPLINA: 'discipline',
  SERIE: 'grade',
  TOPICO: 'topic',
  SUBTOPICO: 'subtopic',
  DETALHAMENTO: 'detail',
};

// Accepts "2ª série", "2º ano", "2a serie" or "2"; the catalog stores "2ª série".
export function normalizePastedGrade(value) {
  const match = value.match(/^([123])\s*[ºª°oa]?\s*(?:ano|s[ée]rie)?$/i);
  if (!match)
    throw new Error(`Série inválida: ${value}. Use 1ª, 2ª ou 3ª série.`);
  return `${match[1]}ª série`;
}

export function parseContextQuestion(text) {
  const sections = { statement: [], resolution: [], note: [] };
  const alternatives = {};
  let target = sections.statement;
  let correctAnswers = [];
  let skill;
  const classification = {};
  for (const { line, outside } of linesOutsideBlocks(text)) {
    const trimmed = markdownStructure(line);
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
      skill =
        value.match(
          /^(EM13[A-Z]{3}\d{3}|EF\d{2}[A-Z]{2}\d{2,3})(?=\s|$|[—–:;-])/,
        )?.[1] || value;
      if (
        skill &&
        !/^(?:EM13[A-Z]{3}\d{3}|EF\d{2}[A-Z]{2}\d{2,3})$/.test(skill)
      )
        throw new Error(`Código de habilidade BNCC inválido: ${skill}.`);
      continue;
    }
    const classificationMatch =
      outside &&
      trimmed.match(
        /^(DISCIPLINA|S[ÉE]RIE|T[ÓO]PICO|SUBT[ÓO]PICO|DETALHAMENTO)\s*:\s*(.*)$/i,
      );
    if (classificationMatch) {
      const label = classificationMatch[1]
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toUpperCase();
      const field = CLASSIFICATION_FIELDS[label];
      if (classification[field] !== undefined)
        throw new Error(
          `Campo ${classificationMatch[1].toUpperCase()} repetido na questão.`,
        );
      const value = classificationMatch[2].trim();
      if (value.length > 120)
        throw new Error(
          `Campo ${classificationMatch[1].toUpperCase()} excede 120 caracteres.`,
        );
      classification[field] =
        field === 'grade' && value ? normalizePastedGrade(value) : value;
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
    ...Object.fromEntries(
      Object.entries(classification).filter(([, value]) => value),
    ),
  };
}

function parseNumberedTrueFalseMarkdown(text) {
  const lines = linesOutsideBlocks(text);
  const questionLines = [];
  const answers = new Map();
  const resolutions = new Map();
  let section = 'questions';
  let currentResolution;

  const addAnswer = (number, answer) => {
    const normalized = answer.trim().toUpperCase();
    if (!['C', 'E'].includes(normalized))
      throw new Error(`Gabarito da questão ${number} deve ser C ou E.`);
    if (answers.has(number))
      throw new Error(`Gabarito repetido para a questão ${number}.`);
    answers.set(number, normalized);
  };

  for (const { line, outside } of lines) {
    const structural = outside ? markdownStructure(line) : line.trim();
    if (outside && /^```(?:markdown|text)?\s*$/i.test(structural)) continue;
    if (outside && /^GABARITO\s*$/i.test(structural)) {
      section = 'answers';
      currentResolution = undefined;
      continue;
    }
    if (outside && /^COMENT[ÁA]RIOS\s*$/i.test(structural)) {
      section = 'resolutions';
      currentResolution = undefined;
      continue;
    }
    if (section === 'questions') {
      if (
        outside &&
        /^(?:BLOCO\s+\d+\s*:|TEMAS\s*:|N[IÍ]VEL\s+DE\s+DIFICULDADE\s*:|INSTRU[ÇC][ÕO]ES\s*:|JULGUE\b)/i.test(
          structural,
        )
      )
        continue;
      const question =
        outside && structural.match(/^(?:\*\*)?(\d{1,3})\.(?:\*\*)?\s*(.*)$/);
      if (question) {
        questionLines.push({
          number: Number(question[1]),
          lines: question[2] ? [question[2]] : [],
        });
      } else if (questionLines.length) questionLines.at(-1).lines.push(line);
      else if (line.trim() && !line.trim().startsWith('#')) continue;
      continue;
    }
    if (section === 'answers') {
      if (!outside) continue;
      const cells = structural
        .match(/^\|(.+)\|$/)?.[1]
        .split('|')
        .map((cell) => cell.trim());
      if (!cells || cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      for (let index = 0; index + 1 < cells.length; index += 2) {
        if (/^\d{1,3}$/.test(cells[index]) && /^[CE]$/i.test(cells[index + 1]))
          addAnswer(Number(cells[index]), cells[index + 1]);
      }
      const answerLine = structural.match(/^(\d{1,3})\s*[-.)|:]\s*([CE])$/i);
      if (answerLine) addAnswer(Number(answerLine[1]), answerLine[2]);
      continue;
    }
    if (section === 'resolutions') {
      if (outside) {
        const heading = structural.match(
          /^(?:\*\*)?(\d{1,3})\.\s*(?:CERTO|ERRADO)\.(?:\*\*)?\s*(.*)$/i,
        );
        if (heading) {
          currentResolution = Number(heading[1]);
          if (resolutions.has(currentResolution))
            throw new Error(
              `Comentário repetido para a questão ${currentResolution}.`,
            );
          resolutions.set(currentResolution, heading[2] ? [heading[2]] : []);
          continue;
        }
      }
      if (currentResolution !== undefined)
        resolutions.get(currentResolution).push(line);
    }
  }

  if (!questionLines.length) return null;
  const numbers = new Set();
  for (const question of questionLines) {
    if (numbers.has(question.number))
      throw new Error(`Número de questão repetido: ${question.number}.`);
    numbers.add(question.number);
    if (!answers.has(question.number))
      throw new Error(`Gabarito ausente para a questão ${question.number}.`);
    if (!resolutions.has(question.number))
      throw new Error(`Comentário ausente para a questão ${question.number}.`);
  }
  for (const number of answers.keys())
    if (!numbers.has(number))
      throw new Error(
        `Gabarito da questão ${number} não corresponde a um item numerado.`,
      );
  for (const number of resolutions.keys())
    if (!numbers.has(number))
      throw new Error(
        `Comentário da questão ${number} não corresponde a um item numerado.`,
      );

  return questionLines.map(({ number, lines: body }) => {
    const statement = body.join('\n').trim();
    if (statement.length < 20)
      throw new Error(
        `Questão ${number}: enunciado deve ter ao menos 20 caracteres.`,
      );
    const correctAnswers = [answers.get(number) === 'C' ? 'A' : 'B'];
    const alternatives = { A: 'Certo', B: 'Errado' };
    const resolution = (resolutions.get(number) || []).join('\n').trim();
    const rawText = [CONTEXT_PASTE_MARKER, statement].join('\n\n');
    if (rawText.length > 30000 || resolution.length > 20000)
      throw new Error(`Questão ${number}: texto excede o limite por campo.`);
    return {
      sourceNumber: number,
      statement,
      alternatives,
      correctAnswers,
      resolution,
      adoteNote: '',
      rawText,
    };
  });
}

export function parsePastedExam(text) {
  if (typeof text !== 'string' || text.length > 1_000_000)
    throw new Error('Cole até 1 milhão de caracteres por lote.');
  const numberedTrueFalse = parseNumberedTrueFalseMarkdown(text);
  if (numberedTrueFalse) {
    if (numberedTrueFalse.length > 100)
      throw new Error('Informe entre 1 e 100 questões por lote.');
    return numberedTrueFalse;
  }
  const groups = [];
  let current;
  for (const { line, outside } of linesOutsideBlocks(text)) {
    const structural = markdownStructure(line);
    if (outside && /^```(?:context|tex|text|markdown)?\s*$/i.test(structural))
      continue;
    const marker =
      outside &&
      structural.match(/^QUEST[ÃA]O\s+(\d{1,4})(?:\s*(?:[.):—–-]\s*)?.*)?$/i);
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
    if (parsed.subtopic && !parsed.topic)
      throw new Error(
        `Questão ${sourceNumber}: informe o TÓPICO antes do SUBTÓPICO.`,
      );
    if (parsed.detail && !parsed.subtopic)
      throw new Error(
        `Questão ${sourceNumber}: informe o SUBTÓPICO antes do DETALHAMENTO.`,
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
  const questions = parsePastedExam(
    /^\s*(?:#{1,6}\s+)?(?:\*\*)?QUEST[ÃA]O\s+\d+/i.test(source)
      ? source
      : `QUESTÃO 1\n${source}`,
  );
  if (questions.length !== 1)
    throw new Error(
      'Cole apenas uma questão aqui. Para várias questões, use a importação em lote.',
    );
  return questions[0];
}
