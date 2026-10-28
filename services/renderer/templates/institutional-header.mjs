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
  const qrGraphic = headerQr && qrFileName
    ? `picture q; q := externalfigure "${qrFileName}" scaled 0.65; draw q shifted (15.0cm,1.35cm);`
    : '';
  const logoGraphic = logoFileName
    ? `draw externalfigure "${logoFileName}" scaled 0.45 shifted (0.2cm,0.2cm);`
    : '';

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
label.rt(btex \\switchtobodyfont[8pt]\\ss ${candidateName || ''} etex, (x+0.2cm,1.85cm));
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
}) {
  const logoGraphic = logoFileName
    ? `draw externalfigure "${logoFileName}" scaled 0.15 shifted (0.2cm,2.0cm);`
    : '';
  const qrGraphic = qrFileName
    ? `picture q; q := externalfigure "${qrFileName}" scaled 0.75; draw q shifted (14.85cm,1.55cm);`
    : '';

  return `\\startMPcode
prologues := 3;
numeric W,H; W := 16.5cm; H := 3.2cm;
path p; p := unitsquare xscaled W yscaled H;
fill p withcolor (0.96,0.96,0.96);
draw p withpen pencircle scaled .8pt;
${logoGraphic}
${qrGraphic}
label.top(btex \\switchtobodyfont[10pt]\\bold \\WORD \\ss ${institution} etex, (8.25cm,2.6cm));
draw (0.25cm,1.35cm)--(16.25cm,1.35cm) withcolor .55white;

label.rt(btex \\switchtobodyfont[7.5pt]\\ss ALUNO(A): etex, (0.35cm,1.08cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${candidateName || ''} etex, (1.5cm,1.08cm));
draw (1.45cm,0.93cm)--(12.6cm,0.93cm);
label.rt(btex \\switchtobodyfont[7.5pt]\\ss Nº: etex, (13.05cm,1.08cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${candidateNumber || ''} etex, (13.5cm,1.08cm));
draw (13.65cm,0.93cm)--(16.0cm,0.93cm);

label.rt(btex \\switchtobodyfont[7.5pt]\\ss DISCIPLINA: etex, (0.35cm,0.64cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${subjects || ''} etex, (2.0cm,0.64cm));
draw (1.95cm,0.50cm)--(8.25cm,0.50cm);
label.rt(btex \\switchtobodyfont[7.5pt]\\ss SÉRIE: etex, (8.65cm,0.64cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${grade || ''} etex, (9.48cm,0.64cm));
draw (9.4cm,0.50cm)--(11.55cm,0.50cm);
label.rt(btex \\switchtobodyfont[7.5pt]\\ss TURMA: etex, (11.85cm,0.64cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${className || ''} etex, (12.95cm,0.64cm));
draw (12.7cm,0.50cm)--(16.0cm,0.50cm);

label.rt(btex \\switchtobodyfont[7.5pt]\\ss PROFESSOR(A): etex, (0.35cm,0.22cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${teacherName || ''} etex, (2.35cm,0.22cm));
draw (2.3cm,0.08cm)--(8.25cm,0.08cm);
label.rt(btex \\switchtobodyfont[7.5pt]\\ss PERÍODO: etex, (8.65cm,0.22cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${term || ''} etex, (10.0cm,0.22cm));
draw (9.85cm,0.08cm)--(12.15cm,0.08cm);
label.rt(btex \\switchtobodyfont[7.5pt]\\ss DATA: etex, (12.45cm,0.22cm));
label.rt(btex \\switchtobodyfont[8pt]\\ss ${assessmentDate || ''} etex, (13.35cm,0.22cm));
draw (13.05cm,0.08cm)--(16.0cm,0.08cm);
\\stopMPcode`;
}
