import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateUpdateSchema,
  decodePdf,
  examImportProgress,
  examImportSchema,
  mergeReextractedCandidates,
  parseAnswerKeyText,
  parsePdfQuestionBounds,
  questionNeedsVisualCapture,
  splitExamQuestions,
} from './exam-imports.mjs';

test('valida decisões humanas granulares sobre sugestões da IA', () => {
  const value = candidateUpdateSchema.parse({
    status: 'review',
    aiReview: {
      acceptedFields: ['rawText', 'skill'],
      rejectedFields: ['difficulty'],
    },
  });
  assert.deepEqual(value.aiReview.acceptedFields, ['rawText', 'skill']);
  assert.throws(
    () =>
      candidateUpdateSchema.parse({
        aiReview: {
          acceptedFields: ['grade'],
          rejectedFields: ['grade'],
        },
      }),
    /não pode ser aceito e rejeitado ao mesmo tempo/,
  );
});

test('conclui a importação quando todas as questões têm destino editorial', () => {
  assert.deepEqual(
    examImportProgress([
      { status: 'completed' },
      { status: 'duplicate' },
      { status: 'ignored' },
    ]),
    { resolved: 3, status: 'completed' },
  );
  assert.deepEqual(
    examImportProgress([{ status: 'completed' }, { status: 'review' }]),
    { resolved: 1, status: 'needs_review' },
  );
});

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

test('associa respostas numeradas do gabarito', () => {
  const parsed = parseAnswerKeyText(
    'GABARITO 01 - C   02 B   03: E   04) A   05 D',
    [1, 2, 3, 4, 5],
  );
  assert.equal(parsed.answers.length, 5);
  assert.deepEqual(parsed.answers[0], { sourceNumber: 1, answer: 'C' });
  assert.equal(parsed.confidence, 0.95);
});

test('atribui baixa confiança quando há poucas respostas aparentes', () => {
  const parsed = parseAnswerKeyText(
    'Questão 1 A qualquer texto 17 B',
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.ok(parsed.coverage < 0.3);
  assert.equal(parsed.confidence, 0.45);
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

test('detecta questão cujas alternativas dependem de gráficos', () => {
  assert.equal(
    questionNeedsVisualCapture(
      'Questão 9. Assinale a curva correta. A( ) mA tempo B( ) mA tempo C( ) mA tempo',
    ),
    true,
  );
  assert.equal(
    questionNeedsVisualCapture(
      'Questão 10. Assinale a correta. A) texto B) texto C) texto D) texto E) texto',
    ),
    false,
  );
});

test('localiza os limites verticais das questões no XML do PDF', () => {
  const pages = parsePdfQuestionBounds(`
    <page width="595.000000" height="842.000000">
      <word xMin="20" yMin="100" xMax="65" yMax="112">Questão</word>
      <word xMin="70" yMin="100" xMax="80" yMax="112">9.</word>
      <word xMin="20" yMin="500" xMax="65" yMax="512">Questão</word>
      <word xMin="70" yMin="500" xMax="88" yMax="512">10.</word>
    </page>
  `);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].markers, [
    { sourceNumber: 9, yMin: 100 },
    { sourceNumber: 10, yMin: 500 },
  ]);
});

test('nova extração preserva revisão e gabarito já confirmados', () => {
  const [candidate] = mergeReextractedCandidates(
    [
      {
        id: 'novo',
        sourceNumber: 9,
        rawText: 'texto reextraído',
        selected: true,
        questionType: 'essay',
        status: 'review',
      },
    ],
    [
      {
        id: 'estável',
        sourceNumber: 9,
        selected: true,
        questionType: 'single_choice',
        status: 'review',
        correctAnswers: ['C'],
        answerStatus: 'confirmed',
        answerConfidence: 1,
        grade: '2ª série',
        difficulty: 'Difícil',
        skill: 'EM13CNT101',
        pedagogicalDisciplineId: 'disciplina-quimica',
        pedagogicalTopicId: 'topico-cinetica',
      },
    ],
  );
  assert.equal(candidate.id, 'estável');
  assert.equal(candidate.rawText, 'texto reextraído');
  assert.equal(candidate.questionType, 'single_choice');
  assert.deepEqual(candidate.correctAnswers, ['C']);
  assert.equal(candidate.answerStatus, 'confirmed');
  assert.equal(candidate.grade, '2ª série');
  assert.equal(candidate.difficulty, 'Difícil');
  assert.equal(candidate.skill, 'EM13CNT101');
  assert.equal(candidate.pedagogicalDisciplineId, 'disciplina-quimica');
  assert.equal(candidate.pedagogicalTopicId, 'topico-cinetica');
});
