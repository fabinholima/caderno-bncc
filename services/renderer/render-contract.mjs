import { getRenderTemplate } from './template-registry.mjs';

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

function richText(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === 'metapost') {
        const code = String(node.code ?? '').trim();
        if (!code || code.length > 50_000 || forbiddenMetaPost.test(code)) {
          throw new Error('Bloco MetaPost inválido ou não permitido.');
        }
        return `\\startMPcode\n${code}\n\\stopMPcode`;
      }
      if (node.type === 'math') {
        return `\\startformula\n${String(node.tex ?? '')}\n\\stopformula`;
      }
      return escapeContext(node.text ?? '');
    })
    .join('\n\n');
}

export function renderAssessment(snapshot) {
  if (snapshot?.schemaVersion !== '1.0' || !Array.isArray(snapshot.questions)) {
    throw new Error('Snapshot de avaliação inválido ou incompatível.');
  }
  const mode =
    snapshot.render?.mode === 'answer-key' ? 'answer-key' : 'student';
  const renderQuestion = (question) => {
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
    return `\\startquestion[point=${Number(question.points) || 0},showanswer=${mode === 'answer-key' ? 'true' : 'false'}]\n${richText(question.statement)}\n${choiceBlock}\n  \\startanswer\n${richText(question.answer?.explanation)}\n  \\stopanswer\n\\stopquestion`;
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
  const candidate =
    mode === 'answer-key'
      ? ''
      : '\\blank\nNome: \\thinrules[n=1,width=9cm] \\quad Turma: \\thinrules[n=1,width=2cm]';
  const template = getRenderTemplate(snapshot.render?.template);
  return template.render({
    mode,
    paper: snapshot.render?.paper === 'A5' ? 'A5' : 'A4',
    institution: escapeContext(snapshot.institution?.name),
    title: escapeContext(title),
    grade: escapeContext(snapshot.assessment?.grade),
    version: escapeContext(snapshot.version?.code),
    points: `${total} ${total === 1 ? 'ponto' : 'pontos'}`,
    candidate,
    content,
  });
}
