// Folhas de redação em ConTeXt. As páginas fixas (folha pautada e mapa de
// critérios) reproduzem a geometria de Folha-de-redacao-para-imprimir.pdf:
// todas as coordenadas abaixo estão em pontos PDF (bp), medidas no original,
// com origem no canto inferior esquerdo de uma página A4 (595,276 × 841,89).
// Textos são texto real e linhas/retângulos são vetoriais (MetaPost).
import { escapeContext } from './render-contract.mjs';

export const ESSAY_SHEET_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'enem-30-v1',
    label: 'Folha ENEM — 30 linhas',
    description:
      'Reprodução do modelo de referência: cabeçalho de identificação, informações e 30 linhas numeradas.',
  }),
  Object.freeze({
    id: 'linhas-do-tema-v1',
    label: 'Folha com o limite de linhas do tema',
    description:
      'Mesmo layout, com a quantidade máxima de linhas definida no tema; acima de 30 linhas, continua na página seguinte.',
  }),
]);
export const ESSAY_SHEET_TEMPLATE_IDS = Object.freeze(
  ESSAY_SHEET_TEMPLATES.map((template) => template.id),
);

// Mapa de critérios da página 2 da referência. Texto mantido como no
// original (inclusive a pontuação de cada faixa); não alterar sem solicitação.
export const ENEM_CRITERIA = Object.freeze([
  {
    numeral: 'I',
    competency: 'Demonstrar domínio da norma padrão da língua escrita.',
    levels: [
      '0 – Texto com sérios problemas na articulação dos argumentos, em decorrência do desconhecimento da estrutura sintática, da pontuação, das convenções ortográficas e do registro adequado ao gênero.',
      '40 – Acima de 10 desvios ou 5 falhas',
      '80 – Até 10 desvios ou 4 falhas',
      '120– Até 8 desvios ou 3 falhas',
      '160 -Até 5 desvios ou 2 falhas',
      '200 – Até 2 desvios ou 1 falha',
    ],
  },
  {
    numeral: 'II',
    competency:
      'Compreender a proposta de redação e aplicar conceitos de várias áreas de conhecimento para desenvolver o tema, em um texto dissertativo-argumentativo.',
    levels: [
      '40 – A abordagem tangencial e/ou domínio precário da estrutura do tipo dissertativo-argumentativo, havendo alternância de tipos textuais.',
      '80 – Uso de informações semelhantes às já reveladas nos textos motivadores, com argumentação falha ou insuficiente, além de problemas na estrutura do tipo textual, e/ou ausência de uma de suas partes.',
      '120 – Argumentação superficial e/ou previsível, havendo mais informações do que argumentos; tese implícita.',
      '160 – Há argumentação consistente e bom domínio do tipo textual, com tese, argumentação e solução, mas o repertório sociocultural não é muito produtivo.',
      '200 – Há argumentação consistente e o repertório sociocultural é produtivo. Desenvolve muito bem o tipo textual dissertativo-argumentativo.',
    ],
  },
  {
    numeral: 'III',
    competency:
      'Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista.',
    levels: [
      '0 – Apresenta informações, fatos, opiniões e argumentos não relacionados ao tema (tangenciamento) ou não apresenta ponto de vista. 40 – Apresenta informações, fatos, opiniões e argumentos pouco relacionados ao tema sem defender ponto de vista.',
      '80 – Elementos pouco relacionados e/ou contraditórios com o ponto de vista e/ou paráfrase dos textos motivadores da prova de redação.',
      '120– Argumentos pertinentes ao tema, porém ainda limitados aos textos motivadores e pouco consistentes em defesa do ponto de vista.',
      '160 – Relação consistente dos elementos com o ponto de vista e com o tema, com indícios de autoria e argumentos não constantes dos textos motivadores.',
      '200 – Presença de argumentação consistente e totalmente de acordo com o ponto de vista e com o tema proposto configurando autoria',
    ],
  },
  {
    numeral: 'IV',
    competency:
      'Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação.',
    levels: [
      '0 – Informações desconexas, que não configuram um texto.',
      '40 – Articulação precária, sem os elementos necessários ou adequados à sinalização das relações entre as informações (a partir de 7 desvios).',
      '80 – Muitas inadequações e uso limitado de recursos coesivos (5 ou 6 desvios).',
      '120 – Algumas inadequações e pouca diversidade na utilização de recursos coesivos (3 ou 4 desvios).',
      '160 – Poucas inadequações e diversificação na utilização de recursos coesivos (de 1 a 2 desvios).',
      '200 – Sem inadequações e com diversificação na utilização de recursos coesivos (não há desvios).',
    ],
  },
  {
    numeral: 'V',
    competency:
      'Elaborar proposta de solução para o problema abordado, respeitando os valores humanos e considerando a diversidade sociocultural.',
    levels: [
      '0 – Texto sem proposta de solução ou com proposta não relacionada ao tema ou proposta de intervenção que desrespeita os Direitos Humanos.',
      '40 – A proposta se relaciona apenas ao assunto, é vaga ou está subentendida e/ou menção a apenas 1 elemento.',
      '80 – A proposta é insuficiente (agente implícito) ou não é articulada com a problemática desenvolvida no texto e/ou menção a 2 elementos.',
      '120 – A proposta é mediana e apresenta pouca articulação com a problemática desenvolvida no texto e/ou menção a 3 elementos.',
      '160 – A proposta é detalhada (menciona, no mínimo, 2 agentes; é clara e viável), além de bem relacionada ao tema e à problemática desenvolvida no texto e/ou menção a 4 elementos.',
      '200 – A proposta é muito bem detalhada (menciona, no mínimo, 2 agentes; é clara e viável, além de bem relacionada ao tema e à problemática desenvolvida no texto e/ou menção aos 5 elementos.',
    ],
  },
]);

