export function renderInstitutionalHeader({
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
  headerQr = true,
}) {
  const qrGraphic =
    headerQr && qrFileName
      ? `picture q; q := externalfigure "${qrFileName}" scaled 0.65; draw q shifted (15.0cm,1.35cm);`
      : '';
  const logoGraphic = logoFileName
    ? `draw externalfigure "${logoFileName}" scaled 0.45 shifted (0.2cm,0.2cm);`
    : '';

  // Rótulo fixo do MetaPost não quebra linha: nome longo sai daqui e aparece
  // completo na linha "Aluno(a)" do rodapé do simulado.
  const headerName =
    candidateName && candidateName.length > 45 ? '' : candidateName || '';
  return `\\startMPcode
prologues := 3;
numeric W,H,x; W := 16.5cm; H := 2.8cm; x := 5.1cm;
path p; p := unitsquare xscaled W yscaled H;
fill p withcolor (0.96,0.96,0.96);
draw p withpen pencircle scaled .8pt;
${logoGraphic}
${qrGraphic}
label.top(btex \\switchtobodyfont[10pt]\\bold \\WORD \\ss ${institution} etex, (W/2 + 0.5cm,H-0.65cm));

label.lft(btex \\switchtobodyfont[8pt]\\ss ALUNO(A): etex, (x,1.85cm));
draw (x+0.1cm,1.70cm)--(12.4cm,1.70cm);
label.rt(btex \\switchtobodyfont[8pt]\\ss ${headerName} etex, (x+0.2cm,1.85cm));
label.lft(btex \\switchtobodyfont[8pt]\\ss Nº etex, (13.35cm,1.85cm));
draw (13.45cm,1.70cm)--(14.75cm,1.70cm);
label.rt(btex \\switchtobodyfont[8pt]\\ss ${candidateNumber || ''} etex, (13.55cm,1.85cm));

label.lft(btex \\switchtobodyfont[8pt]\\ss DISCIPLINA: etex, (x,1.25cm));
draw (x+0.1cm,1.10cm)--(8.6cm,1.10cm);
label.rt(btex \\switchtobodyfont[8pt]\\ss ${subjects || ''} etex, (x+0.2cm,1.25cm));
label.lft(btex \\switchtobodyfont[8pt]\\ss SÉRIE etex, (9.5cm,1.25cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${grade || ''} etex, (9.65cm,1.25cm));
draw (9.5cm,1.10cm)--(11.8cm,1.10cm);
label.lft(btex \\switchtobodyfont[8pt]\\ss TURMA etex, (12cm,1.25cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${className || ''} etex, (12.1cm,1.25cm));
draw (12cm,1.10cm)--(14.75cm,1.10cm);

label.lft(btex \\switchtobodyfont[8pt]\\ss PROF: etex, (x,0.70cm));
draw (x+0.1cm,0.55cm)--(8.6cm,0.55cm);
label.rt(btex \\switchtobodyfont[8pt]\\ss ${teacherName || ''} etex, (x+0.2cm,0.70cm));
label.lft(btex \\switchtobodyfont[7.5pt]\\ss PERÍODO: etex, (9cm,0.70cm));
label.rt(btex \\switchtobodyfont[7.5pt]\\ss ${term || ''} etex, (9.1cm,0.70cm));
label.lft(btex \\switchtobodyfont[7.5pt]\\ss DATA: etex, (12.5cm,0.70cm));
label.rt(btex \\switchtobodyfont[7.5pt]\\ss ${assessmentDate || ''} etex, (12.6cm,0.70cm));
draw (9cm,0.55cm)--(14.75cm,0.55cm);
\\stopMPcode`;
}

