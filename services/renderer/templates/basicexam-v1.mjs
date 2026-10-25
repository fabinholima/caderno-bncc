import {
  answerCardHeaderPreamble,
  renderAnswerCardHeader,
} from './answer-card-header.mjs';

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
    const logo = logoFileName
      ? `\\externalfigure[${logoFileName}][height=13mm,width=25mm,factor=fit]`
      : '';
    const institutionalHeader = `\\dontleavehmode\\hbox to \\hsize{
\\vbox to 16mm{\\hsize=52mm\\vfil\\dontleavehmode\\hbox to \\hsize{${logo}\\hskip2mm\\vbox{\\hsize=25mm\\leftaligned{\\tfx\\bold{${institution}}}}\\hfill}\\vfil}
\\hskip3mm\\blackrule[width=.5pt,height=16mm,color=normalheaderrule]\\hskip3mm
\\vbox to 16mm{\\hsize=\\dimexpr\\hsize-84mm\\relax\\vfil\\leftaligned{\\tfa\\bold{${title}}}\\blank[1mm]\\leftaligned{\\tfx ${subjects || grade} · Versão ${version}}\\vfil}
\\hfill
\\vbox to 16mm{\\hsize=18mm\\vfil\\rightaligned{${headerQr ? qr : ''}}\\vfil}}
\\blank[1mm]
\\blackrule[width=\\textwidth,height=.5pt,color=normalheaderrule]
\\blank[1mm]
\\switchtobodyfont[8.5pt]
\\dontleavehmode{\\bf Aluno(a):} ${candidateName || '\\thinrules[n=1,width=92mm]'}\\hfill{\\bf Nº:} ${candidateNumber || '\\thinrules[n=1,width=18mm]'}\\par
\\dontleavehmode{\\bf Disciplina:} ${subjects || '\\thinrules[n=1,width=42mm]'}\\hfill{\\bf Série:} ${grade || '\\thinrules[n=1,width=25mm]'}\\hfill{\\bf Turma:} ${className || '\\thinrules[n=1,width=22mm]'}\\par
\\dontleavehmode{\\bf Professor(a):} ${teacherName || '\\thinrules[n=1,width=45mm]'}\\hfill${term ? `{\\bf Período:} ${term}\\hfill` : ''}{\\bf Data:} ${assessmentDate || '\\thinrules[n=1,width=25mm]'}`;
    const answerCardHeader = renderAnswerCardHeader({
      institution,
      title,
      grade,
      className,
      qr,
    });
    const header = previewOnly
      ? ''
      : mode === 'student'
        ? institutionalHeader
        : classicHeader;
    const answerRows = Array.from(
      { length: Number(questionCount) || 0 },
      (_, index) =>
        `\\NC ${String(index + 1).padStart(2, '0')} ${answerLabels.map(() => `\\NC \\framed[width=6mm,height=6mm,frame=on,rulethickness=.6pt,corner=round,radius=3mm,offset=overlay]{}`).join(' ')} \\NC\\NR`,
    ).join('\n');
    const answerHeadings = `\\NC \\NC ${answerLabels.map((label) => `\\NC {\\bf ${label}}`).join(' ')} \\NC\\NR`;
    const answerSheet =
      mode === 'student' && !omitAnswerSheet && !previewOnly
        ? `\\page
\\noindent\\blackrule[width=8mm,height=8mm]\\hfill\\blackrule[width=8mm,height=8mm]
\\blank[small]
${answerCardHeader}
\\blank[medium]
${
  answerSheetBody ||
  `\\starttabulate[|c|${answerLabels.map(() => 'c|').join('')}]
${answerHeadings}
${answerRows}
\\stoptabulate`
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
\\definecolor[answercardrule][s=.35]
${answerCardHeaderPreamble}
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=13mm,backspace=18mm,width=middle,height=middle${compactLayout ? ',header=0mm,headerdistance=0mm,footer=6mm,footerdistance=4mm' : ''}]
\\setuppagenumbering[location={footer,right},style=\\tfx]
\\setupalign[nothyphenated,hz,hanging,tolerant,stretch]

\\setuphead[subject][style=\\bf, before={\\blank[medium]}, after={\\blank[small]}]
\\starttext
${header ? `${header}\\blank[medium]` : ''}
${
  mode === 'answer-key'
    ? `\\blank[small]
\\midaligned{\\tfb ${title}}
\\midaligned{${grade} \\quad Versão ${version} \\quad Valor: ${points}}
${detailLine}`
    : ''
}
\\blank[big]

${content}

${answerSheet}

\\stoptext
`;
  },
});
