import { basicExamV1 } from './basicexam-v1.mjs';
import { compactCardProfile } from '../../../lib/compact-assessment.mjs';

export function compactAnswerCard(profile, qrFileName) {
  const { widthMm, heightMm, markerSizeMm } = profile;
  const pad = 3;
  const commands = [];
  for (const x of [0, widthMm]) for (const y of [0, heightMm]) {
    commands.push(`fill unitsquare scaled ${markerSizeMm}mm shifted (${x + pad - markerSizeMm / 2}mm,${y + pad - markerSizeMm / 2}mm);`);
  }
  for (let col = 0; col < 2; col++) {
    const start = profile.columnStartsMm[col];
    commands.push(`label(textext("{\\switchtobodyfont[8pt]\\bf Q.}"), (${start + pad - 9}mm,${heightMm + pad - 5}mm));`);
    profile.labels.forEach((label, index) => {
      commands.push(`label(textext("{\\switchtobodyfont[8pt]\\bf ${label}}"), (${start + pad + index * profile.columnSpacingMm}mm,${heightMm + pad - 5}mm));`);
    });
    for (let row = 0; row < profile.rowsPerColumn; row++) {
      const number = col * profile.rowsPerColumn + row + 1;
      if (number > profile.questionCount) continue;
      const y = heightMm + pad - profile.firstRowMm - row * profile.rowSpacingMm;
      commands.push(`label(textext("{\\switchtobodyfont[8pt]${String(number).padStart(2, '0')}}"), (${start + pad - 9}mm,${y}mm));`);
      profile.labels.forEach((label, index) => {
        commands.push(`draw fullcircle scaled ${2 * profile.radiusMm}mm shifted (${start + pad + index * profile.columnSpacingMm}mm,${y}mm) withpen pencircle scaled .65pt;`);
        commands.push(`label(textext("{\\switchtobodyfont[5pt]\\bf ${label}}"), (${start + pad + index * profile.columnSpacingMm}mm,${y}mm)) withcolor .55white;`);
      });
    }
  }
  const graphic = `\\startMPcode
${commands.join('\n')}
setbounds currentpicture to unitsquare xscaled ${widthMm + 2 * pad}mm yscaled ${heightMm + 2 * pad}mm;
\\stopMPcode`;
  const qr = qrFileName
    ? `\\externalfigure[${qrFileName}][width=30mm,height=30mm]`
    : '\\framed[width=30mm,height=30mm,align=middle]{\\tfx QR gerado na aplicação}';
  return `\\startframedtext[width=\\textwidth,offset=3mm,rulethickness=.6pt]
{\\switchtobodyfont[9pt]\\bf QUADRO DE RESPOSTAS}\\par
{\\switchtobodyfont[8pt]Preencha completamente uma opção por questão. ${profile.labels.length === 2 ? 'C = certo; E = errado.' : 'Alternativas A, B, C, D e E.'}}\\par
\\blank[2mm]
\\dontleavehmode\\hbox to \\hsize{\\vbox to 48mm{\\vfil${qr}\\vfil}\\hfill\\hbox{${graphic}}}
\\stopframedtext
\\blank[small]`;
}

function renderCompact(options, id) {
  const profile = compactCardProfile(id, Number(options.questionCount));
  const card = options.mode === 'student' && !options.previewOnly
    ? compactAnswerCard(profile, options.qrFileName) : '';
  return basicExamV1.render({
    ...options,
    answerLabels: profile.labels,
    omitAnswerSheet: true,
    headerQr: false,
    compactLayout: true,
    content: `${card}${options.mode === 'student' ? 'Registre as respostas no quadro acima.\\blank[medium]\n' : ''}${options.content}`,
  }).replace('layout basicexam-v1', `layout ${id}`);
}

export const compactExamV1 = Object.freeze({ id: 'compacto-10-v1', render: options => renderCompact(options, 'compacto-10-v1') });
export const compactJudgmentExamV1 = Object.freeze({ id: 'certo-errado-10-v1', render: options => renderCompact(options, 'certo-errado-10-v1') });
