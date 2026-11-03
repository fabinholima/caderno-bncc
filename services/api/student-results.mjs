import { pool } from './db.mjs';
import { myActivities } from './class-invites.mjs';
import { skillPerformance, studentQuestionView, MIN_SKILL_EVIDENCE } from './assessment-results.mjs';

// Consultas do aluno sobre resultados publicados. A posse é verificada pela
// mesma lista de myActivities (vínculo da conta, turma aprovada e matrícula):
// um ID de outro aluno responde como inexistente.

const notFound = () => Object.assign(new Error('Resultado não encontrado.'), { statusCode: 404 });

async function skillDescriptions(codes) {
  if (!codes.length) return new Map();
  const rows = await pool.query(
    `SELECT DISTINCT ON (code) code,description FROM curriculum_skills WHERE code=ANY($1::text[]) ORDER BY code,curriculum_version DESC`,
    [codes],
  );
  return new Map(rows.rows.map((row) => [row.code, row.description]));
}

async function describe(skills) {
  const descriptions = await skillDescriptions(skills.map((skill) => skill.code));
  return skills.map((skill) => ({ ...skill, description: descriptions.get(skill.code) ?? null }));
}

export async function myResultDetail(identity, resultId) {
  const activity = (await myActivities(identity)).find((item) => item.resultId === resultId && item.resultStatus === 'published');
  if (!activity) throw notFound();
  const row = (await pool.query(
    `SELECT v.items,COALESCE(rs.release_policy,'summary') release_policy,
            (SELECT CASE WHEN f.student_guidance_published THEN jsonb_build_object('text',f.student_guidance,'publishedAt',f.created_at) END
             FROM performance_followups f WHERE f.result_id=ar.id ORDER BY f.created_at DESC LIMIT 1) guidance
     FROM assessment_results ar
     JOIN assessment_result_versions v ON v.id=ar.published_version_id
     JOIN application_students aps ON aps.id=ar.application_student_id
     LEFT JOIN application_result_settings rs ON rs.application_id=aps.application_id
     WHERE ar.id=$1`,
    [resultId],
  )).rows[0];
  if (!row) throw notFound();
  return {
    ...activity,
    releasePolicy: row.release_policy,
    questions: studentQuestionView(row.items, row.release_policy),
    skills: await describe(skillPerformance([row.items])),
    minSkillEvidence: MIN_SKILL_EVIDENCE,
    // Só a orientação que o professor publicou na entrada mais recente;
    // observações internas e motivos nunca saem daqui.
    guidance: row.guidance ?? null,
  };
}

// Desempenho por habilidade em cada disciplina, somando as versões publicadas.
export async function mySkillPerformance(identity) {
  const published = (await myActivities(identity)).filter((item) => item.resultStatus === 'published');
  if (!published.length) return [];
  const rows = await pool.query(
    `SELECT ar.id,v.items FROM assessment_results ar JOIN assessment_result_versions v ON v.id=ar.published_version_id WHERE ar.id=ANY($1::uuid[])`,
    [published.map((item) => item.resultId)],
  );
  const items = new Map(rows.rows.map((row) => [row.id, row.items]));
  const bySubject = new Map();
  for (const activity of published) {
    const subject = activity.subject || 'Sem disciplina';
    const entry = bySubject.get(subject) ?? { subject, assessments: 0, lists: [] };
    entry.assessments += 1;
    entry.lists.push(items.get(activity.resultId) ?? []);
    bySubject.set(subject, entry);
  }
  return Promise.all([...bySubject.values()]
    .sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR'))
    .map(async (entry) => ({ subject: entry.subject, assessments: entry.assessments, minSkillEvidence: MIN_SKILL_EVIDENCE, skills: await describe(skillPerformance(entry.lists)) })));
}
