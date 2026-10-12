import test from 'node:test';
import assert from 'node:assert/strict';
import {checkQuestionTransition,allowedQuestionTransitions} from '../../lib/question-workflow.mjs';
import {workflowSchema} from './question-workflow.mjs';
test('edição passa por revisão antes de aprovação',()=>{
 assert.doesNotThrow(()=>checkQuestionTransition('draft','review',false));
 assert.doesNotThrow(()=>checkQuestionTransition('review','approved',true));
 assert.throws(()=>checkQuestionTransition('draft','approved',true),{statusCode:409});
 assert.throws(()=>checkQuestionTransition('review','approved',false),{statusCode:403});
 assert.deepEqual(allowedQuestionTransitions('needs_adjustments',false),['review','draft']);
});
test('devolução exige revisor e motivo; situação reconhece ajustes',()=>{
 assert.throws(()=>checkQuestionTransition('review','needs_adjustments',true),{statusCode:422});
 assert.doesNotThrow(()=>checkQuestionTransition('review','needs_adjustments',true,'Corrigir o gabarito.'));
 assert.equal(workflowSchema.parse({status:'needs_adjustments',reason:' Corrigir '}).reason,'Corrigir');
});
