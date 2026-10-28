import {
  answerCardHeaderPreamble,
  renderAnswerCardHeader,
} from './answer-card-header.mjs';
import { fiveOptionAnswerSheet } from './five-option-answer-grid.mjs';
import { renderInstitutionalHeader } from './institutional-header.mjs';

export const simulatedExamV1 = Object.freeze({
  id: 'simulado-v1',
  render(data) {
    const {
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
      previewOnly = false,
      points,
      candidate,
      candidateName,
      candidateNumber,
      content,
      subjects,
      transcriptionPhrase,
      instructions,
    } = data;
    if (qrPayload && !/^CBS?1:[0-9a-f-]{36}:[0-9a-f]{20}$/.test(qrPayload))
      throw new Error('Identificador QR inválido.');
    if (mode === 'student' && Number(questionCount) > 90)
      throw new Error('O layout de simulado aceita no máximo 90 questões.');
    const qr = qrFileName
      ? `\\externalfigure[${qrFileName}][width=19mm,height=19mm]`
      : '';
    const examHeader = renderInstitutionalHeader({
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
    });
    const answerCardHeader = renderAnswerCardHeader({
      institution,
      title,
      grade,
      className,
      qr,
    });
    const details = [
      teacherName && `Professor(a): ${teacherName}`,
      className && `Turma: ${className}`,
      term && `Período: ${term}`,
      assessmentDate && `Data: ${assessmentDate}`,
    ]
      .filter(Boolean)
      .join(' \\quad ');
    const instructionItems = (
      instructions?.length
        ? instructions
        : [
            'Leia atentamente cada questão e todas as alternativas.',
            'Marque somente uma alternativa em cada questão.',
          ]
    )
      .map((instruction) => `\\item ${instruction}`)
      .join('\n');
    const cover =
      mode === 'student' && !previewOnly
        ? `\\startframedtext[width=\\textwidth,framecolor=simuladoaccent,background=color,backgroundcolor=simuladobackground,corner=round,offset=4mm]
${examHeader}
\\blank[small]
\\midaligned{\\tfd\\bold{${title}}}
\\midaligned{${grade} \\quad Valor: ${points}}
${details ? `\\blank[small]\\midaligned{${details}}` : ''}
\\stopframedtext
\\blank[medium]
\\framed[width=\\textwidth,align=middle,framecolor=simuladoaccent,offset=3mm]{
\\bold{FRASE PARA TRANSCRIÇÃO}\\blank[small]
${transcriptionPhrase || 'Transcreva a frase indicada pelo professor.'}\\blank[small]
\\thinrules[n=1,width=.92\\textwidth]}
\\blank[medium]
\\startframedtext[width=\\textwidth,framecolor=simuladoaccent,offset=4mm]
\\midaligned{\\tfc\\bold{INSTRUÇÕES DO SIMULADO}}
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
\\page`
        : '';
    const answerSheet =
      mode === 'student' && !previewOnly
        ? `\\page
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]
\\blank[small]
${answerCardHeader}
\\blank[small]
\\color[simuladoaccent]{\\bold{INSTRUÇÕES}}\\par
\\switchtobodyfont[8pt]Preencha completamente apenas um círculo por questão, usando caneta preta ou azul. Não dobre, rasure nem danifique o QR Code e as marcas pretas. Em caso de alteração, solicite orientação ao aplicador.\\par
\\blank[small]
\\framed[width=\\textwidth,framecolor=simuladoaccent,offset=0mm]{${fiveOptionAnswerSheet(questionCount)}}
\\vfill
\\noindent\\blackrule[width=7mm,height=7mm]\\hfill\\blackrule[width=7mm,height=7mm]`
        : '';
    return `% Gerado automaticamente pelo layout simulado-v1. Não editar.
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
\\definecolor[simuladoaccent][s=.25]
\\definecolor[simuladobackground][s=.92]
\\definecolor[simuladocolumnrule][s=.65]
\\definecolor[answercardrule][s=.35]
${answerCardHeaderPreamble}
\\setuppapersize[${paper}]
\\setupbodyfont[${font},${fontSize}pt]
\\setuplayout[topspace=13mm,backspace=14mm,width=middle,height=middle]
\\setuppagenumbering[location={footer,right},style=\\tfx]
\\setupalign[nothyphenated,hz,hanging,tolerant,stretch]
\\setuphead[subject][style=\\bf, before={\\blank[medium]}, after={\\blank[small]}]
\\starttext
${cover}
${examHeader}
\\blank[small]
\\midaligned{\\tfb\\bold{${title}}}
\\midaligned{${grade} \\quad Valor: ${points}}
${details ? `\\blank[small]\\midaligned{${details}}` : ''}
${candidate}
\\blank[big]
${content}
${answerSheet}
\\stoptext
`;
  },
});