// Cabeçalho compacto da folha da prova (~31 mm), em três linhas:
//  1. logotipo, escola, título e versão, QR code (15 mm, o mesmo tamanho
//     de antes: ele identifica a versão na correção);
//  2. aluno: com aluno vinculado, nome e Nº impressos e só a assinatura para
//     preencher; sem aluno (PDF da versão), linhas para nome e Nº;
//  3. dados já impressos numa linha só (disciplina, série, turma, período,
//     professor) e a data.
export function renderCompactExamHeader({
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
  headerQr = true,
  // Cabeçalho de altura fixa (modelo 3): o nome longo fica na mesma faixa do
  // Nº e da assinatura, com o texto quebrando dentro de uma coluna.
  singleLineName = false,
}) {
  const contentWidth = '\\dimexpr\\textwidth-4mm\\relax';
  const logo = logoFileName
    ? `\\externalfigure[${logoFileName}][width=22mm,height=14mm,factor=fit]`
    : '';
  const qr =
    headerQr && qrFileName
      ? `\\externalfigure[${qrFileName}][width=15mm,height=15mm]`
      : '';
  const examTitle = title || 'PROVA';
  const versionText = version
    ? `\\quad{\\switchtobodyfont[7pt]Versão ${version}}`
    : '';
  // Linha para escrever à mão (ou o valor impresso, quando já existe).
  const line = (value, width) =>
    value
      ? `\\hbox to ${width}{${value}\\hss}`
      : `\\hbox to ${width}{\\leaders\\hrule height .4pt\\hfill}`;
  const details = [
    subjects,
    grade,
    className ? `Turma ${className}` : '',
    term,
    teacherName ? `Professor(a): ${teacherName}` : '',
  ]
    .filter(Boolean)
    .join(' \\enspace·\\enspace ');
  const date = `Data: ${assessmentDate || '\\hbox to 22mm{\\leaders\\hrule height .4pt\\hfill}'}`;
  // Aluno vinculado (prova gerada pela aplicação da turma): nome e número
  // impressos e só a assinatura para preencher. Sem aluno (PDF da versão),
  // ficam as linhas para nome e número.
  // Nome longo não cabe ao lado do Nº e da assinatura: o nome vai numa linha
  // própria (com quebra de texto) e o Nº com a assinatura ficam embaixo.
  const longCandidateName = candidateName && candidateName.length > 34;
  const nameSize =
    candidateName && candidateName.length > 85
      ? '6pt'
      : candidateName && candidateName.length > 60
        ? '7pt'
        : '8pt';
  const studentRow =
    singleLineName && longCandidateName
      ? `\\hbox to ${contentWidth}{\\vtop{\\hsize=\\dimexpr${contentWidth}-100mm\\relax\\noindent\\switchtobodyfont[8pt]\\bold{Aluno(a):}\\hskip 1.5mm{\\switchtobodyfont[${nameSize}]\\bold{${candidateName}}}}\\hfill${candidateNumber ? `\\switchtobodyfont[8pt]\\bold{Nº} ${candidateNumber}\\hskip 4mm` : ''}\\hbox to 60mm{\\switchtobodyfont[8pt]\\bold{Assinatura:}\\hskip 1.5mm\\leaders\\hrule height .4pt\\hfill}}`
      : longCandidateName
        ? `\\vbox{\\hsize=${contentWidth}\\relax\\noindent\\switchtobodyfont[8pt]\\bold{Aluno(a):}\\hskip 1.5mm{\\switchtobodyfont[9pt]\\bold{${candidateName}}}\\par}\\blank[1mm]
\\hbox to ${contentWidth}{\\switchtobodyfont[8pt]${candidateNumber ? `\\bold{Nº} ${candidateNumber}` : ''}\\hfill\\hbox to 95mm{\\bold{Assinatura:}\\hskip 1.5mm\\leaders\\hrule height .4pt\\hfill}}`
        : candidateName
          ? `\\hbox to ${contentWidth}{\\switchtobodyfont[8pt]\\bold{Aluno(a):}\\hskip 1.5mm{\\switchtobodyfont[9pt]\\bold{${candidateName}}}${candidateNumber ? `\\hskip 3mm Nº ${candidateNumber}` : ''}\\hskip 6mm\\bold{Assinatura:}\\hskip 1.5mm\\leaders\\hrule height .4pt\\hfill}`
          : `\\hbox to ${contentWidth}{\\switchtobodyfont[8pt]\\bold{Aluno(a):}\\hskip 1.5mm\\leaders\\hrule height .4pt\\hfill\\hskip 4mm\\bold{Nº}\\hskip 1.5mm${line(candidateNumber, '16mm')}}`;
  const logoWidth = logo ? '25mm' : '0mm';
  const qrWidth = qr ? '18mm' : '0mm';

  return `\\framed[width=\\textwidth,frame=on,rulethickness=.6pt,offset=2mm]{%
\\vbox{%
\\hbox to ${contentWidth}{%
  \\hbox to ${logoWidth}{\\vbox to 15mm{\\vfil\\hbox{${logo}}\\vfil}\\hss}%
  \\vbox to 15mm{\\hsize=\\dimexpr${contentWidth}-${logoWidth}-${qrWidth}\\relax\\vfil
    \\framed[frame=off,width=\\hsize,align=middle,offset=0pt]{\\switchtobodyfont[7pt]\\bold{${institution || ''}}}%
    \\framed[frame=off,width=\\hsize,align=middle,offset=0pt]{\\switchtobodyfont[11pt]\\bold{${examTitle}}${versionText}}%
  \\vfil}%
  \\hbox to ${qrWidth}{\\hss\\vbox to 15mm{\\vfil\\hbox{${qr}}\\vfil}}%
}%
\\blank[2mm]%
${studentRow}%
\\blank[1.5mm]%
\\hbox to ${contentWidth}{\\switchtobodyfont[7pt]\\vtop{\\hsize=\\dimexpr${contentWidth}-34mm\\relax\\setupalign[flushleft,nothyphenated]\\noindent ${details}\\par}\\hfill\\vtop{\\hbox{${date}}}}%
}}`;
}