export const ENEM_INSTRUCTIONS = Object.freeze([
  'Preencha o cabeçalho de forma legível e completa.',
  'Utilize somente canetas de tinta azul ou preta.',
  'Não use corretivo; destaque seus erros.',
]);

// Geometria da referência (bp).
const PAGE = { width: 595.276, height: 841.89 };
const ROW = {
  top: 596.1346,
  height: 17.9668,
  left: 28.9031,
  numberRight: 51.0803,
  right: 566.3724,
};
const CRITERIA_ROWS = [
  770.333, 755.5835, 663.3071, 505.9843, 360, 223.937, 56.9095,
];
export const ROWS_PER_FIRST_PAGE = 30;
const CONTINUATION_TOP = 760;
export const ROWS_PER_CONTINUATION_PAGE = Math.floor(
  (CONTINUATION_TOP - 57.1303) / ROW.height,
);

const romanNumerals = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
];

/** Texto seguro para ConTeXt, sem caracteres de controle. */
export function contextText(value = '') {
  return escapeContext(
    String(value)
      .normalize('NFC')
      // oxlint-disable-next-line no-control-regex -- remove control characters before typesetting.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .replace(/\t/g, ' '),
  )
    .replace(/"/g, '\\letterdoublequote ')
    .replace(/\|/g, '\\letterbar ');
}

/** Negrito com **texto** e itálico com *texto*, depois do escape. */
export function inlineMarkup(value = '') {
  return contextText(value)
    .replace(/\*\*(?=\S)([^*]+?)\*\*/g, '{\\bf $1}')
    .replace(/\*(?=\S)([^*]+?)\*/g, '{\\it $1}');
}

function breakableUrl(value = '') {
  return contextText(value).replace(/([/.\-?=&])/g, '$1\\discretionary{}{}{}');
}

const mpNumber = (value) => Number(value).toFixed(4);
const mpColor = (color) =>
  ['white', 'black'].includes(color) ? color : `\\MPcolor{${color}}`;
const mpString = (tex) => `"${tex.replace(/"/g, '')}"`;

// Texto com a linha de base em (x, y); align: left, center ou right.
function mpLabel(tex, x, y, align = 'left') {
  const picture = `rawtextext(${mpString(tex)})`;
  if (align === 'left')
    return `draw ${picture} shifted (${mpNumber(x)}, ${mpNumber(y)});`;
  const factor = align === 'center' ? 0.5 : 1;
  return `p := ${picture}; draw p shifted (${mpNumber(x)} - ${factor} * (xpart urcorner p - xpart llcorner p), ${mpNumber(y)});`;
}

function mpRect(x, y, width, height, color = 'essaynavy') {
  return `fill unitsquare xscaled ${mpNumber(width)} yscaled ${mpNumber(height)} shifted (${mpNumber(x)}, ${mpNumber(y)}) withcolor ${mpColor(color)};`;
}

function mpLine(x1, y1, x2, y2, width, color = 'black') {
  return `draw (${mpNumber(x1)}, ${mpNumber(y1)}) -- (${mpNumber(x2)}, ${mpNumber(y2)}) withpen pencircle scaled ${width} withcolor ${mpColor(color)};`;
}

// Livro aberto vetorial (substitui o ícone em imagem do original).
function mpBook(x, y, size, color = 'white') {
  const s = size / 34;
  color = mpColor(color);
  const point = (px, py) =>
    `(${mpNumber(x + px * s)}, ${mpNumber(y + py * s)})`;
  return [
    `draw ${point(17, 9)} .. controls ${point(12.5, 11.4)} and ${point(7.5, 11.4)} .. ${point(3, 10)} -- ${point(3, 25.5)} .. controls ${point(7.5, 27)} and ${point(12.5, 27)} .. ${point(17, 24.5)} -- cycle withpen pencircle scaled ${mpNumber(1.7 * s)} withcolor ${color};`,
    `draw ${point(17, 9)} .. controls ${point(21.5, 11.4)} and ${point(26.5, 11.4)} .. ${point(31, 10)} -- ${point(31, 25.5)} .. controls ${point(26.5, 27)} and ${point(21.5, 27)} .. ${point(17, 24.5)} -- cycle withpen pencircle scaled ${mpNumber(1.7 * s)} withcolor ${color};`,
    `draw ${point(1, 8)} -- ${point(1, 23.5)} withpen pencircle scaled ${mpNumber(1.2 * s)} withcolor ${color};`,
    `draw ${point(33, 8)} -- ${point(33, 23.5)} withpen pencircle scaled ${mpNumber(1.2 * s)} withcolor ${color};`,
    `draw ${point(1, 8)} -- ${point(14.5, 7.2)} .. ${point(17, 6.2)} .. ${point(19.5, 7.2)} -- ${point(33, 8)} withpen pencircle scaled ${mpNumber(1.2 * s)} withcolor ${color};`,
  ].join('\n');
}

function fixedPage(mp) {
  return `\\setlayer[essaypage]{\\startMPcode
picture p;
${mp}
setbounds currentpicture to unitsquare xscaled ${PAGE.width}bp yscaled ${PAGE.height}bp;
\\stopMPcode}
\\startmakeup[essayfixedpage]\\null\\stopmakeup`;
}

function rowsBlock(firstNumber, count, top) {
  const lines = [];
  const bottom = top - count * ROW.height;
  for (let index = 0; index < count; index += 1) {
    const number = firstNumber + index;
    const rowTop = top - index * ROW.height;
    if (number % 5 === 0)
      lines.push(
        mpRect(ROW.left, rowTop - ROW.height, 22.177, ROW.height, 'essaygray'),
      );
    lines.push(
      mpLabel(`{\\bf ${number}}`, 39.74, rowTop - ROW.height + 4.86, 'center'),
    );
  }
  for (let index = 0; index <= count; index += 1) {
    const y = top - index * ROW.height;
    const edge = index === 0 || index === count;
    lines.push(
      mpLine(edge ? 28.4031 : 29.4031, y, edge ? 566.8724 : 565.8724, y, 0.875),
    );
  }
  for (const x of [ROW.left, ROW.numberRight, ROW.right])
    lines.push(mpLine(x, bottom, x, top, 1));
  return lines;
}

function datePieces(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? [match[3], match[2], match[1]] : ['', '', ''];
}

function identificationHeader({
  studentName,
  teacherName,
  className,
  date,
  logoFile,
  institutionName,
  qrFile,
}) {
  const [day, month, year] = datePieces(date);
  // Com QR (folhas nominais da aplicação), os campos encolhem para abrir
  // espaço ao código, com margem branca para a leitura.
  const right = qrFile ? 415 : 480.808;
  const dateX = qrFile
    ? { day: 318, slash1: 331, month: 345, slash2: 358, year: 384 }
    : { day: 321.5, slash1: 340.2121, month: 378, slash2: 412.2148, year: 448 };
  const value = (text, x, y) =>
    text ? mpLabel(`{\\tf ${contextText(text)}}`, x, y) : '';
  const centered = (text, x, y) =>
    text ? mpLabel(`{\\tf ${contextText(text)}}`, x, y, 'center') : '';
  const logo = logoFile
    ? `p := textext("\\externalfigure[${logoFile}][maxwidth=66bp,maxheight=58bp]"); draw p shifted (523.868 - xpart center p, 775.085 - ypart center p);`
    : institutionName
      ? `p := textext("\\framed[frame=off,width=66bp,align={middle,lohi},offset=0pt]{\\switchtobodyfont[7pt]\\color[essaynavy]{\\bf ${contextText(institutionName).slice(0, 160)}}}"); draw p shifted (523.868 - xpart center p, 775.085 - ypart center p);`
      : '';
  return [
    mpRect(28.346, 736.626, 538.583, 76.917),
    mpRect(35.4842, 788.7608, right - 35.4842, 18.472, 'white'),
    mpRect(35.4842, 765.8489, right - 35.4842, 18.472, 'white'),
    mpRect(35.4842, 742.9369, 222.662, 18.472, 'white'),
    mpRect(268.2096, 742.9369, right - 268.2096, 18.472, 'white'),
    mpRect(487.118, 742.937, 73.5, 64.296, 'white'),
    ...(qrFile
      ? [
          mpRect(421, 742.937, 60.118, 64.296, 'white'),
          `p := textext("\\externalfigure[${qrFile}][width=46bp,height=46bp]"); draw p shifted (451.059 - xpart center p, 775.085 - ypart center p);`,
        ]
      : []),
    mpLabel('{\\bf Estudante:}', 43.9882, 793.8716),
    mpLabel('{\\bf Professor(a):}', 43.9882, 770.9597),
    mpLabel('{\\bf Série/Turma:}', 43.9882, 748.0477),
    mpLabel('{\\bf Data:}', 276.7135, 748.0477),
    mpLabel('{\\bf /}', dateX.slash1, 748.0477),
    mpLabel('{\\bf /}', dateX.slash2, 748.0477),
    value(studentName, 102.5, 793.8716),
    value(teacherName, 111.8, 770.9597),
    value(className, 112.6, 748.0477),
    centered(day, dateX.day, 748.0477),
    centered(month, dateX.month, 748.0477),
    centered(year, dateX.year, 748.0477),
    logo,
  ];
}

function titleBand(y, title) {
  return [
    mpRect(28.346, y, 538.583, 42.52),
    mpBook(45.974, y + 4.253, 34.016),
    mpLabel(
      `{\\switchtobodyfont[12pt]\\bf\\color[white]{${title}}}`,
      PAGE.width / 2,
      y + 16.76,
      'center',
    ),
  ];
}

function productionSheetPages(copy, lineCount, firstPageNumber) {
  const first = [
    ...identificationHeader(copy),
    ...titleBand(687.968, 'PRODUÇÃO DE TEXTO'),
    `draw unitsquare xscaled 537.583 yscaled 62.05 shifted (28.846, 611.245) withpen pencircle scaled 1 withcolor \\MPcolor{essaynavy};`,
    mpRect(45.974, 668.295, 98.026, 9, 'white'),
    mpLabel(
      '{\\switchtobodyfont[12pt]\\bf\\color[essaynavy]{INFORMAÇÕES}}',
      55.1234,
      668.2953,
    ),
    ...ENEM_INSTRUCTIONS.flatMap((text, index) => [
      mpLabel(`{\\bf ${index + 1}.}`, 39.6893, 651.46 - index * 13.2),
      mpLabel(contextText(text), 57.6853, 651.46 - index * 13.2),
    ]),
    ...rowsBlock(1, Math.min(lineCount, ROWS_PER_FIRST_PAGE), ROW.top),
    mpLabel(`{\\bf ${firstPageNumber}}`, 566.2, 24.0582, 'right'),
  ];
  const pages = [first.join('\n')];
  let number = ROWS_PER_FIRST_PAGE + 1;
  while (number <= lineCount) {
    const count = Math.min(ROWS_PER_CONTINUATION_PAGE, lineCount - number + 1);
    pages.push(
      [
        ...titleBand(
          CONTINUATION_TOP + 20 + 10.866,
          'PRODUÇÃO DE TEXTO (CONTINUAÇÃO)',
        ),
        copy.studentName
          ? mpLabel(
              `{\\bf Estudante:} ${contextText(copy.studentName)}`,
              28.9,
              CONTINUATION_TOP + 10,
            )
          : '',
        ...rowsBlock(number, count, CONTINUATION_TOP),
        mpLabel(
          `{\\bf ${firstPageNumber + pages.length}}`,
          566.2,
          24.0582,
          'right',
        ),
      ].join('\n'),
    );
    number += count;
  }
  return pages;
}

function criteriaPage(pageNumber) {
  const [headerTop, headerBottom, ...rowBottoms] = CRITERIA_ROWS;
  const lines = [
    `fill fullcircle scaled 27.346 shifted (42.5197, 813.5429) withcolor \\MPcolor{essaynavy};`,
    mpBook(33.5, 804.5, 18),
    mpRect(68.173, 806.457, 170.079, 14.173, 'essaygray'),
    mpLabel(
      '{\\switchtobodyfont[6pt]PRODUÇÃO DE TEXTO}',
      153.2125,
      811.2933,
      'center',
    ),
    mpLabel(
      '{\\switchtobodyfont[11pt]\\bf MAPA DOS CRITÉRIOS UTILIZADOS NA CORREÇÃO DE REDAÇÃO - MODELO ENEM}',
      PAGE.width / 2,
      784.0334,
      'center',
    ),
    mpRect(
      28.846,
      headerBottom,
      268.791,
      headerTop - headerBottom,
      'essaygray',
    ),
    mpRect(
      297.638,
      headerBottom,
      268.791,
      headerTop - headerBottom,
      'essaygray',
    ),
    mpLabel(
      '{\\switchtobodyfont[9pt]\\bf Competências}',
      163.24,
      759.5835,
      'center',
    ),
    mpLabel(
      '{\\switchtobodyfont[9pt]\\bf Pontuação}',
      432.03,
      759.5835,
      'center',
    ),
  ];
  let top = headerBottom;
  ENEM_CRITERIA.forEach((criterion, index) => {
    const bottom = rowBottoms[index];
    const middle = (top + bottom) / 2;
    const competency = `\\framed[frame=off,offset=0pt,width=255bp,align={middle,nothyphenated}]{\\switchtobodyfont[8pt]\\setupinterlinespace[line=9.6pt]{\\bf ${criterion.numeral}}\\endgraf ${contextText(criterion.competency)}}`;
    const levels = `\\framed[frame=off,offset=0pt,width=259bp,align={flushleft,verytolerant}]{\\switchtobodyfont[8pt]\\setupinterlinespace[line=9.6pt]${criterion.levels.map(contextText).join('\\endgraf ')}}`;
    lines.push(
      `p := textext(${mpString(competency)}); draw p shifted (163.242 - xpart center p, ${mpNumber(middle)} - ypart center p);`,
      // A fonte do original é mais estreita: se o texto não couber na altura
      // da linha da referência, reduz a escala em vez de invadir a vizinha.
      `p := textext(${mpString(levels)}); if (ypart urcorner p - ypart llcorner p) > ${mpNumber(top - bottom - 6)}: p := p scaled (${mpNumber(top - bottom - 6)} / (ypart urcorner p - ypart llcorner p)); fi; draw p shifted (301.8 - xpart llcorner p, ${mpNumber(middle)} - ypart center p);`,
    );
    top = bottom;
  });
  for (const y of CRITERIA_ROWS) {
    lines.push(
      mpLine(28.3464, y, 297.6374, y, 1),
      mpLine(297.6378, y, 566.9291, y, 1),
    );
  }
  const tableBottom = CRITERIA_ROWS.at(-1);
  for (const x of [28.8464, 297.6378, 566.4291])
    lines.push(mpLine(x, tableBottom, x, headerTop, 1));
  lines.push(mpLabel(`{\\bf ${pageNumber}}`, 566.2, 24.0582, 'right'));
  return lines.join('\n');
}

// Largura da imagem em relação à mancha; a altura nunca passa de 55% da página.
export const imageWidths = Object.freeze({
  small: 0.35,
  medium: 0.55,
  large: 0.75,
  full: 1,
});

function blockToContext(block) {
  switch (block?.type) {
    case 'heading':
      return `\\blank[small]{\\bf\\switchtobodyfont[12pt]${inlineMarkup(block.text)}}\\par\\blank[small]`;
    case 'paragraph':
      return `${inlineMarkup(block.text)}\\par`;
    case 'quote':
      return `\\startnarrower[left]\\switchtobodyfont[10pt]{\\it ${inlineMarkup(block.text)}}\\par\\stopnarrower`;
    case 'list': {
      const items = (block.items || []).filter((item) => String(item).trim());
      if (!items.length) return '';
      return `\\startitemize[${block.ordered ? 'n' : '1'},packed]\n${items.map((item) => `\\item ${inlineMarkup(item)}`).join('\n')}\n\\stopitemize`;
    }
    case 'table': {
      const rows = (block.rows || []).filter(
        (row) => Array.isArray(row) && row.length,
      );
      if (!rows.length) return '';
      const columns = Math.max(...rows.map((row) => row.length));
      const body = rows
        .map(
          (row, index) =>
            `\\bTR${index === 0 && block.header ? '[background=color,backgroundcolor=essaylight,style=bold]' : ''} ${Array.from({ length: columns }, (_, column) => `\\bTD ${inlineMarkup(row[column] ?? '')} \\eTD`).join(' ')} \\eTR`,
        )
        .join('\n');
      return `\\blank[small]\\bTABLE[split=repeat,option=stretch]\n${block.header ? `\\bTABLEhead\n${body.split('\n')[0]}\n\\eTABLEhead\n\\bTABLEbody\n${body.split('\n').slice(1).join('\n')}\n\\eTABLEbody` : body}\n\\eTABLE\\blank[small]`;
    }
    case 'image': {
      if (!block.file) return '';
      const caption = block.caption
        ? `\\par{\\switchtobodyfont[9pt]\\it ${inlineMarkup(block.caption)}}`
        : '';
      const width = imageWidths[block.width] ?? imageWidths.large;
      return `\\blank[small]\\startalignment[middle]\\externalfigure[${block.file}][width=${width}\\textwidth,maxheight=0.55\\textheight]${caption}\\par\\stopalignment\\blank[small]`;
    }
    default:
      return '';
  }
}

function sectionTitle(title) {
  return `\\blank[medium]\\testpage[5]\\noindentation{\\switchtobodyfont[12pt]\\bf\\color[essaynavy]{${title}}}\\par\\nobreak\\vskip2bp\\hrule height 1bp\\relax\\nobreak\\blank[small]`;
}

function proposalSection(prompt, institutionName) {
  const metadata = [
    prompt.referenceInstitution && prompt.referenceYear
      ? `${prompt.referenceInstitution} · ${prompt.referenceYear}`
      : prompt.referenceInstitution ||
        (prompt.referenceYear ? String(prompt.referenceYear) : ''),
    prompt.essayType ? `Texto ${prompt.essayType}` : '',
    prompt.thematicAxis ? `Eixo temático: ${prompt.thematicAxis}` : '',
    prompt.category ? `Categoria: ${prompt.category}` : '',
  ].filter(Boolean);
  const texts = (prompt.motivatingTexts || []).map((text, index) => {
    const label = `TEXTO ${romanNumerals[index] || index + 1}`;
    const credits = [
      text.author ? `Autor: ${contextText(text.author)}` : '',
      text.source ? `Fonte: ${contextText(text.source)}` : '',
      text.bibliographicReference
        ? contextText(text.bibliographicReference)
        : '',
      text.url ? `Disponível em: ${breakableUrl(text.url)}` : '',
    ].filter(Boolean);
    const image = text.imageFile
      ? blockToContext({
          type: 'image',
          file: text.imageFile,
          caption: text.imageCaption,
          width: text.imageWidth,
        })
      : '';
    return [
      `\\blank[medium]\\testpage[4]{\\bf\\color[essaynavy]{${label}}}${text.title ? ` \\quad{\\bf ${contextText(text.title)}}` : ''}\\par\\nobreak\\blank[small]`,
      ...(text.content || []).map(blockToContext),
      image,
      credits.length
        ? `\\blank[small]\\startalignment[flushright]{\\switchtobodyfont[8.5pt]${credits.join('\\par ')}}\\par\\stopalignment`
        : '',
    ].join('\n');
  });
  const guidance = String(prompt.studentGuidance || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  const lineRule = `O texto deve ter, no mínimo, ${prompt.minLines} e, no máximo, ${prompt.maxLines} linhas escritas na folha de produção textual.`;
  const command = String(prompt.productionCommand || '')
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `${inlineMarkup(paragraph.trim())}\\par`)
    .join('\n');
  return `\\setupfootertexts[][{\\switchtobodyfont[9pt]Proposta de redação \\quad {\\bf \\pagenumber}}]
\\startMPcode
picture p;
${mpRect(0, 0, 538.583, 42.52)}
${mpBook(17.628, 4.253, 34.016)}
${mpLabel('{\\switchtobodyfont[12pt]\\bf\\color[white]{PROPOSTA DE REDAÇÃO}}', 269.29, 16.76, 'center')}
\\stopMPcode
\\blank[medium]
${institutionName ? `{\\switchtobodyfont[9pt]\\color[essaynavy]{${contextText(institutionName)}}}\\par` : ''}
${metadata.length ? `{\\switchtobodyfont[9pt]${metadata.map(contextText).join(' \\quad·\\quad ')}}\\par\\blank[small]` : ''}
{\\switchtobodyfont[15pt]\\bf ${contextText(prompt.title)}}\\par
\\blank[small]
{\\bf Tema:} ${contextText(prompt.theme)}\\par
${texts.length ? sectionTitle('TEXTOS MOTIVADORES') : ''}
${texts.join('\n')}
${sectionTitle('PROPOSTA DE REDAÇÃO')}
${command ? `\\startessaycommand\n${command}\n\\stopessaycommand` : ''}
${sectionTitle('ORIENTAÇÕES')}
\\startitemize[n,packed]
${[...guidance, lineRule].map((item) => `\\item ${inlineMarkup(item)}`).join('\n')}
\\stopitemize
`;
}

/**
 * @param {{
 *   prompt: Record<string, any>,
 *   template?: string,
 *   includeProposal?: boolean,
 *   includeCriteria?: boolean,
 *   duplex?: boolean,
 *   teacherName?: string,
 *   className?: string,
 *   date?: string,
 *   logoFile?: string,
 *   institutionName?: string,
 *   copies?: Array<{ studentName?: string, qrFile?: string }>,
 * }} input
 */
export function renderEssayDocument(input) {
  const template = ESSAY_SHEET_TEMPLATE_IDS.includes(input.template)
    ? input.template
    : 'enem-30-v1';
  const prompt = input.prompt;
  const lineCount =
    template === 'enem-30-v1'
      ? ROWS_PER_FIRST_PAGE
      : Math.max(5, Math.min(90, Number(prompt.maxLines) || 30));
  const copies = input.copies?.length ? input.copies : [{ studentName: '' }];
  const fixed = [];
  copies.forEach((copy) => {
    const header = {
      studentName: copy.studentName || '',
      teacherName: input.teacherName || '',
      className: input.className || '',
      date: input.date || '',
      logoFile: input.logoFile || '',
      institutionName: input.institutionName || '',
      qrFile: copy.qrFile || '',
    };
    const sheets = productionSheetPages(header, lineCount, 1);
    fixed.push(...sheets.map(fixedPage));
    if (input.includeCriteria)
      fixed.push(fixedPage(criteriaPage(sheets.length + 1)));
  });
  return `% UFA Prova — folha de redação (${template})
\\mainlanguage[pt]
\\setuppapersize[A4]
\\setupbodyfont[plex,ss,11pt]
\\setupinterlinespace[line=14pt]
\\setuplayout[backspace=28.346bp,width=538.583bp,topspace=28.346bp,header=0pt,headerdistance=0pt,footer=18bp,footerdistance=10bp,height=middle]
\\setupwhitespace[small]
\\setupindenting[no]
\\setuptolerance[horizontal,verytolerant,stretch]
\\setupalign[hz,hanging]
\\setupinteraction[state=start,color=,contrastcolor=]
\\definecolor[essaynavy][r=0.247,g=0.248,b=0.4]
\\definecolor[essaygray][s=0.7]
\\definecolor[essaylight][s=0.9]
\\setupTABLE[frame=on,framecolor=essaygray,offset=3pt,style={\\switchtobodyfont[10pt]}]
\\setupitemize[each][color=essaynavy,stopper=.,width=1.4em]
\\definetextbackground[essaycommandbackground][frame=on,framecolor=essaynavy,rulethickness=1bp,background=,leftoffset=6pt,rightoffset=6pt,topoffset=6pt,bottomoffset=6pt,location=paragraph,before={\\blank[small]},after={\\blank[small]}]
\\definestartstop[essaycommand][before={\\starttextbackground[essaycommandbackground]},after={\\stoptextbackground}]
\\definelayer[essaypage][x=0mm,y=0mm,width=\\paperwidth,height=\\paperheight]
\\setupbackgrounds[page][background=essaypage]
\\definemakeup[essayfixedpage][headerstate=empty,footerstate=empty,pagestate=start,top=,bottom=,page=yes]
\\setupfootertexts[][]
\\starttext
${input.includeProposal ? `${proposalSection(prompt, input.institutionName || '')}\\page\n\\setupfootertexts[][]${input.duplex ? '\n\\page[odd]' : ''}` : ''}
${fixed.join('\n')}
\\stoptext
`;
}
