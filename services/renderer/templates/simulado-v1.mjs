const bubble = (label) =>
  `\\framed[width=3.8mm,height=3.8mm,corner=round,radius=1.9mm,offset=overlay,framecolor=simuladoaccent]{\\switchtobodyfont[6pt]${label}}`;

function answerBlock(start, end) {
  const rows = Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => {
    const number = start + offset;
    return `\\NC \\switchtobodyfont[7pt]${String(number).padStart(2, '0')} \\NC ${bubble('A')} \\NC ${bubble('B')} \\NC ${bubble('C')} \\NC ${bubble('D')} \\NC ${bubble('E')} \\NC\\NR`;
  }).join('\n');
  return `\\vtop{\\hsize=25mm\\starttabulate[|cw(3mm)|c|c|c|c|c|]\n${rows}\n\\stoptabulate}`;
}

export const simulatedExamV1 = Object.freeze({
  id: 'simulado-v1',
  render(data) {
    const {
      mode, paper, institution, logoFileName, teacherName, className, term,
      assessmentDate, font, fontSize, title, grade, version, qrPayload,
      qrFileName, questionCount, points, candidate, candidateName,
      candidateNumber, content, transcriptionPhrase, instructions,
    } = data;
    if (qrPayload && !/^CBS?1:[0-9a-f-]{36}:[0-9a-f]{20}$/.test(qrPayload))
      throw new Error('Identificador QR inválido.');
    if (mode === 'student' && Number(questionCount) > 90)
      throw new Error('O layout de simulado aceita no máximo 90 questões.');
    const logo = logoFileName
      ? `\\externalfigure[${logoFileName}][height=16mm,width=28mm,factor=fit]`
      : '';
    const qr = qrFileName
      ? `\\externalfigure[${qrFileName}][width=19mm,height=19mm]`
      : '';
    const details = [teacherName && `Professor(a): ${teacherName}`, className && `Turma: ${className}`, term && `Período: ${term}`, assessmentDate && `Data: ${assessmentDate}`].filter(Boolean).join(' \\quad ');
    const instructionItems = (instructions?.length ? instructions : [
      'Leia atentamente cada questão e todas as alternativas.',
      'Marque somente uma alternativa em cada questão.',
    ]).map((instruction) => `\\item ${instruction}`).join('\n');
    const cover = mode === 'student' ? `\\startframedtext[width=\\textwidth,framecolor=simuladoaccent,background=color,backgroundcolor=simuladobackground,corner=round,offset=4mm]
\\startcombination[2*1]
{${logo}} {}
{\\framed[frame=off,width=\\dimexpr\\textwidth-34mm\\relax,align=middle]{\\tfd\\bf ${institution}}} {}
\\stopcombination
\\blank[small]
\\midaligned{\\tfd\\bf ${title}}
\\midaligned{${grade} \\quad Versão ${version} \\quad Valor: ${points}}
${details ? `\\blank[small]\\midaligned{${details}}` : ''}
\\stopframedtext
\\blank[medium]
\\framed[width=\\textwidth,align=middle,framecolor=simuladoaccent,offset=3mm]{
{\\bf FRASE PARA TRANSCRIÇÃO}\\blank[small]
${transcriptionPhrase || 'Transcreva a frase indicada pelo professor.'}\\blank[small]
\\thinrules[n=1,width=.92\\textwidth]}
\\blank[medium]
\\startframedtext[width=\\textwidth,framecolor=simuladoaccent,offset=4mm]
\\midaligned{\\tfc\\bf INSTRUÇÕES DO SIMULADO}
\\blank[small]
\\startitemize[n,packed]
${instructionItems}
\\stopitemize
\\stopframedtext
\\vfill
\\framed[width=\\textwidth,align=flushleft,framecolor=simuladoaccent,offset=3mm]{
Instituição: ${institution}\\par
Aluno(a): \\thinrules[n=1,width=10cm]\\par
Turma: ${className || '\\thinrules[n=1,width=35mm]'} \\quad Data: ${assessmentDate || '\\thinrules[n=1,width=30mm]'}}
\\page` : '';
    const columns = Math.max(1, Math.min(5, Math.ceil(Number(questionCount) / 18)));
    const rowsPerColumn = Math.ceil(Number(questionCount) / columns);
    const blocks = Array.from({ length: columns }, (_, column) => {
      const start = column * rowsPerColumn + 1;
      return answerBlock(start, Math.min(start + rowsPerColumn - 1, Number(questionCount)));
    }).join('\\hfill\n');
    const answerSheet = mode === 'student' && qrPayload ? `\\page
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]
\\blank[small]
\\startframedtext[width=\\textwidth,framecolor=simuladoaccent,corner=round,offset=3mm]
\\bTABLE[frame=off]
\\bTR \\bTD[width=.72\\textwidth] {\\tfc\\bf CARTÃO-RESPOSTA — SIMULADO}\\blank[small]
Nome: ${candidateName || '\\thinrules[n=1,width=10cm]'}\\par
Nº/Matrícula: ${candidateNumber || '\\thinrules[n=1,width=35mm]'} \\quad Turma: ${className || '\\thinrules[n=1,width=30mm]'}\\par
Data de nascimento: \\thinrules[n=1,width=35mm]\\par
Assinatura: \\thinrules[n=1,width=85mm]
\\eTD \\bTD[align=middle] ${qr}\\par Versão ${version} \\eTD \\eTR
\\eTABLE
\\stopframedtext
\\blank[small]
{\\bf\\color[simuladoaccent]{INSTRUÇÕES}}\\par
\\switchtobodyfont[8pt]Preencha completamente apenas um círculo por questão, usando caneta preta ou azul. Não dobre, rasure nem danifique o QR Code e as marcas pretas. Em caso de alteração, solicite orientação ao aplicador.\\par
\\blank[small]
\\framed[width=\\textwidth,framecolor=simuladoaccent,offset=0mm]{\\hbox to \\textwidth{${blocks}}}
\\vfill
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]` : '';
    return `% Gerado automaticamente pelo layout simulado-v1. Não editar.
\\usemodule[basicexam][mode=student]
\\usemodule[units]
\\setupformulas[align=flushleft]
\\setupquestion[question][option={Cr:num,packed,joinedup,continue}]
\\setupchoice
  [option={a,packed},
   style=\\italicface,
   stopper=)\\removeunwantedspaces\\space]
\\define[1]\\HabilidadeBNCC{{\\switchtobodyfont[cursor]#1}}
\\definecolor[simuladoaccent][s=.25]
\\definecolor[simuladobackground][s=.92]
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=13mm,backspace=14mm,width=middle,height=middle]
\\starttext
${cover}
\\startcombination[2*1]
{${logo}} {}
{\\framed[frame=off,width=\\dimexpr\\textwidth-32mm\\relax,align=middle]{\\tfd\\bf ${institution}}} {}
\\stopcombination
\\blank[small]
\\midaligned{\\tfb ${title}}
\\midaligned{${grade} \\quad Versão ${version} \\quad Valor: ${points}}
${details ? `\\blank[small]\\midaligned{${details}}` : ''}
${candidate}
\\blank[big]
${content}
${answerSheet}
\\stoptext
`;
  },
});
