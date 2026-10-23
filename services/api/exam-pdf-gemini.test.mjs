import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfWithGemini } from './exam-pdf-gemini.mjs';
const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(100));
const question = {
  sourceNumber: 1,
  pageNumber: 2,
  statement: 'Considere o gráfico da questão.',
  alternatives: [{label:'A',text:'10'},{label:'B',text:'20'}],
  questionType: 'single_choice',
};
function options(questions, seen = () => {}) {
  return {
    env: { GEMINI_API_KEY: 'test-only' },
    fetchImpl: async (url, init) => {
      seen(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify({ questions }) }] },
            },
          ],
        }),
      };
    },
  };
}
test('sends the PDF directly and preserves page references with review required', async () => {
  let body;
  const [candidate] = await extractPdfWithGemini(
    pdf,
    options([question], (value) => (body = value)),
  );
  assert.equal(
    body.contents[0].parts[0].inlineData.mimeType,
    'application/pdf',
  );
  assert.equal(
    body.contents[0].parts[0].inlineData.data,
    pdf.toString('base64'),
  );
  assert.equal(candidate.extractionMethod, 'gemini-pdf');
  assert.equal(candidate.pageNumber, 2);
  assert.equal(candidate.status, 'review');
  assert.equal(candidate.answerStatus, 'missing');
  assert.deepEqual(candidate.correctAnswers, []);
});
test('preserves a judgment item as true_false without inventing A-E choices', async () => {
  const [candidate] = await extractPdfWithGemini(pdf, options([{
    sourceNumber: 2,
    pageNumber: 1,
    statement: 'A afirmação apresenta um conceito que deve ser julgado pelo estudante.',
    alternatives: [],
    questionType: 'true_false',
  }]));
  assert.equal(candidate.questionType, 'true_false');
  assert.match(candidate.rawText, /A afirmação apresenta/);
  assert.deepEqual(candidate.correctAnswers, []);
  assert.equal(candidate.answerStatus, 'missing');
});
test('rejects missing, repeated questions and invalid page references', async () => {
  await assert.rejects(extractPdfWithGemini(pdf, options([])));
  await assert.rejects(
    extractPdfWithGemini(pdf, options([question, question])),
    /repetidos/,
  );
  await assert.rejects(
    extractPdfWithGemini(pdf, options([{ ...question, pageNumber: 0 }])),
  );
  await assert.rejects(
    extractPdfWithGemini(Buffer.from('html'), options([question])),
    /PDF inválido/,
  );
});
