import { z } from 'zod';
import { transaction } from './db.mjs';

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(5).max(180),
  subject: z.string().trim().min(2).max(120),
  grade: z.string().trim().min(2).max(40),
  questionIds: z.array(z.string().uuid()).min(1).max(100),
  versionCount: z.number().int().min(1).max(6),
  instructions: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
});

function seededShuffle(items, seed) {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export async function createAssessment({ institutionId, userId, input }) {
  const value = createAssessmentSchema.parse(input);
  return transaction(async (client) => {
    const institution = await client.query('SELECT name FROM institutions WHERE id = $1', [institutionId]);
    const questions = await client.query({
      text: `SELECT q.id, q.current_revision, qr.type, qr.statement, qr.default_points,
                    COALESCE(jsonb_agg(jsonb_build_object('stableKey', a.stable_key, 'content', a.content, 'isCorrect', a.is_correct) ORDER BY a.position) FILTER (WHERE a.id IS NOT NULL), '[]') AS alternatives,
                    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('code', cs.code, 'primary', qs.is_primary)) FILTER (WHERE cs.id IS NOT NULL), '[]') AS skills
             FROM questions q
             JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
             LEFT JOIN alternatives a ON a.question_id = q.id AND a.revision = qr.revision
             LEFT JOIN question_skills qs ON qs.question_id = q.id AND qs.revision = qr.revision
             LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
             WHERE q.institution_id = $1 AND q.id = ANY($2::uuid[])
             GROUP BY q.id, qr.question_id, qr.revision`,
      values: [institutionId, value.questionIds],
    });
    if (questions.rowCount !== value.questionIds.length) throw new Error('Uma ou mais questões não pertencem à instituição.');
    const assessment = await client.query(
      `INSERT INTO assessments (institution_id, title, subject, grade, instructions, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'frozen', $6) RETURNING id`,
      [institutionId, value.title, value.subject, value.grade, value.instructions.join('\n'), userId],
    );
    const versions = [];
    for (let index = 0; index < value.versionCount; index++) {
      const code = String.fromCharCode(65 + index);
      const seed = Date.now() + index * 7919;
      const ordered = seededShuffle(questions.rows, seed);
      const snapshotQuestions = ordered.map((question, position) => {
        const alternatives = seededShuffle(question.alternatives, seed + position + 1);
        return {
          id: crypto.randomUUID(), sourceQuestionId: question.id, sourceRevision: question.current_revision,
          number: position + 1, type: question.type, statement: question.statement,
          alternatives: alternatives.map((answer, answerIndex) => ({ stableKey: answer.stableKey, label: String.fromCharCode(65 + answerIndex), content: answer.content })),
          answer: { correctStableKeys: alternatives.filter((answer) => answer.isCorrect).map((answer) => answer.stableKey) },
          points: Number(question.default_points), skills: question.skills,
        };
      });
      const snapshot = { schemaVersion: '1.0', assessment: { id: assessment.rows[0].id, title: value.title, subject: value.subject, grade: value.grade, instructions: value.instructions }, institution: { id: institutionId, name: institution.rows[0].name }, version: { id: crypto.randomUUID(), code, seed, generatedAt: new Date().toISOString() }, candidateFields: ['name', 'class', 'number', 'date'], questions: snapshotQuestions, totals: { points: snapshotQuestions.reduce((sum, question) => sum + question.points, 0), questions: snapshotQuestions.length }, render: { locale: 'pt-BR', paper: 'A4', mode: 'student', template: 'basicexam-v1' } };
      const answerKey = snapshotQuestions.map((question) => ({ number: question.number, correctStableKeys: question.answer.correctStableKeys }));
      const version = await client.query(`INSERT INTO assessment_versions (assessment_id, code, seed, snapshot, answer_key) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb) RETURNING id`, [assessment.rows[0].id, code, seed, JSON.stringify(snapshot), JSON.stringify(answerKey)]);
      const renderJob = await client.query(`INSERT INTO render_jobs (assessment_version_id, template_version) VALUES ($1, 'basicexam-v1') RETURNING id`, [version.rows[0].id]);
      versions.push({ id: version.rows[0].id, code, status: 'queued', renderJobId: renderJob.rows[0].id });
    }
    return { id: assessment.rows[0].id, title: value.title, status: 'frozen', versions };
  });
}

export { seededShuffle };
