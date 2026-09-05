import { getRenderTemplate } from './template-registry.mjs';
import {
  DEFAULT_RENDER_FONT,
  isRenderFontId,
} from '../../lib/render-templates.mjs';

const contextEscapes = new Map([
  ['\\', '\\letterbackslash '],
  ['{', '\\{'],
  ['}', '\\}'],
  ['#', '\\#'],
  ['$', '\\$'],
  ['%', '\\%'],
  ['&', '\\&'],
  ['_', '\\_'],
  ['~', '\\lettertilde '],
  ['^', '\\letterhat '],
]);

export function escapeContext(value = '') {
  return String(value).replace(/[\\{}#$%&_~^]/g, (character) =>
    contextEscapes.get(character),
  );
}

const forbiddenMetaPost =
  /(?:\\|runscript|scantokens|readfrom|write\s|closefrom|closeout|input\s|loadmodule|verbatimtex|btex|etex)/i;

const forbiddenContextFormula =
  /\\(?:input|include|read|write|openin|openout|closein|closeout|directlua|ctxlua|latelua|usemodule|environment|component|product|project|starttext|stoptext|startMPcode|startluacode|xmlprocess|processfile)\b/i;

const allowedMathCommands = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron',
  'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Theta', 'Lambda', 'Xi', 'Pi',
  'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'Delta',
  'approx',
  'cdot',
  'circ',
  'div',
  'frac',
  'ge',
  'le',
  'left',
  'mathrm',
  'neq',
  'pm',
  'qquad',
  'right',
  'sqrt',
  'text',
  'times',
  'rightarrow',
  'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow',
  'infty', 'ell', 'partial', 'nabla', 'sum', 'prod', 'int', 'oint', 'lim',
  'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'min', 'max',
  'equiv', 'sim', 'simeq', 'cong', 'propto', 'll', 'gg', 'in', 'notin',
  'subset', 'subseteq', 'supset', 'supseteq', 'cup', 'cap', 'emptyset',
  'forall', 'exists', 'neg', 'land', 'lor', 'oplus', 'otimes',
  'overline', 'underline', 'vec', 'hat', 'bar', 'overrightarrow',
  'langle', 'rangle', 'cdots', 'ldots', 'vdots', 'ddots',
]);

function safeMath(formula) {
  const value = String(formula ?? '').trim();
  const commandsAllowed = [...value.matchAll(/\\([A-Za-z]+)/g)].every((match) =>
    allowedMathCommands.has(match[1]),
  );
  if (!value || value.length > 2_000 || !commandsAllowed)
    throw new Error('Fórmula matemática inválida ou não permitida.');
  return value;
}

