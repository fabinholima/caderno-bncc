const escapeContext = (value = '') =>
  String(value)
    .replaceAll('\\', '\\letterbackslash ')
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');

const number = (value) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
    Number(value) || 0,
  );

function barChart(title, values) {
  const items = values.slice(0, 15);
  if (!items.length)
    return `\\subject{${escapeContext(title)}}\n\\framed[frame=off,background=color,backgroundcolor=lightgray,width=broad,align=middle]{Sem dados suficientes.}`;
  const height = Math.max(34, items.length * 9 + 10);
  const bars = items
    .map((item, index) => {
      const y = height - 10 - index * 9;
      const width = Math.max(0, Math.min(100, Number(item.percentage) || 0));
      return `fill unitsquare xyscaled (${width}mm,5mm) shifted (0,${y}mm) withcolor .35white;
label.lft(textext("${escapeContext(item.code)}"),(0,${y + 2.5}mm));
label.rt(textext("${number(width)}\\%"),(${width}mm,${y + 2.5}mm));`;
    })
    .join('\n');
  return `\\subject{${escapeContext(title)}}
\\startMPcode
numeric w; w := 100mm;
draw (0,0)--(w,0) withcolor .75white;
draw (40mm,0)--(40mm,${height}mm) dashed evenly withcolor .8white;
draw (60mm,0)--(60mm,${height}mm) dashed evenly withcolor .7white;
draw (80mm,0)--(80mm,${height}mm) dashed evenly withcolor .6white;
${bars}
setbounds currentpicture to unitsquare xyscaled (122mm,${height}mm) shifted (-20mm,0);
\\stopMPcode`;
}

function performanceTable(title, items) {
  const rows = items
    .map(
      (item) => `\\bTR
\\bTD ${escapeContext(item.code)} \\eTD
\\bTD ${escapeContext(item.topic || '')} \\eTD
\\bTD[align=middle] ${item.correct}/${item.validAnswers} \\eTD
\\bTD[align=middle] ${number(item.percentage)}\\% \\eTD
\\bTD ${escapeContext(item.classification)} \\eTD
\\eTR`,
    )
    .join('\n');
  return `\\subject{${escapeContext(title)}}
\\bTABLE[split=yes,option=stretch]
\\bTABLEhead
\\bTR[background=color,backgroundcolor=lightgray]
\\bTH Código \\eTH \\bTH Tema \\eTH \\bTH Acertos \\eTH \\bTH Resultado \\eTH \\bTH Diagnóstico \\eTH
\\eTR
\\eTABLEhead
\\bTABLEbody
${rows || '\\bTR\\bTD[nc=5,align=middle] Sem dados suficientes. \\eTD\\eTR'}
\\eTABLEbody
\\eTABLE`;
}

export function renderClassReport(snapshot) {
  if (snapshot?.schemaVersion !== '1.0' || !snapshot.application)
    throw new Error('Snapshot de relatório inválido.');
  const summary = snapshot.summary ?? {};
  const skills = snapshot.skills ?? [];
  const descriptors = snapshot.saebDescriptors ?? [];
  return `% Relatório estatístico imutável — class-report-v1
\\setuppapersize[A4]
\\setupbodyfont[plex,10pt]
\\setuplayout[topspace=14mm,backspace=16mm,width=middle,height=middle]
\\definecolor[lightgray][s=.92]
\\setupinteraction[state=start]
\\starttext
\\midaligned{\\tfc Relatório pedagógico da turma}
\\blank[small]
\\midaligned{\\bf ${escapeContext(snapshot.application.title)}}
\\midaligned{${escapeContext(snapshot.application.className)} \\quad ${escapeContext(snapshot.application.grade)} \\quad ${escapeContext(snapshot.application.schoolYear)}}
\\blank[big]

\\startcombination[5*1]
{\\framed[width=.18\\textwidth,frame=on,align=middle]{\\tfa ${summary.students ?? 0}\\crlf\\tfx Alunos}}{}
{\\framed[width=.18\\textwidth,frame=on,align=middle]{\\tfa ${summary.corrected ?? 0}\\crlf\\tfx Corrigidos}}{}
{\\framed[width=.18\\textwidth,frame=on,align=middle]{\\tfa ${number(summary.averagePercentage)}\\%\\crlf\\tfx Média}}{}
{\\framed[width=.18\\textwidth,frame=on,align=middle]{\\tfa ${number(summary.medianPercentage)}\\%\\crlf\\tfx Mediana}}{}
{\\framed[width=.18\\textwidth,frame=on,align=middle]{\\tfa ${number(summary.standardDeviation)}\\crlf\\tfx Desvio-padrão}}{}
\\stopcombination

${barChart('Desempenho por habilidade BNCC', skills)}
${barChart('Desempenho por descritor SAEB', descriptors)}
${performanceTable('Habilidades BNCC', skills)}
${performanceTable('Descritores SAEB', descriptors)}

\\subject{Critério de leitura}
As faixas usadas pela instituição são: Consolidado (80--100\\%), Adequado (60--79,9\\%), Em desenvolvimento (40--59,9\\%) e Requer intervenção (abaixo de 40\\%). O número de respostas válidas deve ser considerado junto do percentual.

\\blank[big]
\\tfx Snapshot v${escapeContext(snapshot.schemaVersion)} gerado em ${escapeContext(snapshot.generatedAt)}.
\\stoptext
`;
}

