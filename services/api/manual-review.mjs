import { z } from 'zod';
import { transaction } from './db.mjs';
import { gradeSubmission, submissionQuestions } from './submissions.mjs';
import { mobileMutation, assertInstitutionScope } from './mobile-mutations.mjs';
import { recordResultVersion, confirmedAnswers, manualPointsFrom } from './result-versions.mjs';
export const manualReviewSchema = z.object({
  expectedRevision: z.number().int().min(0),
  clientMutationId: z.uuid().optional(),
  expectedInstitutionId: z.uuid().optional(),
  reviews: z.array(z.object({
    questionNumber: z.number().int().min(1).max(1000),
    awardedPoints: z.number().min(0).max(999999).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-7, 'Use no máximo duas casas decimais.'),
    feedback: z.string().trim().max(2000).default(''),
  })).min(1).max(1000),
}).superRefine((value, context) => {
  const numbers = value.reviews.map(review => review.questionNumber);
  if (new Set(numbers).size !== numbers.length) context.addIssue({ code: 'custom', path: ['reviews'], message: 'Cada questão pode ter apenas uma nota manual.' });
});
export function applyManualReview(snapshot, submission, input, reviewerId, reviewedAt = new Date().toISOString()) {
  const value = manualReviewSchema.parse(input);
  const grade = gradeSubmission(snapshot, { candidate: submission.candidate, responses: submission.responses });
  const questions = new Map(snapshot.questions.map(question => [question.number, question]));
  const manual = question => question?.type === 'essay' || question?.type === 'short_answer';
  for (const review of value.reviews) {
    const question = questions.get(review.questionNumber);
    if (!manual(question)) throw Object.assign(new Error(`A questão ${review.questionNumber} não é discursiva nesta avaliação.`), { statusCode: 422 });
    if (review.awardedPoints > (Number(question.points) || 0)) throw Object.assign(new Error(`A nota da questão ${review.questionNumber} deve estar entre 0 e ${question.points}.`), { statusCode: 422 });
  }
  const previous = new Map((submission.result?.items ?? []).map(item => [item.questionNumber, item]));
  const reviews = new Map(value.reviews.map(review => [review.questionNumber, review]));
  grade.result.items = grade.result.items.map(item => {
    if (!manual(questions.get(item.questionNumber))) return item;
    const review = reviews.get(item.questionNumber);
    if (review) return { ...item, status: 'manually_reviewed', awardedPoints: review.awardedPoints, feedback: review.feedback, reviewedBy: reviewerId, reviewedAt };
    const old = previous.get(item.questionNumber);
    if (old?.status === 'manually_reviewed' && Number.isFinite(old.awardedPoints) && old.awardedPoints >= 0 && old.awardedPoints <= item.maxPoints) return { ...item, status: old.status, awardedPoints: old.awardedPoints, feedback: old.feedback, reviewedBy: old.reviewedBy, reviewedAt: old.reviewedAt };
    return item;
  });
  grade.score = Math.round(grade.result.items.reduce((total, item) => total + (item.awardedPoints ?? 0), 0) * 100) / 100;
  grade.requiresManualReview = grade.result.items.some(item => manual(questions.get(item.questionNumber)) && item.awardedPoints == null);
  return grade;
}
export async function saveManualReview({ institutionId, userId, submissionId, input }) {
  const value = manualReviewSchema.parse(input);
  assertInstitutionScope(institutionId, value.expectedInstitutionId);
  return transaction(client => mobileMutation(client, { institutionId, userId, requestId: value.clientMutationId, kind: 'manual-review', entityId: submissionId, input: value }, async () => {
    const result = await client.query(`SELECT s.*,av.snapshot FROM assessment_submissions s
      JOIN assessment_versions av ON av.id=s.assessment_version_id JOIN assessments a ON a.id=av.assessment_id
      WHERE s.id=$1 AND a.institution_id=$2 FOR UPDATE OF s`, [submissionId, institutionId]);
    if (!result.rowCount) throw Object.assign(new Error('Correção não encontrada.'), { statusCode: 404 });
    const row = result.rows[0];
    if (row.revision !== value.expectedRevision) throw Object.assign(new Error('Esta correção foi alterada no servidor. Atualize o resultado e confira as notas antes de sincronizar novamente.'), { statusCode: 409 });
    const grade = applyManualReview(row.snapshot, row, value, userId);
    const updated = await client.query('UPDATE assessment_submissions SET result=$2::jsonb,score=$3,requires_manual_review=$4,revision=revision+1 WHERE id=$1 RETURNING revision', [submissionId, JSON.stringify(grade.result), grade.score, grade.requiresManualReview]);
    // Correções vindas de cartão atualizam a versão provisória do resultado.
    const scan = await client.query('SELECT id,application_student_id FROM card_scans WHERE submission_id=$1 AND application_student_id IS NOT NULL', [submissionId]);
    if (scan.rowCount) await recordResultVersion(client, {
      applicationStudentId: scan.rows[0].application_student_id, source: 'manual_review',
      answers: confirmedAnswers(row.snapshot, row.responses), manualPoints: manualPointsFrom(grade.result),
      cardScanId: scan.rows[0].id, submissionId, userId,
    });
    await client.query("INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'submission.manual_review','submission',$3,$4::jsonb)", [institutionId, userId, submissionId, JSON.stringify({ revision: updated.rows[0].revision, questions: value.reviews.map(review => review.questionNumber), clientMutationId: value.clientMutationId })]);
    return { id: submissionId, questions: submissionQuestions(row.snapshot), versionId: row.assessment_version_id, candidate: row.candidate, responses: row.responses, ...grade, revision: updated.rows[0].revision, submittedAt: row.submitted_at };
  }));
}
