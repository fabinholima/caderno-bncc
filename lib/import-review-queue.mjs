// Editorial review alone does not mean the question has been registered.
export function importReviewGroup(candidate) {
  if (candidate.registeredQuestionId || candidate.status === 'completed') return 'completed';
  if (['ignored', 'duplicate'].includes(candidate.status)) return 'discarded';
  return 'pending';
}
