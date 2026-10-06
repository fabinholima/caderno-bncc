import test from 'node:test';
import assert from 'node:assert/strict';
import { applyManualReview, manualReviewSchema } from './manual-review.mjs';
import { gradeSubmission } from './submissions.mjs';
const snapshot = { questions: [
  { number: 1, type: 'single_choice', points: 1, alternatives: [{label:'A',stableKey:'a'}], answer:{correctStableKeys:['a']}, skills:[{code:'EM13CNT101',primary:true}] },
  { number: 2, type:'essay',points:3,alternatives:[],answer:{correctStableKeys:[]} },
  { number: 3, type:'short_answer',points:2,alternatives:[],answer:{correctStableKeys:[]} },
] };
const original = gradeSubmission(snapshot,{candidate:{name:'Ana Souza'},responses:[{questionNumber:1,selectedLabels:['A']}]});
test('manual points augment the objective score and preserve its metadata',()=>{
  const grade=applyManualReview(snapshot,original,{expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:2.5,feedback:'Boa justificativa'},{questionNumber:3,awardedPoints:0}]},'teacher','2026-10-06T12:00:00Z');
  assert.equal(grade.score,3.5);assert.equal(grade.maxScore,6);assert.equal(grade.requiresManualReview,false);
  assert.deepEqual(grade.result.items[0],original.result.items[0]);
  assert.equal(grade.result.items[1].reviewedBy,'teacher');assert.equal(grade.result.items[1].feedback,'Boa justificativa');
  assert.equal(grade.result.items[2].awardedPoints,0);assert.equal(original.requiresManualReview,true);
});
test('partial review preserves prior manual scores, including zero',()=>{
  const first=applyManualReview(snapshot,original,{expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:0}]},'teacher');
  assert.equal(first.requiresManualReview,true);
  const final=applyManualReview(snapshot,{...original,result:first.result},{expectedRevision:1,reviews:[{questionNumber:3,awardedPoints:1.25}]},'teacher');
  assert.equal(final.score,2.25);assert.equal(final.result.items[1].awardedPoints,0);assert.equal(final.requiresManualReview,false);
});
test('manual input rejects changing objective items, out-of-range points and duplicate questions',()=>{
  assert.throws(()=>applyManualReview(snapshot,original,{expectedRevision:0,reviews:[{questionNumber:1,awardedPoints:1}]},'teacher'),/não é discursiva/);
  assert.throws(()=>applyManualReview(snapshot,original,{expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:3.01}]},'teacher'),/entre 0 e 3/);
  assert.throws(()=>manualReviewSchema.parse({expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:1},{questionNumber:2,awardedPoints:2}]}));
  for(const awardedPoints of [-1,NaN,Infinity,1.001]) assert.throws(()=>manualReviewSchema.parse({expectedRevision:0,reviews:[{questionNumber:2,awardedPoints}]}));
});
