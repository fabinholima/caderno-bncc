import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
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
const previewCache = new Map();
const previewCacheLimit = 24;

export function snapshotFromQuestion(question, mode = 'student') {
  const explanation = question.answerBlocks?.length
    ? question.answerBlocks
    : question.answerGuide ? [{type:'paragraph',text:question.answerGuide}] : [];
  const alternatives = question.alternatives.map((alternative, index) => ({
    stableKey: alternative.stableKey,
    label: question.type === 'true_false' ? (alternative.stableKey === 'alt-a' ? 'C' : 'E') : String.fromCharCode(65 + index),
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
      : [
          { type: 'paragraph', text: question.statement },
          ...(question.mathFormula ? [{ type: 'math', tex: question.mathFormula }] : []),
          ...(question.chemicalFormula ? [{ type: 'chemical', formula: question.chemicalFormula }] : []),
          ...(question.metapostCode ? [{ type: 'metapost', code: question.metapostCode }] : []),
        ],
    alternatives,
    answer: {
      correctStableKeys: question.alternatives.filter((item) => item.isCorrect).map((item) => item.stableKey),
      explanation: mode === 'answer-key' ? explanation : [],
    },
    points: 1,
    skills: question.skill ? [{ code: question.skill, primary: true }] : [],
  };
  return {
    schemaVersion: '1.0',
    assessment: {
      id: 'question-preview',
      title: mode === 'answer-key' ? 'Prévia da resolução' : 'Prévia da questão',
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
      locale: 'pt-BR', paper: 'A4', mode, template: question.type === 'true_false' ? 'certo-errado-v1' : 'basicexam-v1',
      font: 'plex', fontSize: 11, showBnccSkills: Boolean(question.skill), previewOnly: true,
    },
  };
}

export async function createQuestionPdfPreview(input) {
  const previewInput = structuredClone(input);
  const previewMode=z.enum(['student','answer-key']).default('student').parse(previewInput.previewMode);
  // A prévia pode ser solicitada antes de o usuário preencher os dados de
  // origem. O cadastro definitivo continua exigindo esses campos, mas eles
  // não devem impedir a visualização do layout da questão.
  if (!String(previewInput.sourceInstitution || '').trim())
    previewInput.sourceInstitution = 'UfaProva';
  if (!Number.isInteger(previewInput.sourceYear))
    previewInput.sourceYear = new Date().getFullYear();
  const cacheKey = createHash('sha256')
    .update(JSON.stringify({previewMode,input:previewInput}))
    .digest('hex');
  const cached = previewCache.get(cacheKey);
  if (cached) return cached;
  if (previewMode === 'student' && ['single_choice', 'true_false'].includes(previewInput.type) && !previewInput.alternatives?.some((item) => item.isCorrect))
    previewInput.alternatives[0].isCorrect = true;
  if (previewMode === 'student' && previewInput.type === 'multiple_choice' && previewInput.alternatives?.filter((item) => item.isCorrect).length < 2)
    previewInput.alternatives.slice(0, 2).forEach((item) => { item.isCorrect = true; });
  const question = createQuestionSchema.parse(previewInput);
  if(previewMode==='answer-key'&&!question.answerBlocks?.length&&!question.answerGuide?.trim())
    throw Object.assign(new Error('Adicione a resolução ou o gabarito comentado antes de gerar esta prévia.'),{statusCode:422});
  await mkdir(previewRoot, { recursive: true });
  const directory = await mkdtemp(path.join(previewRoot, 'questao-'));
  try {
    const snapshot = await materializeQuestionImages(snapshotFromQuestion(question, previewMode), directory);
    const source = path.join(directory, 'previa.tex');
    const pdf = path.join(directory, 'previa.pdf');
    await writeFile(source, renderAssessment(snapshot), 'utf8');
    await compileAndValidate(source, directory, 'previa');
    const contents = await readFile(pdf);
    previewCache.set(cacheKey, contents);
    while (previewCache.size > previewCacheLimit)
      previewCache.delete(previewCache.keys().next().value);
    return contents;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
