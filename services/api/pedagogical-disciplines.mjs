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
  includeInactive: z.boolean().default(false),
});

export const createPedagogicalTopicSchema = z.object({
  disciplineId: z.uuid(),
  parentId: z.uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2).max(120),
  gradeRange: z.enum(['1ª série', '2ª série', '3ª série']).optional(),
});

export const updatePedagogicalTopicSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    gradeRange: z.enum(['1ª série', '2ª série', '3ª série']).optional(),
    position: z.number().int().min(1).max(1000).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe uma alteração.');

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

export async function listPedagogicalTopics({
  institutionId,
  disciplineId = '',
  includeInactive = false,
}) {
  const value = pedagogicalTopicFilterSchema.parse({
    disciplineId,
    includeInactive,
  });
  const result = await pool.query(
    `WITH RECURSIVE topic_tree AS (
       SELECT topic.id, topic.name, topic.position, topic.discipline_id,
              topic.parent_id, topic.grade_range, topic.active, 0 AS depth,
              ARRAY[topic.name] AS name_path,
              ARRAY[topic.position] AS position_path
       FROM pedagogical_topics topic
       WHERE topic.parent_id IS NULL AND topic.institution_id = $1
         AND ($2::uuid IS NULL OR topic.discipline_id = $2::uuid)
         AND ($3 OR topic.active)
       UNION ALL
       SELECT child.id, child.name, child.position, child.discipline_id,
              child.parent_id, COALESCE(child.grade_range, tree.grade_range),
              child.active, tree.depth + 1, tree.name_path || child.name,
              tree.position_path || child.position
       FROM pedagogical_topics child
       JOIN topic_tree tree ON tree.id = child.parent_id
       WHERE child.institution_id = $1 AND ($3 OR child.active)
     )
     SELECT tree.id, tree.name, tree.position, tree.discipline_id,
            tree.parent_id, parent.name AS parent_name, tree.grade_range,
            tree.active, tree.depth,
            array_to_string(tree.name_path, ' > ') AS path,
            pd.name AS discipline
     FROM topic_tree tree
     JOIN pedagogical_disciplines pd ON pd.id = tree.discipline_id
     LEFT JOIN pedagogical_topics parent ON parent.id = tree.parent_id
     ORDER BY pd.name, tree.grade_range, tree.position_path, tree.name`,
    [institutionId, value.disciplineId || null, value.includeInactive],
  );
  return result.rows;
}

export async function createPedagogicalTopic({ institutionId, userId, input }) {
  const value = createPedagogicalTopicSchema.parse(input);
  return transaction(async (client) => {
    const discipline = await client.query(
      `SELECT id FROM pedagogical_disciplines
       WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
      [value.disciplineId, institutionId],
    );
    if (!discipline.rowCount)
      throw Object.assign(new Error('Disciplina não encontrada.'), {
        statusCode: 404,
      });
    let gradeRange = value.gradeRange || null;
    if (value.parentId) {
      const parent = await client.query(
        `WITH RECURSIVE ancestry AS (
           SELECT id,parent_id,grade_range,0 AS depth
           FROM pedagogical_topics
           WHERE id=$1 AND institution_id=$2 AND discipline_id=$3
           UNION ALL
           SELECT parent.id,parent.parent_id,
                  COALESCE(ancestry.grade_range,parent.grade_range),
                  ancestry.depth+1
           FROM ancestry JOIN pedagogical_topics parent
             ON parent.id=ancestry.parent_id
         )
         SELECT grade_range,MAX(depth)::int AS depth
         FROM ancestry GROUP BY grade_range`,
        [value.parentId, institutionId, value.disciplineId],
      );
      if (!parent.rowCount)
        throw Object.assign(new Error('Nível superior não encontrado.'), {
          statusCode: 404,
        });
      if (parent.rows[0].depth >= 2)
        throw Object.assign(
          new Error('A hierarquia aceita objeto, subtópico e detalhamento.'),
          { statusCode: 422 },
        );
      gradeRange = parent.rows[0].grade_range;
    }
    if (!gradeRange)
      throw Object.assign(new Error('Informe a série do objeto.'), {
        statusCode: 422,
      });
    const position = await client.query(
      `SELECT COALESCE(MAX(position),0)+1 AS next
       FROM pedagogical_topics
       WHERE discipline_id=$1 AND parent_id IS NOT DISTINCT FROM $2::uuid`,
      [value.disciplineId, value.parentId || null],
    );
    const created = await client.query(
      `INSERT INTO pedagogical_topics
         (institution_id,discipline_id,parent_id,name,grade_range,position,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,name,parent_id,grade_range,position,active`,
      [
        institutionId,
        value.disciplineId,
        value.parentId || null,
        value.name,
        gradeRange,
        position.rows[0].next,
        userId,
      ],
    );
    return created.rows[0];
  });
}

export async function updatePedagogicalTopic({
  institutionId,
  userId,
  topicId,
  input,
}) {
  const value = updatePedagogicalTopicSchema.parse(input);
  const updated = await pool.query(
    `UPDATE pedagogical_topics
     SET name=COALESCE($3,name),
         grade_range=CASE WHEN parent_id IS NULL
                          THEN COALESCE($4,grade_range) ELSE grade_range END,
         position=COALESCE($5,position),active=COALESCE($6,active),
         updated_by=$7,updated_at=now()
     WHERE id=$1 AND institution_id=$2
     RETURNING id,name,parent_id,grade_range,position,active`,
    [
      topicId,
      institutionId,
      value.name || null,
      value.gradeRange || null,
      value.position || null,
      value.active,
      userId,
    ],
  );
  if (!updated.rowCount)
    throw Object.assign(new Error('Objeto ou subtópico não encontrado.'), {
      statusCode: 404,
    });
  return updated.rows[0];
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
