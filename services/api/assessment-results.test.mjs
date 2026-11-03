import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoringRule, summarizeResult, minimumExpectedPercent, isBelowExpected,
  publicationStatusAfterNewVersion, processingStatusFor, normalizeFollowup,
} from './assessment-results.mjs';

const objective = (number, correct = 'A', points = 1, extra = {}) => ({
  number, type: 'single_choice', points,
  alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, stableKey: `${number}-${label}` })),
  answer: { correctStableKeys: [`${number}-${correct}`] },
  skills: [{ code: 'EF09MA01', primary: true }],
  ...extra,
});
const snapshot = { questions: [objective(1), objective(2, 'B'), objective(3, 'C'), objective(4, 'D'), objective(5, 'E', 2)] };

test('separates correct, incorrect, blank and invalid without double counting', () => {
  const summary = summarizeResult(snapshot, [
    { questionNumber: 1, selectedLabels: ['A'], status: 'recognized' },
    { questionNumber: 2, selectedLabels: ['C'], status: 'recognized' },
    { questionNumber: 3, selectedLabels: [], status: 'blank' },
    { questionNumber: 4, selectedLabels: ['A', 'D'], status: 'multiple' },
    { questionNumber: 5, selectedLabels: ['E'], status: 'confirmed' },
  ]);
  assert.deepEqual(
    [summary.correctCount, summary.incorrectCount, summary.blankCount, summary.invalidCount, summary.reviewPendingCount],
    [2, 1, 1, 1, 0],
  );
  assert.equal(summary.validCount, 5);
  assert.equal(summary.percent, 40);
  assert.equal(summary.score, 3);
  assert.equal(summary.maxScore, 6);
  assert.equal(summary.publishable, true);
  assert.equal(processingStatusFor(summary), 'ready');
});

test('uncertain or missing marks stay pending and are never guessed', () => {
  const summary = summarizeResult(snapshot, [
    { questionNumber: 1, selectedLabels: ['A'], status: 'uncertain' },
    { questionNumber: 2, selectedLabels: ['B'], status: 'recognized' },
  ]);
  assert.equal(summary.reviewPendingCount, 4);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.items[0].awardedPoints, null);
  assert.equal(summary.percent, null);
  assert.equal(summary.score, null);
  assert.equal(summary.publishable, false);
  assert.equal(processingStatusFor(summary), 'needs_review');
});

test('a question without answer key is not scored as wrong', () => {
  const broken = { questions: [{ ...objective(1), answer: { correctStableKeys: [] } }] };
  const summary = summarizeResult(broken, [{ questionNumber: 1, selectedLabels: ['A'], status: 'recognized' }]);
  assert.equal(summary.items[0].status, 'review_pending');
  assert.equal(summary.publishable, false);
});

test('multiple marks are valid when the question has several correct alternatives', () => {
  const multi = { questions: [{ ...objective(1), type: 'multiple_choice', answer: { correctStableKeys: ['1-A', '1-C'] } }] };
  assert.equal(summarizeResult(multi, [{ questionNumber: 1, selectedLabels: ['C', 'A'], status: 'recognized' }]).correctCount, 1);
});

test('annulled questions require a defined policy', () => {
  assert.throws(() => scoringRule({ annulledQuestions: [2] }), (error) => error.code === 'annulled_policy_required');
  const answers = [1, 2, 3, 4, 5].map((questionNumber) => ({ questionNumber, selectedLabels: ['A'], status: 'recognized' }));
  const excluded = summarizeResult(snapshot, answers, scoringRule({ annulledQuestions: [2], annulledPolicy: 'exclude' }));
  assert.equal(excluded.annulledCount, 1);
  assert.equal(excluded.validCount, 4);
  assert.equal(excluded.maxScore, 5);
  assert.equal(excluded.score, 1);
  const awarded = summarizeResult(snapshot, answers, scoringRule({ annulledQuestions: [2], annulledPolicy: 'award_full' }));
  assert.equal(awarded.score, 2);
  assert.equal(awarded.maxScore, 6);
  assert.throws(() => summarizeResult(snapshot, answers, scoringRule({ annulledQuestions: [9], annulledPolicy: 'exclude' })));
});

test('essays keep the score pending until graded', () => {
  const mixed = { questions: [objective(1), { number: 2, type: 'essay', points: 3 }] };
  const answers = [{ questionNumber: 1, selectedLabels: ['A'], status: 'recognized' }];
  const pending = summarizeResult(mixed, answers);
  assert.equal(pending.manualPendingCount, 1);
  assert.equal(pending.score, null);
  assert.equal(pending.percent, 100);
  assert.equal(pending.publishable, false);
  const graded = summarizeResult(mixed, answers, scoringRule(), new Map([[2, 1.5]]));
  assert.equal(graded.score, 2.5);
  assert.equal(graded.publishable, true);
});

