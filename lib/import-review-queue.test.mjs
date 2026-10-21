import test from 'node:test';
import assert from 'node:assert/strict';
import {importReviewGroup} from './import-review-queue.mjs';
test('retira cadastradas das pendências sem confundir revisão com cadastro',()=>{
  for(const status of ['review','complete']) {
    assert.equal(importReviewGroup({status,editorialReviewed:true}),'pending');
    assert.equal(importReviewGroup({status,registeredQuestionId:'question'}),'completed');
  }
  assert.equal(importReviewGroup({status:'completed'}),'completed');
  for(const status of ['ignored','duplicate']) assert.equal(importReviewGroup({status}),'discarded');
  assert.equal(importReviewGroup({status:'review',selected:false}),'pending');
});
