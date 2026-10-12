export const questionStatusLabels=Object.freeze({draft:'Rascunho',review:'Em revisão',needs_adjustments:'Precisa de ajustes',approved:'Aprovada',archived:'Arquivada'});
export const questionTransitions=Object.freeze({draft:['review','archived'],review:['approved','needs_adjustments','draft','archived'],needs_adjustments:['review','draft','archived'],approved:['review','draft','archived'],archived:['draft']});
export function allowedQuestionTransitions(current,reviewer){return (questionTransitions[current]||[]).filter(next=>reviewer || !['approved','needs_adjustments','archived'].includes(next));}
export function checkQuestionTransition(current,next,reviewer,reason=''){
 if(!reviewer && ['approved','needs_adjustments','archived'].includes(next))throw Object.assign(new Error('Somente o administrador geral pode aprovar, devolver ou arquivar questões.'),{statusCode:403});
 if(!allowedQuestionTransitions(current,reviewer).includes(next))throw Object.assign(new Error('Transição de status não permitida. Atualize a lista de questões.'),{statusCode:409});
 if(next==='needs_adjustments' && !reason.trim())throw Object.assign(new Error('Informe o motivo dos ajustes solicitados.'),{statusCode:422});
}
