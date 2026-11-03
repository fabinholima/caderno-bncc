// Contagem e estados dos resultados de cartões. Funções puras: o acesso ao
// banco fica nas rotas, que gravam o retorno em assessment_result_versions.

export const LOW_PERFORMANCE_REASONS = {
  content_comprehension: 'Dificuldade de compreensão do conteúdo',
  reading_interpretation: 'Dificuldade de leitura ou interpretação',
  attendance: 'Frequência insuficiente',
  prior_content: 'Necessidade de recuperação de conteúdos anteriores',
  incomplete_assessment: 'Avaliação incompleta',
  application_incident: 'Ocorrência durante a aplicação',
  other: 'Outro motivo',
};

export const PEDAGOGICAL_ACTIONS = {
  content_review: 'Revisão de conteúdo',
  targeted_exercises: 'Exercícios direcionados',
  individual_support: 'Atendimento individual',
  recovery: 'Recuperação',
  new_assessment: 'Nova avaliação',
};

const OBJECTIVE_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false']);
const MANUAL_TYPES = new Set(['essay', 'short_answer']);

function resultError(message, code) {
  return Object.assign(new Error(message), { statusCode: 422, code });
}

// Regra de pontuação usada pelo resultado. A soma dos pontos do snapshot é a
// regra existente; anulações só são aceitas com uma política definida.
export function scoringRule(settings = {}) {
  const annulledQuestions = [...new Set(settings.annulledQuestions ?? [])].sort((a, b) => a - b);
  const annulledPolicy = settings.annulledPolicy ?? null;
  if (annulledQuestions.length && !['exclude', 'award_full'].includes(annulledPolicy))
    throw resultError('Defina como as questões anuladas serão pontuadas antes de calcular o resultado.', 'annulled_policy_required');
  return { kind: 'points_sum', annulledQuestions, annulledPolicy: annulledQuestions.length ? annulledPolicy : null };
}

function correctLabelsOf(question) {
  const keys = question.answer?.correctStableKeys ?? [];
  return (question.alternatives ?? [])
    .filter((alternative) => keys.includes(alternative.stableKey))
    .map((alternative) => alternative.label)
    .sort((a, b) => a.localeCompare(b));
}

