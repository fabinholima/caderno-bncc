// Detecção de texto-base sem IA, para PDFs com texto selecionável.
// Procura cabeçalhos como "Texto para as questões 06 a 10" ou "Texto para os
// itens 1 a 5", recorta o texto entre o cabeçalho e a primeira questão do
// intervalo e marca a primeira questão como dona do texto-base. As demais do
// intervalo são ligadas depois por examSharedTextGroups (lib/exam-shared-texts).

const HEADING =
  /(?:^|\n)[ \t]*(?:\(?\s*)?(?:Texto|Textos|Leia o texto|Leia os textos)[^\n]{0,60}?\b(?:para|referente\s+[àa]s?|para\s+responder\s+[àa]s?)\s+(?:a|as|o|os|à|às)?\s*(quest(?:ões|oes|ão|ao)|itens|item)\s+(\d{1,3})\s*(?:a|e|até|-|–|—)\s*(\d{1,3})[^\n]*/gi;

const MAX_GROUP = 60;

// O texto vem puro do PDF, mas o texto-base é guardado como ConTeXt.
const escapePlainText = (value) =>
  value
    .replace(/\\/g, '/')
    .replace(/[{}]/g, '')
    .replace(/([%$&#_])/g, '\\$1')
    .replace(/[~^]/g, '');
const MAX_CONTENT = 30_000;

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Margem esquerda da coluna da direita, ou null para coluna única. Um vão é
 * uma faixa no terço central da área de texto que quase nenhuma palavra
 * atravessa; ele só separa colunas se as linhas do lado direito começarem
 * alinhadas (margem da coluna). Em coluna única com linhas curtas, as
 * palavras à direita são continuação de linha e ficam espalhadas.
 * @param {Array<{xMin: number, xMax: number, yMin?: number}>} words
 * @returns {number | null}
 */
export function columnSplit(words) {
  if (words.length < 20) return null;
  const left = Math.min(...words.map((word) => word.xMin));
  const right = Math.max(...words.map((word) => word.xMax));
  const width = right - left;
  const limit = Math.max(2, words.length * 0.01);
  let best = null;
  for (let x = left + width / 3; x <= right - width / 3; x += 2) {
    const crossing = words.filter(
      (word) => word.xMin < x - 1 && word.xMax > x + 1,
    ).length;
    if (crossing > limit) continue;
    // Primeira palavra à direita do vão em cada linha.
    const starts = new Map();
    for (const word of words) {
      if (word.xMin < x) continue;
      const line = Math.round((word.yMin ?? 0) / 3);
      if (!starts.has(line) || word.xMin < starts.get(line))
        starts.set(line, word.xMin);
    }
    if (starts.size < 5) continue;
    const edge = Math.min(...starts.values());
    const aligned = [...starts.values()].filter(
      (start) => start - edge <= 4,
    ).length;
    const leftWords = words.filter((word) => word.xMax <= x).length;
    if (aligned < Math.max(5, starts.size * 0.6) || leftWords < 10) continue;
    if (!best || aligned > best.aligned) best = { edge, aligned };
  }
  return best ? best.edge - 1 : null;
}

/**
 * Página em coluna única (sem vão entre colunas). Com poucas palavras não
 * há como decidir: responde false e mantém a leitura por marcadores.
 */
export function pageIsSingleColumn(words) {
  return words.length >= 20 && columnSplit(words) === null;
}

/**
 * Texto da prova na ordem de leitura, a partir do XML de `pdftotext
 * -bbox-layout`. Páginas em duas colunas são lidas coluna a coluna
 * (esquerda inteira, depois direita); as demais, linha a linha.
 * @param {string} xml
 */
export function readingTextFromBbox(xml) {
  const pages = [];
  for (const pageMatch of String(xml).matchAll(
    /<page\b[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g,
  )) {
    const words = [
      ...pageMatch[3].matchAll(
        /<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g,
      ),
    ].map((match) => ({
      xMin: Number(match[1]),
      yMin: Number(match[2]),
      xMax: Number(match[3]),
      text: decodeXmlText(match[5].replace(/<[^>]+>/g, '')).trim(),
    }));
    const split = columnSplit(words);
    const groups =
      split === null
        ? [words]
        : [
            words.filter((word) => word.xMin < split),
            words.filter((word) => word.xMin >= split),
          ];
    const lines = [];
    for (const group of groups) {
      let current = null;
      for (const word of [...group].sort(
        (a, b) => a.yMin - b.yMin || a.xMin - b.xMin,
      )) {
        if (!current || Math.abs(current.y - word.yMin) > 3) {
          current = { y: word.yMin, words: [] };
          lines.push(current);
        }
        current.words.push(word);
      }
    }
    pages.push(
      lines
        .map((line) =>
          line.words
            .sort((a, b) => a.xMin - b.xMin)
            .map((word) => word.text)
            .join(' '),
        )
        .join('\n'),
    );
  }
  return pages.join('\n');
}

// Linhas numeradas como no ENEM: a maioria começa por um número que cresce.
function stripLineNumbers(lines) {
  const numbered = lines.map((line) => line.match(/^(\d{1,3})\s+(\S.*)$/));
  const values = numbered.filter(Boolean).map((match) => Number(match[1]));
  const increasing = values.every(
    (value, index) => index === 0 || value > values[index - 1],
  );
  const textLines = lines.filter((line) => line.trim()).length;
  if (values.length < 3 || !increasing || values.length < textLines * 0.6)
    return null;
  const first = numbered.findIndex(Boolean);
  return {
    before: lines.slice(0, first).filter((line) => line.trim()),
    lines: lines
      .slice(first)
      .map((line, index) => numbered[first + index]?.[2] ?? line),
  };
}

/**
 * Encontra os textos-base no texto em ordem de leitura.
 * @param {string} text
 * @returns {Array<{start: number, heading: string, sourceNumbers: number[], title: string, content: string, keepLineBreaks: boolean, lineNumbering: boolean}>}
 */
export function detectSharedTexts(text) {
  const source = String(text || '').replace(/\r/g, '');
  const found = [];
  for (const match of source.matchAll(HEADING)) {
    const first = Number(match[2]);
    const last = Number(match[3]);
    if (!(first > 0) || last < first || last - first + 1 > MAX_GROUP) continue;
    const headingStart = (match.index || 0) + match[0].indexOf(match[0].trim());
    const bodyStart = (match.index || 0) + match[0].length;
    const rest = source.slice(bodyStart);
    // O texto termina onde começa a primeira questão do intervalo.
    const padded = `0*${first}`;
    const explicit = new RegExp(
      `(?:^|\\n)[ \\t]*QUEST(?:ÃO|AO)\\s*${padded}\\b`,
      'i',
    ).exec(rest);
    const numeric = new RegExp(`(?:^|\\n)[ \\t]*${padded}\\s*[.)]`).exec(rest);
    const end = explicit || numeric;
    if (!end) continue;
    const raw = rest.slice(0, end.index).trim();
    if (raw.length < 20 || raw.length > MAX_CONTENT) continue;
    let lines = raw.split('\n').map((line) => line.trimEnd());
    let title = '';
    const numbered = stripLineNumbers(lines);
    if (numbered) {
      // Linhas antes da numeração (título e linha fina) viram o título.
      title = numbered.before.join(' — ').slice(0, 300);
      lines = numbered.lines;
    } else if (
      lines.length > 2 &&
      lines[0].length <= 80 &&
      !/[.:;,]$/.test(lines[0])
    ) {
      title = lines[0].trim();
      lines = lines.slice(1);
    }
    found.push({
      start: headingStart,
      heading: match[0].trim(),
      sourceNumbers: Array.from(
        { length: last - first + 1 },
        (_, index) => first + index,
      ),
      title,
      content: escapePlainText(
        numbered
          ? lines.join('\n').trim()
          : // Sem numeração, as quebras do PDF vêm só da largura: une parágrafos.
            lines
              .join('\n')
              .replace(/([^\n])\n(?!\n)/g, '$1 ')
              .trim(),
      ),
      keepLineBreaks: Boolean(numbered),
      lineNumbering: Boolean(numbered),
    });
  }
  return found;
}

/**
 * Aplica as detecções aos candidatos: tira o cabeçalho e o texto do fim da
 * questão anterior (onde a extração por regiões costuma colá-los) e marca a
 * primeira questão do intervalo com `sharedText`. Candidatos que já têm
 * texto-base (da IA) não são alterados.
 */
export function applyDetectedSharedTexts(candidates, detections) {
  if (!detections.length) return candidates;
  const owners = new Map();
  for (const detection of detections) {
    // Dono: a primeira questão do intervalo que a extração encontrou.
    const owner = detection.sourceNumbers
      .map((number) =>
        candidates.find((candidate) => candidate.sourceNumber === number),
      )
      .find(Boolean);
    if (owner && !owner.sharedText && !owners.has(owner.id))
      owners.set(owner.id, detection);
  }
  return candidates.map((candidate) => {
    let rawText = candidate.rawText;
    for (const detection of detections) {
      // Pelo padrão, não pela frase exata: o OCR pode ler o cabeçalho com
      // pequenas diferenças de espaço, pontuação e zeros à esquerda.
      const first = detection.sourceNumbers[0];
      const last = detection.sourceNumbers.at(-1);
      const index = rawText.search(
        new RegExp(
          `(?:Texto|Textos|Leia)[\\s\\S]{0,60}?(?:quest|ite)\\S*\\s+0*${first}\\s*(?:a|e|até|-|–|—)\\s*0*${last}\\b`,
          'i',
        ),
      );
      // Só corta se sobrar a questão em si.
      if (index > 0 && rawText.slice(0, index).trim().length >= 40)
        rawText = rawText.slice(0, index).trimEnd();
    }
    const detection = owners.get(candidate.id);
    return {
      ...candidate,
      rawText,
      ...(detection
        ? {
            sharedText: {
              title: detection.title,
              source: '',
              content: detection.content,
              sourceNumbers: detection.sourceNumbers,
              keepLineBreaks: detection.keepLineBreaks,
              lineNumbering: detection.lineNumbering,
            },
            sharedTextDetection: 'text',
          }
        : {}),
    };
  });
}