function chemicalFormula(node) {
  const value = String(node.formula ?? '').trim();
  if (
    !value ||
    value.length > 2_000 ||
    !/^[A-Za-z0-9_{}()[\]+\-.=<>^\s]+$/.test(value) ||
    /[{}]{2}|[\\#$%&]/.test(value)
  )
    throw new Error('Fórmula química inválida ou não permitida.');
  const symbols = new Map([
    ['+', 'PLUS'],
    ['-', 'MINUS'],
    ['=', 'EQUALS'],
    ['->', 'GIVES'],
    ['=>', 'GIVES'],
    ['<=>', 'EQUILIBRIUM'],
    ['<->', 'EQUILIBRIUM'],
  ]);
  const above = escapeContext(node.conditionAbove || '');
  const below = escapeContext(node.conditionBelow || '');
  const parts = value.split(/\s+/).map((part) => symbols.get(part) || part);
  const content = parts
    .map((part) =>
      part === 'GIVES' || part === 'EQUILIBRIUM'
        ? `\\chemical{${part}}{${above}}{${below}}`
        : `\\chemical{${part}}`,
    )
    .join(node.display === false ? ' ' : '\n  ');
  if (node.display === false) return `\\inlinechemical{${parts.join(',')}}`;
  return `\\startchemicalformula\n  ${content}\n\\stopchemicalformula`;
}

function chemicalStructure(node) {
  const structures = {
    benzene: 'SIX,SB246,DB135',
    cyclohexane: 'SIX,SB123456',
  };
  const instructions = structures[node.preset];
  if (!instructions) throw new Error('Estrutura química não permitida.');
  const caption = node.caption
    ? `\n\\midaligned{${escapeContext(node.caption)}}`
    : '';
  return `\\startalignment[middle]\n\\startchemical[frame=off,scale=small,width=fit,height=fit]\n  \\chemical[${instructions}]\n\\stopchemical${caption}\n\\stopalignment`;
}

function thermochemicalEquation(node) {
  const equation = String(node.equation ?? '').trim();
  const temperature = String(node.temperature ?? '').trim();
  const enthalpy = String(node.enthalpy ?? '').trim();
  if (!equation || !/^[A-Za-z0-9_{}()[\]+\-.=<>^\s]+$/.test(equation))
    throw new Error('Equação termoquímica inválida.');
  if (!/^[0-9]+(?:[.,][0-9]+)? degrees celsius$/i.test(temperature))
    throw new Error('Temperatura termoquímica inválida.');
  if (!/^-?[0-9]+(?:[.,][0-9]+)? kilo joule$/i.test(enthalpy))
    throw new Error('Entalpia termoquímica inválida.');
  const symbols = new Map([
    ['+', 'PLUS'],
    ['->', 'GIVES'],
    ['=>', 'GIVES'],
    ['<=>', 'EQUILIBRIUM'],
    ['<->', 'EQUILIBRIUM'],
  ]);
  const rendered = equation
    .split(/\s+/)
    .map((part) => `\\chemical{${symbols.get(part) || part}}`)
    .join(' ');
  return `\\startformula\n\\chemical{} ${rendered} \\qquad \\Delta H(\\unit{${temperature}}) = \\unit{${enthalpy}}\n\\stopformula`;
}

function normalizeContextUnits(code) {
  const aliases = new Map([
    ['g', 'gram'],
    ['kg', 'kilogram'],
    ['mg', 'milligram'],
    ['mol', 'mole'],
    ['mmol', 'millimole'],
    ['l', 'liter'],
    ['ml', 'milliliter'],
    ['j', 'joule'],
    ['kj', 'kilo joule'],
    ['c', 'degrees celsius'],
    ['°c', 'degrees celsius'],
  ]);
  return code.replace(/\\unit\{([^{}]+)\}/g, (_whole, rawValue) => {
    const value = String(rawValue).trim();
    const match = value.match(/^([+-]?[0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z°]+)$/);
    if (!match) return `\\unit{${value}}`;
    const normalizedUnit = aliases.get(match[2].toLocaleLowerCase('pt-BR'));
    return normalizedUnit
      ? `\\unit{${match[1]} ${normalizedUnit}}`
      : `\\unit{${value}}`;
  });
}

function paragraphWithScientificInline(text) {
  const value = String(text ?? '');
  const pattern = /\\(chemical|unit|m)\{/g;
  let output = '';
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index || 0;
    if (index < cursor) continue;
    let depth = 1;
    let end = index + match[0].length;
    while (end < value.length && depth) {
      if (value[end] === '{') depth += 1;
      else if (value[end] === '}') depth -= 1;
      end += 1;
    }
    if (depth) continue;
    output += escapeContext(value.slice(cursor, index));
    const command = match[1];
    const argument = value.slice(index + match[0].length, end - 1);
    const mathCommandsAllowed = [...argument.matchAll(/\\([A-Za-z]+)/g)]
      .every((item) => allowedMathCommands.has(item[1]));
    const valid = command === 'chemical'
      ? /^[A-Za-z0-9_{}()+\-.=\\\s]+$/.test(argument) &&
        [...argument.matchAll(/\\([A-Za-z]+)/g)].every((item) => item[1] === 'ell')
      : command === 'unit'
        ? /^[A-Za-z0-9À-ÿ°,+\-\s./]+$/.test(argument)
        : mathCommandsAllowed && /^[A-Za-z0-9\\{}_^+\-*/=<>()[\],.;:\s]+$/.test(argument);
    const original = value.slice(index, end);
    output += valid
      ? command === 'unit' ? normalizeContextUnits(original) : original
      : escapeContext(original);
    cursor = end;
  }
  return output + escapeContext(value.slice(cursor));
}

function richText(nodes = []) {
  const rendered = nodes.map((node) => {
    if (node.type === 'romanList') {
      const items = Array.isArray(node.items) ? node.items : [];
      if (!items.length || items.length > 30)
        throw new Error('Lista romana inválida ou vazia.');
      return {
        content: `\\startitemize[I,packed]\n${items.map((item) => `  \\item ${escapeContext(item)}`).join('\n')}\n\\stopitemize`,
        inline: false,
      };
    }
    if (node.type === 'metapost') {
      const code = String(node.code ?? '').trim();
      if (!code || code.length > 50_000 || forbiddenMetaPost.test(code)) {
        throw new Error('Bloco MetaPost inválido ou não permitido.');
      }
      return { content: `\\startMPcode\n${code}\n\\stopMPcode`, inline: false };
    }
    if (node.type === 'math') {
      const formula = safeMath(node.tex);
      return {
        content:
          node.display === false
            ? `\\mathematics{${formula}}`
            : `\\startformula\n${formula}\n\\stopformula`,
        inline: node.display === false,
      };
    }
    if (node.type === 'contextFormula') {
      const code = String(node.code ?? '').trim();
      const allowed = new Set([
        'chemical', 'unit', 'Delta', 'ell', 'qquad', 'quad', 'frac', 'sqrt',
        'cdot', 'times', 'pm', 'approx', 'mathrm',
      ]);
      if (!code || code.length > 4_000 || forbiddenContextFormula.test(code) ||
        ![...code.matchAll(/\\([A-Za-z]+)/g)].every((match) => allowed.has(match[1])))
        throw new Error('Fórmula ConTeXt inválida ou não permitida.');
      return { content: `\\startformula\n${normalizeContextUnits(code)}\n\\stopformula`, inline: false };
    }
    if (node.type === 'contextInline') {
      const code = String(node.code ?? '').trim();
      const allowed = new Set([
        'chemical', 'unit', 'Delta', 'ell', 'quad', 'frac', 'sqrt', 'cdot',
        'times', 'pm', 'approx', 'mathrm', 'bold',
      ]);
      if (!code || code.length > 1_000 || forbiddenContextFormula.test(code) ||
        ![...code.matchAll(/\\([A-Za-z]+)/g)].every((match) => allowed.has(match[1])))
        throw new Error('Trecho ConTeXt em linha inválido ou não permitido.');
      return { content: normalizeContextUnits(code), inline: true };
    }
    if (node.type === 'chemical')
      return { content: chemicalFormula(node), inline: node.display === false };
    if (node.type === 'thermochemicalEquation')
      return { content: thermochemicalEquation(node), inline: false };
    if (node.type === 'chemicalStructure')
      return { content: chemicalStructure(node), inline: false };
    if (node.type === 'image') {
      const fileName = String(node.fileName ?? '');
      if (!/^question-image-[0-9]+\.(?:png|jpg)$/.test(fileName))
        throw new Error('Imagem da questão inválida ou não materializada.');
      const caption = node.caption
        ? `\n\\midaligned{${escapeContext(node.caption)}}`
        : '';
      return {
        content: `\\startalignment[middle]\n\\externalfigure[${fileName}][maxwidth=.88\\textwidth,maxheight=.32\\textheight]\n${caption}\n\\stopalignment`,
        inline: false,
      };
    }
    return { content: paragraphWithScientificInline(node.text), inline: false };
  });
  return rendered.reduce(
    (output, item, index) =>
      `${output}${index ? (item.inline || rendered[index - 1].inline ? ' ' : '\n\n') : ''}${item.content}`,
    '',
  );
}

export function renderAssessment(snapshot) {
  if (snapshot?.schemaVersion !== '1.0' || !Array.isArray(snapshot.questions)) {
    throw new Error('Snapshot de avaliação inválido ou incompatível.');
  }
  const mode =
    snapshot.render?.mode === 'answer-key' ? 'answer-key' : 'student';
  const renderQuestion = (question) => {
    const source = [question.source?.institution, question.source?.year]
      .filter(Boolean)
      .join('-');
    const sourceLine = source ? `\\bold{(${escapeContext(source)})} ` : '';
    const skillCodes = (question.skills ?? [])
      .map((skill) => skill.code)
      .filter(Boolean);
    const skillLine =
      snapshot.render?.showBnccSkills && skillCodes.length
        ? `\\HabilidadeBNCC{${skillCodes.map(escapeContext).join(', ')}}\\quad `
        : '';
    const correct = new Set(question.answer?.correctStableKeys ?? []);
    const choices = (question.alternatives ?? [])
      .map(
        (answer) =>
          `    \\startcitem${correct.has(answer.stableKey) ? '[*]' : ''} ${richText(answer.content)} \\stopcitem`,
      )
      .join('\n');
    const choiceBlock = choices
      ? `  \\startchoice\n${choices}\n  \\stopchoice`
      : mode === 'student'
        ? '\\blank[4*big]'
        : '';
    return `\\startquestion[point=${Number(question.points) || 0},showanswer=${mode === 'answer-key' ? 'true' : 'false'}]\n${skillLine}${sourceLine}${richText(question.statement)}\n${choiceBlock}\n  \\startanswer\n${richText(question.answer?.explanation)}\n  \\stopanswer\n\\stopquestion`;
  };
  const sections =
    Array.isArray(snapshot.sections) && snapshot.sections.length
      ? snapshot.sections
      : [
          {
            title: '',
            subject: snapshot.assessment?.subject,
            columns: 1,
            startOnNewPage: false,
            questions: snapshot.questions,
          },
        ];
  const studentQuestions = sections
    .map((section, index) => {
      const content = (section.questions ?? [])
        .map(renderQuestion)
        .join('\n\n');
      const pageBreak = index > 0 && section.startOnNewPage ? '\\page\n' : '';
      const heading = section.title
        ? `\\subject{${escapeContext(section.title)}}\n\\blank[small]\n`
        : '';
      const columns =
        Number(section.columns) === 2
          ? `\\startcolumns[n=2,balance=no]\n${content}\n\\stopcolumns`
          : content;
      return `${pageBreak}${heading}${columns}`;
    })
    .join('\n\n');
  const answerRows = sections
    .flatMap((section) =>
      (section.questions ?? []).map((question) => {
        const correct = new Set(question.answer?.correctStableKeys ?? []);
        const labels = (question.alternatives ?? [])
          .filter((answer) => correct.has(answer.stableKey))
          .map((answer) => answer.label)
          .join(', ');
        const answer = labels || 'Correção manual';
        return `\\NC ${question.number} \\NC ${escapeContext(section.subject)} \\NC ${escapeContext(answer)} \\NC\\NR`;
      }),
    )
    .join('\n');
  const explanations = sections
    .flatMap((section) =>
      (section.questions ?? [])
        .filter((question) => question.answer?.explanation?.length)
        .map(
          (question) =>
            `\\blank[medium]\n{\\bf Questão ${question.number}.} ${richText(question.answer.explanation)}`,
        ),
    )
    .join('\n');
  const answerKey = `\\subject{Respostas}\n\\starttabulate[|c|l|l|]\n\\HL\n\\NC {\\bf Questão} \\NC {\\bf Disciplina} \\NC {\\bf Resposta} \\NC\\NR\n\\HL\n${answerRows}\n\\HL\n\\stoptabulate\n${
    explanations
      ? `\n\\subject{Comentários e critérios de correção}\n${explanations}`
      : ''
  }`;
  const content = mode === 'answer-key' ? answerKey : studentQuestions;
  const total = Number(snapshot.totals?.points) || 0;
  const title =
    mode === 'answer-key'
      ? `Gabarito - ${snapshot.assessment?.title}`
      : snapshot.assessment?.title;
  const candidateData = snapshot.candidate;
  const candidate =
    mode === 'answer-key'
      ? ''
      : candidateData?.name
        ? `\\blank\nNome: ${escapeContext(candidateData.name)} \\quad Nº: ${escapeContext(candidateData.number || '')}`
        : '\\blank\nNome: \\thinrules[n=1,width=9cm] \\quad Turma: \\thinrules[n=1,width=2cm]';
  const header = snapshot.assessment?.header ?? {};
  const requestedFont = snapshot.render?.font ?? DEFAULT_RENDER_FONT;
  if (!isRenderFontId(requestedFont))
    throw new Error(`Fonte de renderização não permitida: ${requestedFont}`);
  const requestedFontSize = Number(snapshot.render?.fontSize ?? 11);
  if (
    !Number.isInteger(requestedFontSize) ||
    requestedFontSize < 10 ||
    requestedFontSize > 16
  )
    throw new Error('Tamanho de fonte deve ser um inteiro entre 10 e 16 pt.');
  const template = getRenderTemplate(snapshot.render?.template);
  return template.render({
    mode,
    paper: snapshot.render?.paper === 'A5' ? 'A5' : 'A4',
    institution: escapeContext(snapshot.institution?.name),
    logoFileName: snapshot.institution?.logoFileName || '',
    teacherName: escapeContext(header.teacherName),
    className: escapeContext(header.className),
    term: escapeContext(header.term),
    assessmentDate: escapeContext(header.date),
    transcriptionPhrase: escapeContext(header.transcriptionPhrase),
    instructions: (snapshot.assessment?.instructions ?? []).map((instruction) =>
      escapeContext(instruction),
    ),
    font: requestedFont,
    fontSize: requestedFontSize,
    title: escapeContext(title),
    grade: escapeContext(snapshot.assessment?.grade),
    version: escapeContext(snapshot.version?.code),
    qrPayload: String(snapshot.version?.qrPayload || ''),
    qrFileName: String(snapshot.version?.qrFileName || ''),
    questionCount: snapshot.questions.length,
    points: `${total} ${total === 1 ? 'ponto' : 'pontos'}`,
    candidate,
    candidateName: escapeContext(candidateData?.name || ''),
    candidateNumber: escapeContext(candidateData?.number || ''),
    content,
  });
}
