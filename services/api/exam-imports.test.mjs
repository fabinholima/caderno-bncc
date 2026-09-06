import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePdf,
  examImportSchema,
  splitExamQuestions,
} from './exam-imports.mjs';

const pdf = Buffer.from(`%PDF-1.7\n${'0'.repeat(120)}`);
const document = {
  kind: 'exam',
  fileName: 'prova.pdf',
  dataUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
};

test('aceita prova e gabarito na área editorial', () => {
  const value = examImportSchema.parse({
    sourceInstitution: 'ITA',
    sourceYear: 1997,
    examType: 'vestibular',
    subjectMode: 'single',
    primarySubject: 'Química',
    sourceUrl: '',
    rightsStatus: 'pending_review',
    documents: [document],
  });
  assert.equal(value.documents[0].kind, 'exam');
  assert.deepEqual(decodePdf(value.documents[0]), pdf);
});

test('exige exatamente um PDF de prova', () => {
  assert.throws(
    () =>
      examImportSchema.parse({
        sourceInstitution: 'ITA',
        sourceYear: 1997,
        examType: 'vestibular',
        subjectMode: 'multidisciplinary',
        documents: [{ ...document, kind: 'answer_key' }],
      }),
    /Envie exatamente um PDF da prova/,
  );
});

test('rejeita arquivo que não tenha assinatura PDF', () => {
  assert.throws(
    () =>
      decodePdf({
        ...document,
        dataUrl: `data:application/pdf;base64,${Buffer.from('x'.repeat(120)).toString('base64')}`,
      }),
    /PDF válido/,
  );
});

test('separa questões objetivas e discursivas para revisão', () => {
  const candidates = splitExamQuestions(`
    QUESTÃO 18. Considere as substâncias abaixo e assinale a correta.
    a) primeira alternativa
    b) segunda alternativa
    c) terceira alternativa
    d) quarta alternativa
    e) quinta alternativa

    QUESTÃO 19. Explique, com base na cinética química, por que a velocidade
    da reação aumenta quando a temperatura do sistema é elevada.
  `);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].questionType, 'single_choice');
  assert.equal(candidates[0].status, 'complete');
  assert.equal(candidates[1].questionType, 'essay');
  assert.equal(candidates[1].status, 'complete');
});