// Classifica uma questão objetiva. A leitura 'uncertain' (ou ausente) nunca é
// convertida em resposta: fica pendente de revisão do professor.
function classifyObjective(question, answer) {
  const correctLabels = correctLabelsOf(question);
  if (!correctLabels.length) return { status: 'review_pending', correctLabels, selectedLabels: [], reason: 'no_answer_key' };
  if (!answer || answer.status === 'uncertain') return { status: 'review_pending', correctLabels, selectedLabels: answer?.selectedLabels ?? [] };
  const selectedLabels = [...new Set(answer.selectedLabels ?? [])].sort((a, b) => a.localeCompare(b));
  if (!selectedLabels.length) return { status: 'blank', correctLabels, selectedLabels };
  if (selectedLabels.length > 1 && correctLabels.length === 1) return { status: 'invalid', correctLabels, selectedLabels };
  const correct = selectedLabels.length === correctLabels.length && selectedLabels.every((label, index) => label === correctLabels[index]);
  return { status: correct ? 'correct' : 'incorrect', correctLabels, selectedLabels };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// answers: [{questionNumber, selectedLabels, status}] com status do OMR
// ('recognized','blank','multiple','uncertain') ou 'confirmed' pelo professor.
// manualPoints: Map questionNumber -> pontos das discursivas já corrigidas.
export function summarizeResult(snapshot, answers = [], rule = scoringRule(), manualPoints = new Map()) {
  const questions = Array.isArray(snapshot?.questions) ? snapshot.questions : [];
  if (!questions.length) throw resultError('Versão da avaliação sem questões.', 'empty_assessment');
  const known = new Set(questions.map((question) => question.number));
  const unknownAnnulled = rule.annulledQuestions.find((number) => !known.has(number));
  if (unknownAnnulled) throw resultError(`A questão anulada ${unknownAnnulled} não pertence à avaliação.`, 'unknown_question');
  const byNumber = new Map(answers.map((answer) => [answer.questionNumber, answer]));
  const annulled = new Set(rule.annulledQuestions);
  const counts = { correct: 0, incorrect: 0, blank: 0, invalid: 0, review_pending: 0 };
  let manualPending = 0, annulledCount = 0, score = 0, maxScore = 0;
  const items = questions.map((question) => {
    const points = Number(question.points) || 0;
    const skills = (question.skills ?? []).map((skill) => ({ code: skill.code, primary: Boolean(skill.primary) }));
    const base = { questionNumber: question.number, type: question.type, maxPoints: points, skills };
    if (annulled.has(question.number)) {
      annulledCount += 1;
      if (rule.annulledPolicy === 'award_full') { score += points; maxScore += points; }
      // A marcação lida é preservada para um recálculo futuro.
      const answer = byNumber.get(question.number);
      return { ...base, status: 'annulled', awardedPoints: rule.annulledPolicy === 'award_full' ? points : null,
        selectedLabels: answer?.selectedLabels ?? [], answerStatus: answer?.status ?? null };
    }
    maxScore += points;
    if (MANUAL_TYPES.has(question.type)) {
      const awarded = manualPoints.get(question.number);
      if (awarded == null) { manualPending += 1; return { ...base, status: 'manual_pending', awardedPoints: null }; }
      score += Number(awarded);
      return { ...base, status: 'manual_graded', awardedPoints: Number(awarded) };
    }
    if (!OBJECTIVE_TYPES.has(question.type)) {
      manualPending += 1;
      return { ...base, status: 'manual_pending', awardedPoints: null };
    }
    const answer = byNumber.get(question.number);
    const item = { ...classifyObjective(question, answer), answerStatus: answer?.status ?? null };
    counts[item.status] += 1;
    const awardedPoints = item.status === 'correct' ? points : item.status === 'review_pending' ? null : 0;
    score += awardedPoints ?? 0;
    return { ...base, ...item, awardedPoints };
  });
  const validCount = counts.correct + counts.incorrect + counts.blank + counts.invalid + counts.review_pending;
  const pending = counts.review_pending + manualPending;
  return {
    items,
    scoringRule: rule,
    questionCount: questions.length,
    annulledCount,
    validCount,
    correctCount: counts.correct,
    incorrectCount: counts.incorrect,
    blankCount: counts.blank,
    invalidCount: counts.invalid,
    reviewPendingCount: counts.review_pending,
    manualPendingCount: manualPending,
    // Percentual de acertos entre as objetivas válidas; com leitura pendente
    // o valor ainda não é conhecido.
    percent: validCount && !counts.review_pending ? round2((counts.correct * 100) / validCount) : null,
    score: pending ? null : round2(score),
    maxScore: round2(maxScore),
    publishable: pending === 0,
  };
}

// Prioridade: aplicação, disciplina na escola, escola, disciplina, instituição.
export function minimumExpectedPercent({ applicationPercent, thresholds = [], schoolId = null, subject = null }) {
  if (applicationPercent != null) return Number(applicationPercent);
  const normalized = subject ? subject.trim().toLowerCase() : null;
  const match = (school, withSubject) => thresholds.find((threshold) =>
    (threshold.schoolId ?? null) === school
    && (withSubject ? threshold.subject?.trim().toLowerCase() === normalized : threshold.subject == null));
  const found = (schoolId && normalized && match(schoolId, true))
    || (schoolId && match(schoolId, false))
    || (normalized && match(null, true))
    || match(null, false);
  return found ? Number(found.minExpectedPercent) : null;
}

export function isBelowExpected(percent, minimum) {
  return percent != null && minimum != null && Number(percent) < Number(minimum);
}

// Estado de publicação depois de gravar uma nova versão.
export function publicationStatusAfterNewVersion(current) {
  return current === 'unpublished' ? 'unpublished' : 'republish_required';
}

export function processingStatusFor(summary) {
  return summary.publishable ? 'ready' : 'needs_review';
}

// Valida uma entrada de acompanhamento de baixo rendimento.
export function normalizeFollowup(input = {}) {
  const reasons = [...new Set(input.reasons ?? [])];
  const actions = [...new Set(input.actions ?? [])];
  const invalidReason = reasons.find((reason) => !(reason in LOW_PERFORMANCE_REASONS));
  if (invalidReason) throw resultError(`Motivo desconhecido: ${invalidReason}.`, 'invalid_reason');
  const invalidAction = actions.find((action) => !(action in PEDAGOGICAL_ACTIONS));
  if (invalidAction) throw resultError(`Ação desconhecida: ${invalidAction}.`, 'invalid_action');
  const otherReason = String(input.otherReason ?? '').trim();
  if (reasons.includes('other') && !otherReason) throw resultError('Descreva o outro motivo.', 'other_reason_required');
  const guidance = String(input.studentGuidance ?? '').trim();
  const publishGuidance = Boolean(input.publishGuidance);
  if (publishGuidance && !guidance) throw resultError('Escreva a orientação antes de publicá-la ao aluno.', 'guidance_required');
  const text = (value, max) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed.length > max) throw resultError(`O texto deve ter no máximo ${max} caracteres.`, 'text_too_long');
    return trimmed || null;
  };
  return {
    status: reasons.length ? 'justified' : 'pending',
    reasons,
    otherReason: reasons.includes('other') ? text(otherReason, 1000) : null,
    actions,
    internalNote: text(input.internalNote, 4000),
    studentGuidance: text(guidance, 4000),
    studentGuidancePublished: publishGuidance,
  };
}