export function renderStudentReport(snapshot) {
  if (
    snapshot?.schemaVersion !== '1.0' ||
    snapshot?.scope?.type !== 'student' ||
    !snapshot.student
  )
    throw new Error('Snapshot de relatório individual inválido.');
  const summary = snapshot.summary ?? {};
  const questionRows = (snapshot.questions ?? [])
    .map(
      (item) => `\\bTR
\\bTD[align=middle] ${item.questionNumber} \\eTD
\\bTD ${escapeContext(
        item.status === 'correct'
          ? 'Acerto'
          : item.status === 'incorrect'
            ? 'Erro'
            : item.status === 'unanswered'
              ? 'Em branco'
              : 'Revisão manual',
      )} \\eTD
\\bTD ${escapeContext((item.selectedLabels ?? []).join(', ') || '—')} \\eTD
\\bTD ${escapeContext((item.correctLabels ?? []).join(', ') || '—')} \\eTD
\\bTD ${escapeContext((item.skills ?? []).map((value) => value.code).join(', ') || '—')} \\eTD
\\bTD ${escapeContext((item.saebDescriptors ?? []).map((value) => value.code).join(', ') || '—')} \\eTD
\\eTR`,
    )
    .join('\n');
  return `% Relatório individual imutável — student-report-v1
\\setuppapersize[A4]
\\setupbodyfont[plex,10pt]
\\setuplayout[topspace=14mm,backspace=16mm,width=middle,height=middle]
\\definecolor[lightgray][s=.92]
\\starttext
\\midaligned{\\tfc Relatório individual de aprendizagem}
\\blank[small]
\\midaligned{\\bf ${escapeContext(snapshot.student.name)}}
\\midaligned{${escapeContext(snapshot.application.title)} \\quad ${escapeContext(snapshot.application.className)} \\quad Versão ${escapeContext(snapshot.student.versionCode)}}
\\blank[big]

\\startcombination[5*1]
{\\framed[width=.18\\textwidth,align=middle]{\\tfa ${number(summary.percentage)}\\%\\crlf\\tfx Resultado}}{}
{\\framed[width=.18\\textwidth,align=middle]{\\tfa ${number(summary.classAveragePercentage)}\\%\\crlf\\tfx Média da turma}}{}
{\\framed[width=.18\\textwidth,align=middle]{\\tfa ${summary.correct ?? 0}\\crlf\\tfx Acertos}}{}
{\\framed[width=.18\\textwidth,align=middle]{\\tfa ${summary.incorrect ?? 0}\\crlf\\tfx Erros}}{}
{\\framed[width=.18\\textwidth,align=middle]{\\tfa ${summary.unanswered ?? 0}\\crlf\\tfx Em branco}}{}
\\stopcombination

${barChart('Habilidades BNCC', snapshot.skills ?? [])}
${barChart('Descritores SAEB', snapshot.saebDescriptors ?? [])}
${barChart(
  'Competências BNCC',
  (snapshot.competencies ?? []).map((item) => ({
    ...item,
    code: `Competência ${item.number}`,
  })),
)}

\\subject{Resultado por questão}
\\bTABLE[split=yes,option=stretch]
\\bTABLEhead
\\bTR[background=color,backgroundcolor=lightgray]
\\bTH Questão \\eTH \\bTH Situação \\eTH \\bTH Marcada \\eTH \\bTH Gabarito \\eTH \\bTH BNCC \\eTH \\bTH SAEB \\eTH
\\eTR
\\eTABLEhead
\\bTABLEbody
${questionRows}
\\eTABLEbody
\\eTABLE

\\subject{Leitura pedagógica}
O resultado individual está ${summary.differenceFromClass >= 0 ? 'acima' : 'abaixo'} da média da turma em ${number(Math.abs(summary.differenceFromClass))} pontos percentuais. Percentuais por habilidade e descritor devem ser interpretados junto da quantidade de questões utilizadas como evidência.

\\blank[big]
\\tfx Snapshot v${escapeContext(snapshot.schemaVersion)} gerado em ${escapeContext(snapshot.generatedAt)}.
\\stoptext
`;
}
