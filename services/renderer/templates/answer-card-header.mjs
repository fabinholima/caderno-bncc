export const answerCardHeaderPreamble = `\\startuseMPgraphic{AnswerCardNameGrid}
  numeric cols, w, h;
  cols := 22;
  w := OverlayWidth;
  h := OverlayHeight;
  draw unitsquare xscaled w yscaled h
    withpen pencircle scaled .6pt withcolor \\MPcolor{answercardrule};
  draw (0,h/2)--(w,h/2)
    withpen pencircle scaled .45pt withcolor \\MPcolor{answercardrule};
  for i=1 step 1 until (cols-1):
    draw (i*(w/cols),0)--(i*(w/cols),h)
      withpen pencircle scaled .45pt withcolor \\MPcolor{answercardrule};
  endfor;
\\stopuseMPgraphic
\\defineoverlay[AnswerCardNameGridOverlay][\\useMPgraphic{AnswerCardNameGrid}]`;

export function renderAnswerCardHeader({
  institution,
  title,
  grade,
  className,
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
\\dontleavehmode{\\tfx\\bold{Assinatura do Aluno:}} \\thinrules[n=1,width=105mm]
\\hfill{\\tfx\\bold{Turma:}} ${className || '\\thinrules[n=1,width=25mm]'}\\par
\\blank[small]
\\startframedtext[width=\\textwidth,rulethickness=.6pt,framecolor=answercardrule,offset=2mm]
{\\tfx\\bold{Nome completo do aluno}}
\\blank[1mm]
\\framed[width=\\hsize,height=12mm,background=AnswerCardNameGridOverlay,frame=off]{}
\\stopframedtext`;
}
