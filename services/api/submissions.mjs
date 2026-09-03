import { z } from 'zod';
import { pool } from './db.mjs';

const responseSchema = z.object({
  questionNumber: z.number().int().min(1).max(1000),
  selectedLabels: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Z]$/),
    )
    .max(10)
    .default([]),
  text: z.string().trim().max(20_000).optional().or(z.literal('')),
});

export const createSubmissionSchema = z
  .object({
    candidate: z
      .object({
        name: z.string().trim().min(2).max(160),
        class: z.string().trim().max(80).optional().or(z.literal('')),
        number: z.string().trim().max(40).optional().or(z.literal('')),
      })
      .strict(),
    responses: z.array(responseSchema).max(1000),
  })
  .superRefine((value, context) => {
    const numbers = value.responses.map((response) => response.questionNumber);
    if (new Set(numbers).size !== numbers.length)
      context.addIssue({
        code: 'custom',
        path: ['responses'],
        message: 'Cada questão pode ter apenas uma resposta.',
      });
  });

function sameSet(left, right) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

export function gradeSubmission(snapshot, input) {
  const value = createSubmissionSchema.parse(input);
  const responses = new Map(
    value.responses.map((response) => [response.questionNumber, response]),
  );
  const questions = Array.isArray(snapshot?.questions)
    ? snapshot.questions
    : [];
  if (!questions.length) throw new Error('Versão da avaliação sem questões.');
  const validNumbers = new Set(questions.map((question) => question.number));
  const unknown = value.responses.find(
    (response) => !validNumbers.has(response.questionNumber),
  );
  if (unknown)
    throw Object.assign(
      new Error(
        `A questão ${unknown.questionNumber} não pertence à avaliação.`,
      ),
      { statusCode: 422 },
    );

  let score = 0;
  let maxScore = 0;
  let requiresManualReview = false;
  const items = questions.map((question) => {
    const points = Number(question.points) || 0;
    maxScore += points;
    const response = responses.get(question.number);
    if (question.type === 'essay' || question.type === 'short_answer') {
      requiresManualReview = true;
      return {
        questionNumber: question.number,
        status: response?.text ? 'pending_manual_review' : 'unanswered',
        awardedPoints: null,
        maxPoints: points,
      };
    }
    const correctKeys = question.answer?.correctStableKeys ?? [];
    const correctLabels = (question.alternatives ?? [])
      .filter((alternative) => correctKeys.includes(alternative.stableKey))
      .map((alternative) => alternative.label)
      .sort();
    const selectedLabels = [...(response?.selectedLabels ?? [])].sort();
    const correct = sameSet(selectedLabels, correctLabels);
    if (correct) score += points;
    return {
      questionNumber: question.number,
      status: correct
        ? 'correct'
        : selectedLabels.length
          ? 'incorrect'
          : 'unanswered',
      selectedLabels,
      correctLabels,
      awardedPoints: correct ? points : 0,
      maxPoints: points,
    };
  });
  return {
    candidate: value.candidate,
    responses: value.responses,
    result: { items },
    score,
    maxScore,
    requiresManualReview,
  };
}

export async function createSubmission({ institutionId, versionId, input }) {
  const version = await pool.query({
    text: `SELECT av.snapshot
           FROM assessment_versions av
           JOIN assessments a ON a.id = av.assessment_id
           WHERE av.id = $1 AND a.institution_id = $2`,
    values: [versionId, institutionId],
  });
  if (!version.rowCount)
    throw Object.assign(new Error('Versão da avaliação não encontrada.'), {
      statusCode: 404,
    });
  const graded = gradeSubmission(version.rows[0].snapshot, input);
  const result = await pool.query({
    text: `INSERT INTO assessment_submissions
             (assessment_version_id, candidate, responses, result, score, max_score, requires_manual_review)
           VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7)
           RETURNING id, submitted_at`,
    values: [
      versionId,
      JSON.stringify(graded.candidate),
      JSON.stringify(graded.responses),
      JSON.stringify(graded.result),
      graded.score,
      graded.maxScore,
      graded.requiresManualReview,
    ],
  });
  return {
    id: result.rows[0].id,
    versionId,
    submittedAt: result.rows[0].submitted_at,
    ...graded,
  };
}

export async function getSubmission({ institutionId, submissionId }) {
  const result = await pool.query({
    text: `SELECT s.id, s.assessment_version_id, s.candidate, s.responses,
                  s.result, s.score, s.max_score, s.requires_manual_review,
                  s.submitted_at
           FROM assessment_submissions s
           JOIN assessment_versions av ON av.id = s.assessment_version_id
           JOIN assessments a ON a.id = av.assessment_id
           WHERE s.id = $1 AND a.institution_id = $2`,
    values: [submissionId, institutionId],
  });
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    versionId: row.assessment_version_id,
    candidate: row.candidate,
    responses: row.responses,
    result: row.result,
    score: Number(row.score),
    maxScore: Number(row.max_score),
    requiresManualReview: row.requires_manual_review,
    submittedAt: row.submitted_at,
  };
}

export async function listSubmissions({ institutionId, versionId }) {
  const result = await pool.query({
    text: `SELECT s.id, s.candidate, s.score, s.max_score,
                  s.requires_manual_review, s.submitted_at
           FROM assessment_submissions s
           JOIN assessment_versions av ON av.id = s.assessment_version_id
           JOIN assessments a ON a.id = av.assessment_id
           WHERE s.assessment_version_id = $1 AND a.institution_id = $2
           ORDER BY s.submitted_at DESC
           LIMIT 500`,
    values: [versionId, institutionId],
  });
  return result.rows.map((row) => ({
    id: row.id,
    candidate: row.candidate,
    score: Number(row.score),
    maxScore: Number(row.max_score),
    requiresManualReview: row.requires_manual_review,
    submittedAt: row.submitted_at,
  }));
}
