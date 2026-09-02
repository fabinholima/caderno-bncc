import { z } from 'zod';
import { pool, transaction } from './db.mjs';

const richParagraph = (text) => [{ type: 'paragraph', text }];

export const createQuestionSchema = z.object({
  statement: z.string().trim().min(10).max(20_000),
  subject: z.string().trim().min(2).max(120),
  grade: z.string().trim().min(2).max(40),
  skill: z.string().trim().regex(/^[A-Z]{2}[0-9A-Z]{4,12}$/).optional().or(z.literal('')),
  difficulty: z.enum(['Fácil', 'Média', 'Difícil']),
  alternatives: z.array(z.object({
    stableKey: z.string().regex(/^alt-[a-z]$/),
    content: z.string().trim().min(1).max(5_000),
    isCorrect: z.boolean(),
    position: z.number().int().min(1).max(10),
  })).min(2).max(10),
}).superRefine((value, ctx) => {
  if (value.alternatives.filter((answer) => answer.isCorrect).length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'Questões de resposta única precisam de exatamente uma alternativa correta.', path: ['alternatives'] });
  }
});

const difficultyToDb = { 'Fácil': 'easy', 'Média': 'medium', 'Difícil': 'hard' };
const difficultyFromDb = { easy: 'Fácil', medium: 'Média', hard: 'Difícil' };
const statusFromDb = { draft: 'Rascunho', review: 'Em revisão', approved: 'Aprovada', archived: 'Arquivada' };

export async function listQuestions({ institutionId, query = '', subject = '' }) {
  const result = await pool.query({
    text: `
      SELECT q.id, q.public_code, q.status, q.updated_at,
             qr.statement, qr.subject, qr.grade, qr.difficulty,
             COALESCE(cs.code, 'Não vinculada') AS skill,
             COUNT(a.id)::int AS alternatives
      FROM questions q
      JOIN question_revisions qr ON qr.question_id = q.id AND qr.revision = q.current_revision
      LEFT JOIN question_skills qs ON qs.question_id = qr.question_id AND qs.revision = qr.revision AND qs.is_primary
      LEFT JOIN curriculum_skills cs ON cs.id = qs.skill_id
      LEFT JOIN alternatives a ON a.question_id = qr.question_id AND a.revision = qr.revision
      WHERE q.institution_id = $1
        AND ($2 = '' OR qr.subject = $2)
        AND ($3 = '' OR to_tsvector('portuguese', qr.statement::text) @@ plainto_tsquery('portuguese', $3)
             OR q.public_code ILIKE '%' || $3 || '%' OR cs.code ILIKE '%' || $3 || '%')
      GROUP BY q.id, qr.question_id, qr.revision, cs.code
      ORDER BY q.updated_at DESC
      LIMIT 100`,
    values: [institutionId, subject === 'Todas' ? '' : subject, query],
  });
  return result.rows.map((row) => ({
    id: row.id, code: row.public_code,
    statement: row.statement?.[0]?.text ?? '', subject: row.subject, grade: row.grade,
    skill: row.skill, difficulty: difficultyFromDb[row.difficulty], status: statusFromDb[row.status],
    alternatives: row.alternatives, updatedAt: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(row.updated_at),
  }));
}

export async function createQuestion({ institutionId, userId, input }) {
  const value = createQuestionSchema.parse(input);
  return transaction(async (client) => {
    const sequence = await client.query('SELECT COUNT(*)::int + 1 AS next FROM questions WHERE institution_id = $1', [institutionId]);
    const prefix = value.subject === 'Matemática' ? 'MAT' : value.subject === 'Ciências' ? 'CIE' : value.subject === 'História' ? 'HIS' : 'LP';
    const publicCode = `${prefix}-${String(sequence.rows[0].next).padStart(4, '0')}`;
    const question = await client.query(
      `INSERT INTO questions (institution_id, public_code, created_by) VALUES ($1, $2, $3)
       RETURNING id, public_code, status, updated_at`, [institutionId, publicCode, userId],
    );
    await client.query(
      `INSERT INTO question_revisions (question_id, revision, statement, difficulty, subject, grade, authored_by)
       VALUES ($1, 1, $2::jsonb, $3, $4, $5, $6)`,
      [question.rows[0].id, JSON.stringify(richParagraph(value.statement)), difficultyToDb[value.difficulty], value.subject, value.grade, userId],
    );
    for (const alternative of value.alternatives) {
      await client.query(
        `INSERT INTO alternatives (question_id, revision, stable_key, content, is_correct, position)
         VALUES ($1, 1, $2, $3::jsonb, $4, $5)`,
        [question.rows[0].id, alternative.stableKey, JSON.stringify(richParagraph(alternative.content)), alternative.isCorrect, alternative.position],
      );
    }
    if (value.skill) {
      const skill = await client.query('SELECT id FROM curriculum_skills WHERE code = $1 ORDER BY curriculum_version DESC LIMIT 1', [value.skill]);
      if (skill.rowCount) await client.query('INSERT INTO question_skills (question_id, revision, skill_id, is_primary) VALUES ($1, 1, $2, true)', [question.rows[0].id, skill.rows[0].id]);
    }
    return { id: question.rows[0].id, code: publicCode, statement: value.statement, subject: value.subject, grade: value.grade, skill: value.skill || 'Não vinculada', difficulty: value.difficulty, status: 'Rascunho', alternatives: value.alternatives.length, updatedAt: 'Agora' };
  });
}
