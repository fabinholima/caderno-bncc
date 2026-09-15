const answerBubble = (label, filled = false) =>
  `\\framed[width=4.6mm,height=4.6mm,frame=on,rulethickness=.6pt,corner=round,radius=2.3mm,offset=overlay,framecolor=modelthreeink,background=${filled ? 'color' : 'none'},backgroundcolor=modelthreeink]{${filled ? `\\color[white]{\\switchtobodyfont[6pt]${label}}` : `\\switchtobodyfont[6pt]${label}`}}`;

function answerRows(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => {
    const number = start + offset;
    return `\\NC \\switchtobodyfont[7pt]${String(number).padStart(2, '0')} \\NC ${answerBubble('A')} \\NC ${answerBubble('B')} \\NC ${answerBubble('C')} \\NC ${answerBubble('D')} \\NC ${answerBubble('E')} \\NC\\NR`;
  }).join('\n');
}

function answerBlock(start, end) {
  return `\\vtop{\\hsize=43mm\\midaligned{\\switchtobodyfont[8pt]\\bold{RESPOSTAS ${String(start).padStart(2, '0')} - ${String(end).padStart(2, '0')}}}\\blank[1mm]\\starttabulate[|cw(5mm)|c|c|c|c|c|]\n\\NC \\NC A \\NC B \\NC C \\NC D \\NC E \\NC\\NR\n${answerRows(start, end)}\n\\stoptabulate}`;
}

function responseBlocks(questionCount) {
  const size = 10;
  return Array.from(
    { length: Math.ceil(Number(questionCount) / size) },
    (_, index) => {
      const start = index * size + 1;
      return answerBlock(
        start,
        Math.min(start + size - 1, Number(questionCount)),
      );
    },
  ).join('\\hfill\n');
}

