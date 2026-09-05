import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQuestionSchema } from './questions.mjs';
import { renderAssessment } from '../renderer/render-contract.mjs';
import {
  compileAndValidate,
  materializeQuestionImages,
} from '../renderer/worker.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const previewRoot = path.join(projectRoot, 'tmp', 'pdfs');

function snapshotFromQuestion(question) {
  const alternatives = question.alternatives.map((alternative, index) => ({
    stableKey: alternative.stableKey,
    label: String.fromCharCode(65 + index),
    content: alternative.contentBlocks?.length
      ? alternative.contentBlocks
      : [{ type: 'paragraph', text: alternative.content }],
  }));
  const renderedQuestion = {
    id: 'preview-question',
    sourceQuestionId: 'preview-question',
    sourceRevision: 1,
    source: { institution: question.sourceInstitution, year: question.sourceYear },
    difficulty: question.difficulty,
    number: 1,
    type: question.type,
    statement: question.statementBlocks?.length
      ? question.statementBlocks
      : [{ type: 'paragraph', text: question.statement }],
    alternatives,
    answer: {
      correctStableKeys: question.alternatives.filter((item) => item.isCorrect).map((item) => item.stableKey),
      explanation: question.answerBlocks || [],
    },
    points: 1,
    skills: question.skill ? [{ code: question.skill, primary: true }] : [],
  };
  return {
    schemaVersion: '1.0',
    assessment: {
      id: 'question-preview',
      title: 'Prévia da questão',
      subject: question.subject,
      grade: question.grade,
      instructions: [],
    },
    institution: { id: 'preview', name: 'Prévia de impressão' },
    version: { id: 'preview', code: 'P', seed: 1, generatedAt: new Date().toISOString() },
    candidateFields: [],
    sections: [{ title: '', subject: question.subject, columns: 1, startOnNewPage: false, questions: [renderedQuestion] }],
    questions: [renderedQuestion],
    totals: { points: 1, questions: 1 },
    render: {
      locale: 'pt-BR', paper: 'A4', mode: 'student', template: 'basicexam-v1',
      font: 'plex', fontSize: 11, showBnccSkills: Boolean(question.skill),
    },
  };
}

export async function createQuestionPdfPreview(input) {
  const previewInput = structuredClone(input);
  if (previewInput.type === 'single_choice' && !previewInput.alternatives?.some((item) => item.isCorrect))
    previewInput.alternatives[0].isCorrect = true;
  if (previewInput.type === 'multiple_choice' && previewInput.alternatives?.filter((item) => item.isCorrect).length < 2)
    previewInput.alternatives.slice(0, 2).forEach((item) => { item.isCorrect = true; });
  const question = createQuestionSchema.parse(previewInput);
  await mkdir(previewRoot, { recursive: true });
  const directory = await mkdtemp(path.join(previewRoot, 'questao-'));
  try {
    const snapshot = await materializeQuestionImages(snapshotFromQuestion(question), directory);
    const source = path.join(directory, 'previa.tex');
    const pdf = path.join(directory, 'previa.pdf');
    await writeFile(source, renderAssessment(snapshot), 'utf8');
    await compileAndValidate(source, directory, 'previa');
    return await readFile(pdf);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
