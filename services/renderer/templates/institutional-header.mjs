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