export const twoColumnExamV1 = Object.freeze({
  id: 'caderno-duas-colunas-v1',
  render(data) {
    const {
      mode,
      paper,
      institution,
      logoFileName,
      className,
      assessmentDate,
      font,
      fontSize,
      title,
      grade,
      version,
      qrFileName,
      questionCount,
      candidateName,
      candidateNumber,
      content,
    } = data;
    if (Number(questionCount) > 60)
      throw new Error(
        'O Modelo 3 aceita no máximo 60 questões por folha de respostas.',
      );

    const logo = logoFileName
      ? `\\externalfigure[${logoFileName}][height=12mm,width=28mm,factor=fit]`
      : `\\framed[width=28mm,height=12mm,align=middle,framecolor=modelthreerule]{\\switchtobodyfont[6pt]LOGOTIPO}`;
    const qr = qrFileName
      ? `\\externalfigure[${qrFileName}][width=18mm,height=18mm]`
      : '';
    const compactHeader = `\\hbox to \\textwidth{\\vbox{\\hsize=30mm${logo}}\\hfill\\vbox{\\hsize=105mm\\rightaligned{\\switchtobodyfont[8pt]\\bold{${title}}}\\rightaligned{\\switchtobodyfont[7pt]${grade} \\quad VERSÃO ${version}}}}\\blank[1mm]\\modelthreeline`;
    const answerHeader = `\\hbox to \\textwidth{${logo}\\hfill\\framed[frame=off,width=105mm,align=middle]{\\tfc\\bold{${institution}}\\par\\switchtobodyfont[8pt]${title}}\\hfill\\framed[frame=off,width=20mm,align=middle]{${qr}}}`;
    const example = `\\vbox{\\hsize=55mm\\framed[frame=off,width=55mm,align=middle]{\\switchtobodyfont[8pt]\\bold{EXEMPLO DE RESPOSTA}}\\blank[1mm]\\starttabulate[|cw(8mm)|c|c|c|c|c|]\n\\NC \\NC A \\NC B \\NC C \\NC D \\NC E \\NC\\NR\n\\NC 01 \\NC ${answerBubble('A', true)} \\NC ${answerBubble('B')} \\NC ${answerBubble('C')} \\NC ${answerBubble('D')} \\NC ${answerBubble('E')} \\NC\\NR\n\\NC 02 \\NC ${answerBubble('A')} \\NC ${answerBubble('B')} \\NC ${answerBubble('C', true)} \\NC ${answerBubble('D')} \\NC ${answerBubble('E')} \\NC\\NR\n\\stoptabulate}`;
    const answerSheet =
      mode === 'student'
        ? `\\page
\\setupheadertexts[]
\\setuppagenumbering[state=stop]
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]
\\blank[small]
${answerHeader}
\\blank[small]
\\midaligned{\\tfc\\bold{FOLHA DE RESPOSTAS}}
\\blank[small]
\\starttabulate[|p(.76\\textwidth)|p(.2\\textwidth)|]
\\NC Escola: \\NC Data: ${assessmentDate || ''} \\NC\\NR
\\NC Nome do(a) estudante: ${candidateName || ''} \\NC Série: ${grade} \\NC\\NR
\\NC Turma: ${className || ''} \\quad Número: ${candidateNumber || ''} \\NC Versão: ${version} \\NC\\NR
\\stoptabulate
\\blank[medium]
\\hbox to \\textwidth{\\vbox{\\hsize=.5\\textwidth\\switchtobodyfont[8pt]\\bold{COMO PREENCHER}\\blank[1mm]\n• Marque somente uma alternativa por questão.\\par\n• Preencha completamente o círculo com caneta preta ou azul.\\par\n• Não rasure, não dobre e não danifique o QR Code ou as marcas de alinhamento.}\\hfill${example}}
\\blank[big]
\\hbox to \\textwidth{${responseBlocks(questionCount)}}
\\vfill
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]`
        : '';

    return `% Gerado automaticamente pelo Modelo 3. Não editar.
\\mainlanguage[pt]
\\usemodule[basicexam][mode=student]
\\usemodule[units]
\\def\\lqd{\\m{\\char"1D4C1}}
\\def\\halfr{\\frac[vfactor=500, method=horizontal]{1}{2}}
\\setupunittext[liter=L]
\\setupformulas[align=flushleft]
\\setupquestion[question][option={Cr:num,packed,joinedup,continue}]
\\setupchoice[option={a,packed},style=\\italicface,stopper=)\\removeunwantedspaces\\space]
\\define[1]\\HabilidadeBNCC{{\\switchtobodyfont[cursor]#1}}
\\define[1]\\DescritorSAEB{{\\switchtobodyfont[cursor]#1}}
\\definecolor[modelthreeink][s=.18]
\\definecolor[modelthreerule][s=.62]
\\definecolor[modelthreegreen][r=.12,g=.62,b=.35]
\\definecolor[modelthreeyellow][r=.95,g=.7,b=.12]
\\definecolor[modelthreeblue][r=.2,g=.45,b=.85]
\\def\\modelthreeline{\\hbox to \\textwidth{\\color[modelthreegreen]{\\blackrule[width=.33\\textwidth,height=1.2pt]}\\hss\\color[modelthreeyellow]{\\blackrule[width=.34\\textwidth,height=1.2pt]}\\hss\\color[modelthreeblue]{\\blackrule[width=.33\\textwidth,height=1.2pt]}}}
\\def\\ModelThreeHeader{${compactHeader}}
\\def\\ModelThreeFooterLeft{{\\switchtobodyfont[7pt]${institution} \\quad ${title}}}
\\def\\ModelThreeFooterRight{{\\switchtobodyfont[7pt]Página \\pagenumber}}
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=27mm,header=18mm,headerdistance=3mm,backspace=13mm,width=middle,height=middle,footer=8mm,footerdistance=3mm]
\\setupheadertexts[\\ModelThreeHeader]
\\setupfootertexts[\\ModelThreeFooterLeft][\\ModelThreeFooterRight]
\\setuppagenumbering[location=]
\\setupalign[nothyphenated,hz,hanging,tolerant,stretch]
\\starttext
${mode === 'answer-key' ? `\\setupheadertexts[]\\midaligned{\\tfb\\bold{${title}}}\\blank[medium]` : ''}
${content}
${answerSheet}
\\stoptext
`;
  },
});
