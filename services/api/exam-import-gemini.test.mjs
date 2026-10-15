import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGeminiAnalysis } from './exam-import-gemini.mjs';
const options = {
  candidates: [
    {
      id: 'q1',
      rawText: 'Texto de uma questão.',
      correctAnswers: ['A'],
      answerStatus: 'missing',
    },
  ],
  catalog: {},
  instructions: 'Converter.',
  schema: { type: 'object' },
  env: { GEMINI_API_KEY: 'private-test-key' },
};
test('Gemini uses structured output, private header, timeout and confirmed answers only', async () => {
  let request;
  const result = await requestGeminiAnalysis({
    ...options,
    fetchImpl: async (url, init) => {
      request = { url, ...init };
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"questions":[]}' }] },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            thoughtsTokenCount: 5,
            totalTokenCount: 35,
          },
        }),
      };
    },
  });
  assert.equal(result.provider, 'gemini');
  assert.equal(result.usage.output_tokens, 25);
  assert.equal(request.headers['x-goog-api-key'], 'private-test-key');
  assert(!request.url.includes('private-test-key'));
  assert(request.signal);
  const body = JSON.parse(request.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(
    JSON.parse(body.contents[0].parts[0].text).questions[0].confirmedAnswers,
    [],
  );
});
test('quota errors wait without switching to a paid provider or retrying in a loop', async () => {
  let calls = 0;
  await assert.rejects(
    requestGeminiAnalysis({
      ...options,
      fetchImpl: async () => {
        calls++;
        return { ok: false, status: 429, headers: { get: () => '120' } };
      },
    }),
    (e) => e.code === 'AI_QUOTA_EXHAUSTED' && e.retryAfterSeconds === 120,
  );
  assert.equal(calls, 1);
});
test('rejects absent key, truncated output and provider errors without leaking its body', async () => {
  await assert.rejects(
    requestGeminiAnalysis({ ...options, env: {} }),
    /GEMINI_API_KEY/,
  );
  await assert.rejects(
    requestGeminiAnalysis({
      ...options,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
      }),
    }),
    /não concluiu/,
  );
  await assert.rejects(
    requestGeminiAnalysis({
      ...options,
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    /HTTP 403/,
  );
});

test('simplifies provider schema while retaining required fields and reports safe 400 diagnostics', async()=>{
  let body;
  await requestGeminiAnalysis({...options,schema:{$schema:'draft',type:'object',properties:{questions:{type:'array',maxItems:200,items:{type:'string',maxLength:30000}}},required:['questions']},fetchImpl:async(url,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"questions":[]}'}]}}]})};}});
  const schema=body.generationConfig.responseJsonSchema;
  assert.equal(schema.$schema,undefined);assert.equal(schema.properties.questions.maxItems,undefined);assert.equal(schema.properties.questions.items.maxLength,undefined);assert.deepEqual(schema.required,['questions']);
  await assert.rejects(requestGeminiAnalysis({...options,fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:{status:'INVALID_ARGUMENT',message:'Schema too complex; private-test-key'}})})}),e=>e.message.includes('formato estruturado')&&!e.message.includes('private-test-key'));
});
