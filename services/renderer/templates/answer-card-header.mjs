export function renderAnswerCardHeader({
  institution,
  title,
  grade,
  className,
  candidateName,
  candidateNumber,
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
\\dontleavehmode\\hbox to \\textwidth{
  {\\tfx\\bold{Aluno(a):} ${candidateName || '\\strut'}}\\hfill
  {\\tfx\\bold{Nº:} ${candidateNumber || '\\strut'}}\\hfill
  {\\tfx\\bold{Turma:} ${className || '\\strut'}}
}\\par
\\blank[small]
\\dontleavehmode{\\tfx\\bold{Assinatura do Aluno:}} \\thinrules[n=1,width=105mm]`;
}
