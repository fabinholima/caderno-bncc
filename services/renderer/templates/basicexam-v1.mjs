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
    candidate,
    candidateName,
    candidateNumber,
    content,
  }) {
    const header = logoFileName
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
      ? `\\externalfigure[${qrFileName}][width=18mm,height=18mm]`
      : '';
    const answerRows = Array.from(
      { length: Number(questionCount) || 0 },
      (_, index) =>
        `\\NC ${String(index + 1).padStart(2, '0')} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{A} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{B} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{C} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{D} \\NC \\framed[width=6mm,height=6mm,corner=round,radius=3mm,offset=overlay]{E} \\NC\\NR`,
    ).join('\n');
    const answerSheet =
      mode === 'student' && qrPayload
        ? `\\page
\\noindent\\blackrule[width=8mm,height=8mm]\\hfill\\blackrule[width=8mm,height=8mm]
\\blank[medium]
\\midaligned{\\tfd\\bf Cartão-resposta}
\\blank[small]
Nome: ${candidateName || '\\thinrules[n=1,width=8cm]'}\\par
Nº: ${candidateNumber || '\\thinrules[n=1,width=1cm]'}
\\rightaligned{${qr}}
\\blank[medium]
\\starttabulate[|c|c|c|c|c|c|]
${answerRows}
\\stoptabulate
\\vfill
\\noindent\\blackrule[width=8mm,height=8mm]\\hfill\\blackrule[width=8mm,height=8mm]`
        : '';
    return `% Gerado automaticamente pelo layout basicexam-v1. Não editar.
\\usemodule[basicexam][mode=student]
\\usemodule[units]
\\setupformulas[align=flushleft]
\\setupquestion[question][option={Cr:num,packed,joinedup,continue}]
\\setupchoice
  [option={a,packed},
   style=\\italicface,
   stopper=)\\removeunwantedspaces\\space]
\\define[1]\\HabilidadeBNCC{{\\switchtobodyfont[cursor]#1}}
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=16mm,backspace=18mm,width=middle,height=middle]

\\starttext
${header}
\\blank[small]
\\midaligned{\\tfb ${title}}
\\midaligned{${grade} \\quad Versão ${version} \\quad Valor: ${points}}
\\midaligned{${qr}}
${detailLine}
${candidate}
\\blank[big]

${content}

${answerSheet}

\\stoptext
`;
  },
});
