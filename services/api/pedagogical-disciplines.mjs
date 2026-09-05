import { z } from 'zod';
import { pool, transaction } from './db.mjs';

export const createPedagogicalDisciplineSchema = z.object({
  name: z.string().trim().min(2).max(120),
  areaSourceKey: z
    .string()
    .trim()
    .regex(/^em-area-[a-z]+$/),
});

export const setDisciplineSkillsSchema = z.object({
  skillIds: z.array(z.string().uuid()).max(200),
});
export const pedagogicalTopicFilterSchema = z.object({
  disciplineId: z.uuid().optional().or(z.literal('')),
});

export async function listPedagogicalDisciplines({ institutionId }) {
  const result = await pool.query(
    `SELECT pd.id, pd.name, pd.stage, ca.id AS area_id, ca.name AS area,
            ca.source_key AS area_source_key, pd.updated_at,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', sk.id, 'code', sk.code, 'description', sk.description,
              'rationale', pds.rationale
            ) ORDER BY sk.code) FILTER (WHERE sk.id IS NOT NULL), '[]') AS skills
     FROM pedagogical_disciplines pd
     JOIN curriculum_areas ca ON ca.id = pd.area_id
     LEFT JOIN pedagogical_discipline_skills pds ON pds.discipline_id = pd.id
     LEFT JOIN curriculum_skills sk ON sk.id = pds.skill_id
     WHERE pd.institution_id = $1
     GROUP BY pd.id, ca.id
     ORDER BY pd.name`,
    [institutionId],
  );
  return result.rows;
}

export async function listPedagogicalTopics({ institutionId, disciplineId = '' }) {
  const value = pedagogicalTopicFilterSchema.parse({ disciplineId });
  const result = await pool.query(
    `SELECT topic.id, topic.name, topic.position, topic.discipline_id,
            parent.id AS parent_id, parent.name AS parent_name,
            pd.name AS discipline
     FROM pedagogical_topics topic
     JOIN pedagogical_disciplines pd ON pd.id = topic.discipline_id
     LEFT JOIN pedagogical_topics parent ON parent.id = topic.parent_id
     WHERE topic.institution_id = $1
       AND ($2::uuid IS NULL OR topic.discipline_id = $2::uuid)
     ORDER BY pd.name, COALESCE(parent.position, topic.position),
              topic.parent_id NULLS FIRST, topic.position, topic.name`,
    [institutionId, value.disciplineId || null],
  );
  return result.rows;
}

export async function createPedagogicalDiscipline({
  institutionId,
  userId,
  input,
}) {
  const value = createPedagogicalDisciplineSchema.parse(input);
  const result = await pool.query(
    `INSERT INTO pedagogical_disciplines
       (institution_id, area_id, name, created_by)
     SELECT $1, id, $2, $3 FROM curriculum_areas
     WHERE curriculum_version = 'BNCC-2018' AND source_key = $4
     ON CONFLICT (institution_id, area_id, name) DO UPDATE SET
       updated_at = now()
     RETURNING id, name, stage, area_id`,
    [institutionId, value.name, userId, value.areaSourceKey],
  );
  if (!result.rowCount)
    throw Object.assign(new Error('Área curricular oficial não encontrada.'), {
      statusCode: 404,
    });
  const discipline = result.rows[0];
  if (value.name === 'Química') {
    await pool.query(
      `INSERT INTO pedagogical_topics (institution_id, discipline_id, name, position)
       VALUES ($1,$2,'Termoquímica',1),($1,$2,'Eletroquímica',2)
       ON CONFLICT DO NOTHING`,
      [institutionId, discipline.id],
    );
    await pool.query(
      `INSERT INTO pedagogical_topics (institution_id, discipline_id, parent_id, name, position)
       SELECT $1, $2, root.id, child.name, child.position
       FROM pedagogical_topics root
       CROSS JOIN (VALUES
         ('Termoquímica','Lei de Hess',1),
         ('Termoquímica','Entalpia de Formação',2),
         ('Termoquímica','Entalpia de Ligação',3),
         ('Eletroquímica','NOX',1),
         ('Eletroquímica','Lei de Faraday',2)
       ) child(parent_name,name,position)
       WHERE root.discipline_id=$2 AND root.parent_id IS NULL
         AND root.name=child.parent_name
       ON CONFLICT DO NOTHING`,
      [institutionId, discipline.id],
    );
  }
  return discipline;
}

export async function setPedagogicalDisciplineSkills({
  institutionId,
  userId,
  disciplineId,
  input,
}) {
  const value = setDisciplineSkillsSchema.parse(input);
  return transaction(async (client) => {
    const discipline = await client.query(
      `SELECT pd.id, pd.area_id
       FROM pedagogical_disciplines pd
       WHERE pd.id = $1 AND pd.institution_id = $2
       FOR UPDATE`,
      [disciplineId, institutionId],
    );
    if (!discipline.rowCount)
      throw Object.assign(new Error('Disciplina pedagógica não encontrada.'), {
        statusCode: 404,
      });
    const uniqueIds = [...new Set(value.skillIds)];
    if (uniqueIds.length) {
      const eligible = await client.query(
        `SELECT DISTINCT sk.id
         FROM curriculum_skills sk
         JOIN skill_competencies sc ON sc.skill_id = sk.id
         JOIN curriculum_competencies cc ON cc.id = sc.competency_id
         WHERE cc.area_id = $1 AND sk.id = ANY($2::uuid[])`,
        [discipline.rows[0].area_id, uniqueIds],
      );
      if (eligible.rowCount !== uniqueIds.length)
        throw Object.assign(
          new Error(
            'Uma ou mais habilidades não pertencem à área selecionada.',
          ),
          { statusCode: 422 },
        );
    }
    await client.query(
      'DELETE FROM pedagogical_discipline_skills WHERE discipline_id = $1',
      [disciplineId],
    );
    for (const skillId of uniqueIds)
      await client.query(
        `INSERT INTO pedagogical_discipline_skills
           (discipline_id, skill_id, tagged_by)
         VALUES ($1, $2, $3)`,
        [disciplineId, skillId, userId],
      );
    await client.query(
      'UPDATE pedagogical_disciplines SET updated_at = now() WHERE id = $1',
      [disciplineId],
    );
    return { id: disciplineId, skillCount: uniqueIds.length };
  });
}
