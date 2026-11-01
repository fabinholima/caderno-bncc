// Identificação do aluno no cartão-resposta: o nome, em maiúsculas, vem do
// cadastro da turma (cartões gerados pela aplicação, com QR individual) e o
// aluno só preenche a assinatura. Sem aluno vinculado (PDF da versão), o
// cartão avisa que não está ligado a ninguém em vez de abrir um campo de nome.
// candidatePhoto: null (sem foto) ou { fileName } quando a prova pediu a foto;
// fileName vazio = aluno sem foto cadastrada (fica o espaço "sem foto").
function photoBox(candidatePhoto) {
  if (!candidatePhoto) return '';
  const content = candidatePhoto.fileName
    ? `\\externalfigure[${candidatePhoto.fileName}][width=18mm,height=24mm,factor=fit]`
    : '{\\switchtobodyfont[6pt]\\color[darkgray]{sem foto}}';
  return `\\framed[width=20mm,height=26mm,offset=1mm,align={middle,lohi},rulethickness=.4pt]{${content}}\\hskip 4mm`;
}

export function renderAnswerCardStudent({ candidateName, candidatePhoto = null }) {
  // Exemplo:   [foto]  FABIO DE SOUZA
  //                    Assinatura: ______________________________
  const photo = candidateName ? photoBox(candidatePhoto) : '';
  const student = candidateName
    ? `{\\tfa\\bold{\\WORD{${candidateName}}}}`
    : `{\\tfx\\color[darkgray]{Cartão sem aluno vinculado. Os cartões com o nome de cada aluno são gerados na aplicação da turma.}}`;
  const lines = `\\dontleavehmode\\hbox to \\hsize{${student}\\hss}\\par
\\blank[4mm]
\\dontleavehmode\\hbox to \\hsize{{\\tfx\\bold{Assinatura:}}\\hskip 2mm\\leaders\\hrule height .4pt\\hfill}`;
  if (!photo)
    return `\\framed[width=\\textwidth,frame=on,rulethickness=.6pt,offset=2.5mm,align=normal]{%
${lines}}`;
  // Com foto: foto à esquerda; nome e assinatura ao lado, centralizados na altura.
  return `\\framed[width=\\textwidth,frame=on,rulethickness=.6pt,offset=2.5mm,align=normal]{%
\\dontleavehmode\\hbox to \\hsize{${photo}\\vbox to 26mm{\\hsize=\\dimexpr\\textwidth-34mm\\relax\\vfil
${lines}
\\vfil}\\hss}}`;
}

export function renderAnswerCardHeader({
  institution,
  title,
  grade,
  candidateName,
  candidatePhoto = null,
  qr,
}) {
  return `\\dontleavehmode\\hbox to \\hsize{
\\framed[width=\\dimexpr\\textwidth-27mm\\relax,height=22mm,frame=off,align={middle,lohi}]{
  {\\tfc\\bold{CARTÃO-RESPOSTA}}\\par
  \\blank[1mm]
  {\\tfb\\bold{${institution}}}\\par
  {\\tfx ${title} · ${grade}}
}\\hfill
\\framed[width=22mm,height=22mm,frame=off,align={middle,lohi}]{${qr}}}
\\blank[small]
${renderAnswerCardStudent({ candidateName, candidatePhoto })}`;
}
