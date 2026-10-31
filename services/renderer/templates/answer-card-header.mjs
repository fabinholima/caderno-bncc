// Identificação do aluno no cartão-resposta. O nome vem do cadastro da turma
// (cartões gerados pela aplicação, com QR individual); o aluno só preenche a
// assinatura. Sem aluno vinculado (PDF da versão), o cartão avisa que não está
// ligado a ninguém em vez de abrir um campo para o nome.
export function renderAnswerCardStudent({ candidateName, candidateNumber, className, grade, version }) {
  const details = [
    candidateNumber ? `Nº ${candidateNumber}` : '',
    className ? `Turma ${className}` : '',
    grade || '',
    version ? `Versão ${version}` : '',
  ].filter(Boolean).join(' \\enspace·\\enspace ');
  const student = candidateName
    ? `{\\tfx\\bold{Aluno(a):}}\\hskip 2mm{\\tfa\\bold{${candidateName}}}\\hfill{\\tfx ${details}}`
    : `{\\tfx\\bold{Aluno(a):}}\\hskip 2mm{\\tfx\\color[darkgray]{Cartão sem aluno vinculado. Os cartões com o nome de cada aluno são gerados na aplicação da turma.}}`;
  return `\\framed[width=\\textwidth,frame=on,rulethickness=.6pt,offset=2.5mm,align=normal]{%
\\dontleavehmode\\hbox to \\hsize{${student}}\\par
\\blank[3mm]
\\dontleavehmode\\hbox to \\hsize{{\\tfx\\bold{Assinatura do(a) aluno(a):}}\\hskip 2mm\\leaders\\hrule height .4pt\\hfill}}`;
}

export function renderAnswerCardHeader({
  institution,
  title,
  grade,
  className,
  candidateName,
  candidateNumber,
  version,
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
${renderAnswerCardStudent({ candidateName, candidateNumber, className, version })}`;
}
