const contextEscapes = new Map([
  ['\\', '\\letterbackslash '], ['{', '\\{'], ['}', '\\}'], ['#', '\\#'],
  ['$', '\\$'], ['%', '\\%'], ['&', '\\&'], ['_', '\\_'], ['~', '\\lettertilde '], ['^', '\\letterhat '],
]);

export function escapeContext(value = '') {
  return String(value).replace(/[\\{}#$%&_~^]/g, (character) => contextEscapes.get(character));
}

function richText(nodes = []) {
  return nodes.map((node) => escapeContext(node.text ?? '')).join('\n\n');
}

export function renderAssessment(snapshot) {
  if (snapshot?.schemaVersion !== '1.0' || !Array.isArray(snapshot.questions)) {
    throw new Error('Snapshot de avaliação inválido ou incompatível.');
  }
  const mode = snapshot.render?.mode === 'answer-key' ? 'answer-key' : 'student';
  const questions = snapshot.questions.map((question) => {
    const correct = new Set(question.answer?.correctStableKeys ?? []);
    const choices = (question.alternatives ?? []).map((answer) =>
      `    \\startcitem${correct.has(answer.stableKey) ? '[*]' : ''} ${richText(answer.content)} \\stopcitem`,
    ).join('\n');
    return `\\startquestion[point=${Number(question.points) || 0},showanswer=${mode === 'answer-key' ? 'true' : 'false'}]\n${richText(question.statement)}\n  \\startchoice\n${choices}\n  \\stopchoice\n  \\startanswer\n${richText(question.answer?.explanation)}\n  \\stopanswer\n\\stopquestion`;
  }).join('\n\n');
  const total = Number(snapshot.totals?.points) || 0;
  return `% Gerado automaticamente. Não editar.\n\\usemodule[basicexam][mode=${mode}]\n\\setuppapersize[${snapshot.render?.paper === 'A5' ? 'A5' : 'A4'}]\n\\setupbodyfont[modern,11pt]\n\\setuplayout[topspace=16mm,backspace=18mm,width=middle,height=middle]\n\n\\starttext\n\\midaligned{\\tfd\\bf ${escapeContext(snapshot.institution?.name)}}\n\\blank[small]\n\\midaligned{\\tfb ${escapeContext(snapshot.assessment?.title)}}\n\\midaligned{${escapeContext(snapshot.assessment?.grade)} \\quad Versão ${escapeContext(snapshot.version?.code)} \\quad Valor: ${total} ${total === 1 ? 'ponto' : 'pontos'}}\n\\blank\nNome: \\thinrules[n=1,width=9cm] \\quad Turma: \\thinrules[n=1,width=2cm]\n\\blank[big]\n\n${questions}\n\n\\stoptext\n`;
}
