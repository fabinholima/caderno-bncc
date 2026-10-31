import { fiveOptionAnswerBlock, fiveOptionAnswerSheet } from './five-option-answer-grid.mjs';
import { renderCompactExamHeader } from './institutional-header.mjs';
import { renderAnswerCardStudent } from './answer-card-header.mjs';

export const twoColumnExamV1 = Object.freeze({
  id: 'caderno-duas-colunas-v1',
  render(data) {
    const {
      mode,
      paper,
      institution,
      logoFileName,
      className,
      teacherName,
      term,
      subjects,
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
    const compactHeader = renderCompactExamHeader({
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
    });
    const answerHeader = `\\hbox to \\textwidth{${logo}\\hfill\\framed[frame=off,width=105mm,align=middle]{\\tfc\\bold{${institution}}\\par\\switchtobodyfont[8pt]${title}}\\hfill\\framed[frame=off,width=20mm,align=middle]{${qr}}}`;
    const example = `\\vbox{\\hsize=55mm\\framed[frame=off,width=55mm,align=middle]{\\switchtobodyfont[8pt]\\bold{EXEMPLO DE RESPOSTA}}\\blank[1mm]${fiveOptionAnswerBlock(1, 2, { 1: 'A', 2: 'C' })}}`;
    const answerSheet =
      mode === 'student'
        ? `\\page
\\setupheadertexts[]
\\setuplayout[topspace=35mm,header=32mm,headerdistance=3mm,backspace=13mm,width=middle,height=middle,footer=8mm,footerdistance=3mm]
\\setuppagenumbering[state=stop]
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]
\\blank[small]
${answerHeader}
\\blank[small]
\\midaligned{\\tfc\\bold{FOLHA DE RESPOSTAS}}
\\blank[small]
${renderAnswerCardStudent({ candidateName, candidateNumber, className, grade, version })}
\\blank[medium]
\\hbox to \\textwidth{\\vbox{\\hsize=.5\\textwidth\\switchtobodyfont[8pt]\\bold{COMO PREENCHER}\\blank[1mm]\n• Marque somente uma alternativa por questão.\\par\n• Preencha completamente o círculo com caneta preta ou azul.\\par\n• Não rasure, não dobre e não danifique o QR Code ou as marcas de alinhamento.}\\hfill${example}}
\\blank[small]
${fiveOptionAnswerSheet(questionCount)}
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
\\definemathmatrix[pmatrix][matrix:parentheses][simplecommand=pmatrix]
\\definemathmatrix[bmatrix][matrix:brackets][simplecommand=bmatrix]
\\definemathmatrix[determinant][matrix:bars][simplecommand=thedeterminant]
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
\\long\\def\\ModelThreeHeader{${compactHeader}}
\\def\\ModelThreeFooterLeft{{\\switchtobodyfont[7pt]${institution} \\quad ${title}}}
\\def\\ModelThreeFooterRight{{\\switchtobodyfont[7pt]Página \\pagenumber}}
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=10mm,header=33mm,headerdistance=2mm,backspace=13mm,width=middle,height=middle,footer=8mm,footerdistance=3mm]
\\setupheadertexts[\\ModelThreeHeader]
\\setupfootertexts[\\ModelThreeFooterLeft][\\ModelThreeFooterRight]
\\setuppagenumbering[location=]
\\setupalign[hyphenated,hz,hanging,tolerant,stretch]
\\setuphead[subject][style=\\bf, before={\\blank[medium]}, after={\\blank[small]}]
\\starttext
${mode === 'answer-key' ? `\\setupheadertexts[]\\midaligned{\\tfb\\bold{${title}}}\\blank[medium]` : ''}
${content}
${answerSheet}
\\stoptext
`;
  },
});
