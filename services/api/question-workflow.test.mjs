import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {checkQuestionTransition,allowedQuestionTransitions} from '../../lib/question-workflow.mjs';
import {workflowSchema,bulkApprovalSchema} from './question-workflow.mjs';
test('edição passa por revisão antes de aprovação',()=>{
 assert.doesNotThrow(()=>checkQuestionTransition('draft','review',false));
 assert.doesNotThrow(()=>checkQuestionTransition('review','approved',true));
 assert.throws(()=>checkQuestionTransition('draft','approved',true),{statusCode:409});
 assert.throws(()=>checkQuestionTransition('review','approved',false),{statusCode:403});
 assert.deepEqual(allowedQuestionTransitions('needs_adjustments',false),['review','draft']);
});
test('aprovação em lote exige revisão, limita a 100 itens e rejeita identificadores repetidos',()=>{
 const q={id:'11111111-1111-4111-8111-111111111111',revision:1};
 assert.equal(bulkApprovalSchema.parse({questions:[q]}).questions.length,1);
 assert.throws(()=>bulkApprovalSchema.parse({questions:[]}));
 assert.throws(()=>bulkApprovalSchema.parse({questions:[{id:q.id}]}));
 assert.throws(()=>bulkApprovalSchema.parse({questions:[q,q]}));
 const questions=Array.from({length:101},()=>({id:randomUUID(),revision:1}));
 assert.doesNotThrow(()=>bulkApprovalSchema.parse({questions:questions.slice(0,100)}));
 assert.throws(()=>bulkApprovalSchema.parse({questions}));
});
test('devolução exige revisor e motivo; situação reconhece ajustes',()=>{
 assert.throws(()=>checkQuestionTransition('review','needs_adjustments',true),{statusCode:422});
 assert.doesNotThrow(()=>checkQuestionTransition('review','needs_adjustments',true,'Corrigir o gabarito.'));
 assert.equal(workflowSchema.parse({status:'needs_adjustments',reason:' Corrigir '}).reason,'Corrigir');
});
