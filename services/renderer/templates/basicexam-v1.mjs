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
    const institutionalHeader = `\\startframedtext[width=\\textwidth,offset=2.5mm,framecolor=normalheaderrule,rulethickness=.5pt,background=color,backgroundcolor=normalheaderbackground]
\\dontleavehmode\\hbox to \\hsize{
\\vbox to 14mm{\\hsize=27mm\\vfil\\leftaligned{${logo}}\\vfil}
\\hfill
\\vbox to 14mm{\\hsize=\\dimexpr\\hsize-52mm\\relax\\vfil\\midaligned{\\tfa\\bf ${institution}}\\blank[1mm]\\midaligned{\\tfx ${title} · ${version}}\\vfil}
\\hfill
\\vbox to 14mm{\\hsize=19mm\\vfil\\rightaligned{${qr}}\\vfil}}
\\switchtobodyfont[8pt]
\\dontleavehmode{\\bf Aluno(a):} ${candidateName || '\\thinrules[n=1,width=92mm]'}\\hfill{\\bf Nº:} ${candidateNumber || '\\thinrules[n=1,width=18mm]'}\\par
\\dontleavehmode{\\bf Disciplina:} ${subjects || '\\thinrules[n=1,width=42mm]'}\\hfill{\\bf Série:} ${grade || '\\thinrules[n=1,width=25mm]'}\\hfill{\\bf Turma:} ${className || '\\thinrules[n=1,width=22mm]'}\\par
\\dontleavehmode{\\bf Professor(a):} ${teacherName || '\\thinrules[n=1,width=45mm]'}\\hfill${term ? `{\\bf Período:} ${term}\\hfill` : ''}{\\bf Data:} ${assessmentDate || '\\thinrules[n=1,width=25mm]'}
\\stopframedtext`;
    const answerCardHeader = renderAnswerCardHeader({
      institution,
      title,
      grade,
      className,
      qr,
    });
    const header = mode === 'student' ? institutionalHeader : classicHeader;
    const answerRows = Array.from(
      { length: Number(questionCount) || 0 },
      (_, index) =>
        `\\NC ${String(index + 1).padStart(2, '0')} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{A} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{B} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{C} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{D} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{E} \\NC\\NR`,
    ).join('\n');
    const answerSheet =
      mode === 'student' && qrPayload
        ? `\\page
\\noindent\\blackrule[width=8mm,height=8mm]\\hfill\\blackrule[width=8mm,height=8mm]
\\blank[small]
${answerCardHeader}
\\blank[medium]
\\starttabulate[|c|c|c|c|c|c|]
${answerRows}
\\stoptabulate
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
\\setupquestion[question][option={Cr:num,packed,joinedup,continue}]
\\setupchoice
  [option={a,packed},
   style=\\italicface,
   stopper=)\\removeunwantedspaces\\space]
\\define[1]\\HabilidadeBNCC{{\\switchtobodyfont[cursor]#1}}
\\define[1]\\DescritorSAEB{{\\switchtobodyfont[cursor]#1}}
\\definecolor[normalheaderbackground][s=.96]
\\definecolor[normalheaderrule][s=.45]
\\definecolor[answercardrule][s=.35]
${answerCardHeaderPreamble}
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=16mm,backspace=18mm,width=middle,height=middle]
\\setuppagenumbering[location={footer,right},style=\\tfx]
\\setupalign[nothyphenated,hz,hanging,tolerant,stretch]

\\starttext
${header}
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
