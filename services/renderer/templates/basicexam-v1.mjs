import {
  renderAnswerCardHeader,
} from './answer-card-header.mjs';
import { fiveOptionAnswerSheet } from './five-option-answer-grid.mjs';
import { renderCompactExamHeader } from './institutional-header.mjs';

export const basicExamV1 = Object.freeze({
  id: 'basicexam-v1',
  render({
    mode,
    paper,
    institution,
    logoFileName,
    teacherName,
    className,
    term,
    assessmentDate,
    font,
    fontSize,
    title,
    grade,
    version,
    qrPayload,
    qrFileName,
    questionCount,
    points,
    candidateName,
    candidateNumber,
    subjects,
    content,
    previewOnly = false,
    omitAnswerSheet = false,
    headerQr = true,
    compactLayout = false,
    answerLabels = ['A', 'B', 'C', 'D', 'E'],
    answerSheetBody = '',
  }) {
    const classicHeader = logoFileName
      ? `\\startcombination[2*1]
  {\\externalfigure[${logoFileName}][height=18mm,width=32mm,factor=fit]} {}
  {\\framed[frame=off,width=\\dimexpr\\textwidth-36mm\\relax,align=middle]{\\tfd\\bf ${institution}}} {}
\\stopcombination`
      : `\\midaligned{\\tfd\\bf ${institution}}`;
    const details = [
      teacherName ? `Professor(a): ${teacherName}` : '',
      className ? `Turma: ${className}` : '',
      term ? `Período: ${term}` : '',
      assessmentDate ? `Data: ${assessmentDate}` : '',
    ].filter(Boolean);
    const detailLine = details.length
      ? `\\blank[small]\n\\midaligned{${details.join(' \\quad ')}}`
      : '';
    if (qrPayload && !/^CBS?1:[0-9a-f-]{36}:[0-9a-f]{20}$/.test(qrPayload))
      throw new Error('Identificador QR inválido.');
    const qr = qrFileName
      ? `\\externalfigure[${qrFileName}][width=14mm,height=14mm]`
      : '';
    const customInstitutionalHeader = renderCompactExamHeader({
      institution,
      logoFileName,
      teacherName,
      className,
      term,
      assessmentDate,
      grade,
      qrFileName,
      candidateName,
      candidateNumber,
      subjects,
      title,
      version,
      headerQr,
    });
    const institutionalHeader = customInstitutionalHeader;
    const answerCardHeader = renderAnswerCardHeader({
      institution,
      title,
      grade,
      className,
      candidateName,
      candidateNumber,
      qr,
    });
    const header = previewOnly
      ? ''
      : mode === 'student'
        ? institutionalHeader
        : classicHeader;
    const defaultAnswerSheet = answerLabels.length === 5
      ? fiveOptionAnswerSheet(questionCount)
      : '';
    const answerSheet =
      mode === 'student' && !omitAnswerSheet && !previewOnly
        ? `\\page
\\noindent\\blackrule[width=8mm,height=8mm]\\hfill\\blackrule[width=8mm,height=8mm]
\\blank[small]
${answerCardHeader}
\\blank[medium]
${
  answerSheetBody || defaultAnswerSheet
}
\\vfill
\\noindent\\blackrule[width=8mm,height=8mm]\\hfill\\blackrule[width=8mm,height=8mm]`
        : '';
    return `% Gerado automaticamente pelo layout basicexam-v1. Não editar.
\\mainlanguage[pt]
\\usemodule[basicexam][mode=student]
\\usemodule[units]
\\def\\lqd{\\m{\\char"1D4C1}}
\\def\\halfr{\\frac[vfactor=500, method=horizontal]{1}{2}}
\\setupunittext[liter=L]
\\setupformulas[align=flushleft]
\\definemathmatrix[pmatrix][matrix:parentheses][simplecommand=pmatrix]
\\definemathmatrix[bmatrix][matrix:brackets][simplecommand=bmatrix]
\\definemathmatrix[determinant][matrix:bars][simplecommand=thedeterminant]
\\setupquestion[question][option={Cr:num,packed,joinedup,continue}]
\\setupchoice
  [option={a,packed},
   style=\\italicface,
   stopper=)\\removeunwantedspaces\\space]
\\define[1]\\HabilidadeBNCC{{\\switchtobodyfont[cursor]#1}}
\\define[1]\\DescritorSAEB{{\\switchtobodyfont[cursor]#1}}
\\definecolor[normalheaderrule][s=.45]
${compactLayout ? `\\setuppapersize[${paper}]` : '\\setuppapersize[A4]'}
\\setupbodyfont[${font},${fontSize}pt]
${compactLayout ? `\\setuplayout[topspace=13mm,backspace=18mm,width=middle,height=middle,header=0mm,headerdistance=0mm,footer=6mm,footerdistance=4mm]` : `\\setuplayout[
  topspace=1.5cm,
  backspace=2cm,
  width=middle,
  height=middle,
  header=.1cm,
  footer=1cm
]`}
\\setuppagenumbering[location={footer,right},style=\\tfx]
\\setupalign[hyphenated,hz,hanging,tolerant,stretch]

\\setuphead[subject][style=\\bf, before={\\blank[small]}, after={\\blank[2pt]}]
\\starttext
${header ? `${header}\\blank[small]` : ''}
${
  mode === 'answer-key'
    ? `\\blank[small]
\\midaligned{\\tfb ${title}}
\\midaligned{${grade} \\quad Versão ${version} \\quad Valor: ${points}}
${detailLine}`
    : ''
}
\\blank[${mode === 'student' ? 'small' : 'big'}]

${content}

${answerSheet}

\\stoptext
`;
  },
});