test('minimum expected percent follows application, school/subject, school, subject and institution', () => {
  const thresholds = [
    { schoolId: null, subject: null, minExpectedPercent: 50 },
    { schoolId: null, subject: 'Química', minExpectedPercent: 55 },
    { schoolId: 's1', subject: null, minExpectedPercent: 60 },
    { schoolId: 's1', subject: 'química', minExpectedPercent: 65 },
  ];
  assert.equal(minimumExpectedPercent({ applicationPercent: 70, thresholds, schoolId: 's1', subject: 'Química' }), 70);
  assert.equal(minimumExpectedPercent({ thresholds, schoolId: 's1', subject: 'Química' }), 65);
  assert.equal(minimumExpectedPercent({ thresholds, schoolId: 's1', subject: 'Física' }), 60);
  assert.equal(minimumExpectedPercent({ thresholds, schoolId: 's2', subject: 'Química' }), 55);
  assert.equal(minimumExpectedPercent({ thresholds, schoolId: 's2', subject: 'Física' }), 50);
  assert.equal(minimumExpectedPercent({ thresholds: [] }), null);
  assert.equal(isBelowExpected(40, 50), true);
  assert.equal(isBelowExpected(50, 50), false);
  assert.equal(isBelowExpected(null, 50), false);
  assert.equal(isBelowExpected(10, null), false);
});

test('a new version of a published result requires new authorization', () => {
  assert.equal(publicationStatusAfterNewVersion('unpublished'), 'unpublished');
  assert.equal(publicationStatusAfterNewVersion('published'), 'republish_required');
  assert.equal(publicationStatusAfterNewVersion('republish_required'), 'republish_required');
});

test('follow-ups are chosen by the teacher and keep internal notes apart', () => {
  assert.equal(normalizeFollowup({}).status, 'pending');
  const entry = normalizeFollowup({ reasons: ['attendance', 'other'], otherReason: ' mudança de turno ', actions: ['recovery'], internalNote: 'conversar com a família', studentGuidance: 'Refaça a lista 3', publishGuidance: true });
  assert.equal(entry.status, 'justified');
  assert.equal(entry.otherReason, 'mudança de turno');
  assert.equal(entry.internalNote, 'conversar com a família');
  assert.equal(entry.studentGuidancePublished, true);
  assert.throws(() => normalizeFollowup({ reasons: ['other'] }), (error) => error.code === 'other_reason_required');
  assert.throws(() => normalizeFollowup({ reasons: ['lazy'] }), (error) => error.code === 'invalid_reason');
  assert.throws(() => normalizeFollowup({ actions: ['punish'] }), (error) => error.code === 'invalid_action');
  assert.throws(() => normalizeFollowup({ publishGuidance: true }), (error) => error.code === 'guidance_required');
});

test('skill performance counts only scored questions and flags thin evidence', async () => {
  const { skillPerformance, studentQuestionView } = await import('./assessment-results.mjs');
  const item = (status, codes) => ({ status, skills: codes.map((code) => ({ code })) });
  const skills = skillPerformance([
    [item('correct', ['EM13CNT101']), item('incorrect', ['EM13CNT101', 'EM13CNT102']), item('review_pending', ['EM13CNT101'])],
    [item('blank', ['EM13CNT101']), item('annulled', ['EM13CNT102']), item('correct', []), item('correct', ['EM13CNT101', 'EM13CNT101'])],
  ]);
  assert.deepEqual(skills, [
    { code: 'EM13CNT101', questions: 4, correct: 2, percent: 50, sufficientEvidence: true },
    { code: 'EM13CNT102', questions: 1, correct: 0, percent: 0, sufficientEvidence: false },
  ]);
  const items = [{ questionNumber: 1, status: 'incorrect', selectedLabels: ['A'], correctLabels: ['B'], awardedPoints: 0, maxPoints: 1, skills: [], answerStatus: 'recognized' }];
  assert.deepEqual(studentQuestionView(items, 'summary'), []);
  assert.deepEqual(studentQuestionView(items, 'answers'), [{ questionNumber: 1, status: 'incorrect', selectedLabels: ['A'], awardedPoints: 0, maxPoints: 1 }]);
  assert.deepEqual(studentQuestionView(items, 'answers_and_key')[0].correctLabels, ['B']);
});

test('answer key status lists objective questions without a correct alternative', async () => {
  const { answerKeyStatus } = await import('./assessment-results.mjs');
  const missing = { ...objective(2), answer: { correctStableKeys: [] } };
  const stale = { ...objective(3), answer: { correctStableKeys: ['9-A'] } };
  assert.deepEqual(answerKeyStatus({ questions: [objective(1), missing, stale, { number: 4, type: 'essay', points: 2 }] }),
    { questions: 4, objective: 3, missingAnswerKeys: [2, 3] });
  assert.deepEqual(answerKeyStatus(snapshot).missingAnswerKeys, []);
  assert.deepEqual(answerKeyStatus(null), { questions: 0, objective: 0, missingAnswerKeys: [] });
});
