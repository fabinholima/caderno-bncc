// The reader enumerates bubble rows; the immutable exam defines question numbers.
export function reconcileCardReading(snapshot, reading) {
  const objective = (snapshot?.questions || []).filter(q => ['single_choice','multiple_choice'].includes(q.type));
  const rows = Array.isArray(reading?.answers) ? reading.answers : [];
  if (!objective.length || rows.length !== objective.length) return {
    ...reading, answers: [], requiresReview: true,
    reviewReason: 'A foto não permitiu reconhecer todas as questões. Confira o cartão e revise as respostas antes de confirmar.',
  };
  let invalid = false;
  const answers = rows.map((row,index) => {
    const question=objective[index], allowed=(question.alternatives || []).map(a=>a.label);
    const labels=Array.isArray(row.selectedLabels)?row.selectedLabels:[];
    const valid=labels.every(label=>allowed.includes(label)) && new Set(labels).size===labels.length;
    if(!valid)invalid=true;
    return {...row,questionNumber:question.number,selectedLabels:valid?labels:[],status:valid?row.status:'uncertain'};
  });
  return {...reading,answers,requiresReview:!!reading.requiresReview || invalid || answers.some(a=>a.status!=='recognized'),...(invalid?{reviewReason:'Há marcações incompatíveis com as alternativas desta prova. Confira as respostas na foto.'}:{})};
}
export function assertCardApplication(assignment, expectedApplicationId) {
  if(expectedApplicationId && assignment.application_id!==expectedApplicationId)
    throw new Error('Este cartão pertence a outra aplicação. Confira a avaliação e a turma e fotografe o cartão correto.');
}
