// Identificação do aluno no cartão-resposta: o nome, em maiúsculas, vem do
// cadastro da turma (cartões gerados pela aplicação, com QR individual) e o
// aluno só preenche a assinatura. Sem aluno vinculado (PDF da versão), o
// cartão avisa que não está ligado a ninguém em vez de abrir um campo de nome.
export function renderAnswerCardStudent({ candidateName }) {
  // Exemplo:   FABIO DE SOUZA
  //            Assinatura: ______________________________
  const student = candidateName
    ? `{\\tfa\\bold{\\WORD{${candidateName}}}}`
    : `{\\tfx\\color[darkgray]{Cartão sem aluno vinculado. Os cartões com o nome de cada aluno são gerados na aplicação da turma.}}`;
  return `\\framed[width=\\textwidth,frame=on,rulethickness=.6pt,offset=2.5mm,align=normal]{%
\\dontleavehmode\\hbox to \\hsize{${student}\\hss}\\par
\\blank[4mm]
\\dontleavehmode\\hbox to \\hsize{{\\tfx\\bold{Assinatura:}}\\hskip 2mm\\leaders\\hrule height .4pt\\hfill}}`;
}

export function renderAnswerCardHeader({
  institution,
  title,
  grade,
  candidateName,
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
${renderAnswerCardStudent({ candidateName })}`;
}
