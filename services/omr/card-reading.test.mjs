import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCardReading,assertCardApplication} from './card-reading.mjs';
const snapshot={questions:[{number:1,type:'single_choice',alternatives:[{label:'A'},{label:'B'}]},{number:2,type:'essay'},{number:3,type:'single_choice',alternatives:[{label:'A'},{label:'B'}]}]};
const row=label=>({questionNumber:1,selectedLabels:[label],status:'recognized'});
test('complete objective rows use the immutable question numbers, including gaps for essays',()=>{const r=reconcileCardReading(snapshot,{requiresReview:false,answers:[row('A'),row('B')]});assert.equal(r.requiresReview,false);assert.deepEqual(r.answers.map(a=>a.questionNumber),[1,3]);});
test('a cropped card cannot automatically count unseen rows as wrong answers',()=>{for(const answers of [[],[row('A')],[row('A'),row('B'),row('A')]]){const r=reconcileCardReading(snapshot,{requiresReview:false,answers});assert.equal(r.requiresReview,true);assert.deepEqual(r.answers,[]);assert.match(r.reviewReason,/todas as questões/);}});
test('blank, multiple and unsupported alternatives require review instead of automatic grading',()=>{assert.equal(reconcileCardReading(snapshot,{requiresReview:false,answers:[row('E'),row('B')]}).requiresReview,true);assert.deepEqual(reconcileCardReading(snapshot,{answers:[row('E'),row('B')]}).answers[0].selectedLabels,[]);assert.equal(reconcileCardReading(snapshot,{requiresReview:true,answers:[{selectedLabels:[],status:'blank'},row('B')]}).requiresReview,true);});
test('the QR must identify the selected application before grading',()=>{assert.doesNotThrow(()=>assertCardApplication({application_id:'a'},'a'));assert.throws(()=>assertCardApplication({application_id:'b'},'a'),/outra aplicação/);assert.doesNotThrow(()=>assertCardApplication({application_id:'a'},null));});

test('C/E readings use only the immutable C/E alternatives', () => {
  const exam = {questions: [{number:1, type:'true_false', alternatives:[{label:'C'},{label:'E'}]}]};
  assert.equal(reconcileCardReading(exam,{answers:[row('C')]}).requiresReview, false);
  assert.equal(reconcileCardReading(exam,{answers:[row('A')]}).requiresReview, true);
  assert.equal(reconcileCardReading(exam,{answers:[row('E')]}).answers[0].selectedLabels[0], 'E');
});
