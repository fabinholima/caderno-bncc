import test from 'node:test';
import assert from 'node:assert/strict';
import { requestExamAnalysis } from './exam-import-ai.mjs';

test('DeepSeek explicitly selected uses its endpoint and keeps provider metadata', async () => {
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  try {
    const result = await requestExamAnalysis({ provider:'deepseek', candidates:[{id:'q1',rawText:'Questão'}], catalog:{}, fetchImpl:async (url, options) => {
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      const request = JSON.parse(options.body);
      assert.equal(request.response_format.type, 'json_object');
      assert.match(request.messages[0].content, /ConTeXt/);
      assert.match(request.messages[1].content, /q1/);
      return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"questions":[]}'}}],model:'deepseek-flash',usage:{total_tokens:20}})};
    }});
    assert.equal(result.provider,'deepseek');
    assert.equal(result.usage.total_tokens,20);
    await assert.rejects(requestExamAnalysis({provider:'deepseek',candidates:[],catalog:{},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length'}]})})}), /não concluiu/);
  } finally { if(previous === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previous; }
});
test('unknown provider is rejected before any request', async()=>{
  await assert.rejects(requestExamAnalysis({provider:'invalid',candidates:[],catalog:{}}), /inválido/);
});
