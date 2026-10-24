import { z } from 'zod';
import { pool, transaction } from './db.mjs';

export function normalizeHighSchoolGrade(value) {
  const text = String(value ?? '').trim().toLowerCase();
  const match = text.match(/([123])/);
  if (!match) return value;
  if (!/(?:ano|s[ée]rie)/i.test(text)) return value;
  return `${match[1]}ª série`;
}

export const createPedagogicalDisciplineSchema = z.object({
  name: z.string().trim().min(2).max(120),
  areaSourceKey: z
    .string()
    .trim()
    .regex(/^em-area-[a-z]+$/),
});

export const setDisciplineSkillsSchema = z.object({
  skillIds: z.array(z.uuid()).max(200),
});
export const pedagogicalTopicFilterSchema = z.object({
  disciplineId: z.uuid().optional().or(z.literal('')),
  includeInactive: z.boolean().default(false),
});

export const createPedagogicalTopicSchema = z.object({
  disciplineId: z.uuid(),
  parentId: z.uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2).max(120),
  gradeRange: z.preprocess(canonicalTopicGrade, z.enum(['1ª série', '2ª série', '3ª série']).optional()),
});

export const updatePedagogicalTopicSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    gradeRange: z.preprocess(canonicalTopicGrade, z.enum(['1ª série', '2ª série', '3ª série']).optional()),
    position: z.number().int().min(1).max(1000).optional(),
    active: z.boolean().optional(),
    move: z.enum(['up', 'down']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe uma alteração.');

function canonicalTopicGrade(value) {
  if (typeof value !== 'string') return value;
  const match = value.trim().match(/^([1-3])\s*[ºª°oa]?\s*(?:ano|s[ée]rie)$/i);
  return match ? `${match[1]}ª série` : value;
}

function catalogConflict(error) {
  if (error.code === '23505' && ['pedagogical_topics_root_unique', 'pedagogical_topics_child_unique'].includes(error.constraint))
    throw Object.assign(new Error('Já existe um item com esse nome nesse nível do catálogo. Confira os itens cadastrados, inclusive os arquivados.'), { statusCode: 409 });
  throw error;
}

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
              topic.parent_id, topic.grade_range, topic.active, topic.active AS effective_active, 0 AS depth,
              ARRAY[topic.name] AS name_path,
              ARRAY[lpad(topic.position::text,10,'0') || topic.name || topic.id::text] AS position_path
       FROM pedagogical_topics topic
       WHERE topic.parent_id IS NULL AND topic.institution_id = $1
         AND ($2::uuid IS NULL OR topic.discipline_id = $2::uuid)
         AND ($3 OR topic.active)
       UNION ALL
       SELECT child.id, child.name, child.position, child.discipline_id,
              child.parent_id, COALESCE(tree.grade_range, child.grade_range),
              child.active, child.active AND tree.effective_active, tree.depth + 1, tree.name_path || child.name,
              tree.position_path || (lpad(child.position::text,10,'0') || child.name || child.id::text)
       FROM pedagogical_topics child
       JOIN topic_tree tree ON tree.id = child.parent_id
       WHERE child.institution_id = $1
         AND child.discipline_id = tree.discipline_id AND ($3 OR child.active)
     )
     SELECT tree.id, tree.name, tree.position, tree.discipline_id,
            tree.parent_id, parent.name AS parent_name, tree.grade_range,
            tree.active, tree.effective_active, tree.depth,
            array_to_string(tree.name_path, ' > ') AS path,
            pd.name AS discipline, pd.stage AS discipline_stage,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', skill.id, 'code', skill.code,
                'description', skill.description
              ) ORDER BY skill.code)
              FROM pedagogical_topic_skills relation
              JOIN curriculum_skills skill ON skill.id = relation.skill_id
              WHERE relation.topic_id = tree.id
            ), '[]'::jsonb) AS skills
     FROM topic_tree tree
     JOIN pedagogical_disciplines pd ON pd.id = tree.discipline_id
     LEFT JOIN pedagogical_topics parent ON parent.id = tree.parent_id
     ORDER BY pd.name, tree.grade_range, tree.position_path, tree.name_path, tree.id`,
    [institutionId, value.disciplineId || null, value.includeInactive],
  );
  return result.rows.map((row) => ({
    ...row,
    grade_range: row.discipline_stage === 'Ensino Médio' ? canonicalTopicGrade(row.grade_range) : row.grade_range,
  }));
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
           SELECT id,parent_id,grade_range,active,0 AS depth
           FROM pedagogical_topics
           WHERE id=$1 AND institution_id=$2 AND discipline_id=$3
           UNION ALL
           SELECT parent.id,parent.parent_id,
                  COALESCE(ancestry.grade_range,parent.grade_range),
                  parent.active,ancestry.depth+1
           FROM ancestry JOIN pedagogical_topics parent
             ON parent.id=ancestry.parent_id
           WHERE parent.institution_id=$2 AND parent.discipline_id=$3
         )
         SELECT (array_agg(grade_range ORDER BY depth)
                   FILTER (WHERE grade_range IS NOT NULL))[1] AS grade_range,
                MAX(depth)::int AS depth, bool_and(active) AS active
         FROM ancestry HAVING COUNT(*) > 0`,
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
      if (!parent.rows[0].active)
        throw Object.assign(new Error('Reative o nível superior antes de adicionar um subtópico.'), { statusCode: 422 });
      const inheritedGrade = canonicalTopicGrade(parent.rows[0].grade_range);
      if (value.gradeRange && inheritedGrade && value.gradeRange !== inheritedGrade)
        throw Object.assign(new Error('O nível superior pertence a outra série. Selecione um objeto da série informada.'), { statusCode: 422 });
      gradeRange = inheritedGrade || gradeRange;
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
  }).catch(catalogConflict);
}

export async function updatePedagogicalTopic({
  institutionId,
  userId,
  topicId,
  input,
}) {
  const value = updatePedagogicalTopicSchema.parse(input);
  return transaction(async (client) => {
    // Serialize catalog changes with creation and imports for this discipline.
    const owner = await client.query(
      `SELECT discipline_id FROM pedagogical_topics WHERE id=$1 AND institution_id=$2`,
      [topicId, institutionId],
    );
    if (!owner.rowCount) throw Object.assign(new Error('Objeto ou subtópico não encontrado.'), {statusCode: 404});
    await client.query('SELECT id FROM pedagogical_disciplines WHERE id=$1 AND institution_id=$2 FOR UPDATE', [owner.rows[0].discipline_id, institutionId]);
    if (value.gradeRange) {
      const topic = await client.query('SELECT parent_id FROM pedagogical_topics WHERE id=$1 AND institution_id=$2', [topicId, institutionId]);
      if (topic.rows[0]?.parent_id) throw Object.assign(new Error('Altere a série no tópico superior. Os subtópicos acompanham a mesma série.'), {statusCode: 422});
    }
    const updated = await client.query(
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
    if (value.move) {
      const siblings = await client.query(
        `SELECT sibling.id FROM pedagogical_topics sibling
         JOIN pedagogical_topics topic ON topic.id=$1 AND topic.institution_id=$2
         WHERE sibling.institution_id=$2 AND sibling.discipline_id=topic.discipline_id
           AND sibling.parent_id IS NOT DISTINCT FROM topic.parent_id
           AND (topic.parent_id IS NOT NULL OR sibling.grade_range IS NOT DISTINCT FROM topic.grade_range)
         ORDER BY sibling.position,sibling.name,sibling.id`, [topicId,institutionId]);
      const ids = siblings.rows.map(row => row.id);
      const index = ids.indexOf(topicId);
      const target = index + (value.move === 'up' ? -1 : 1);
      if (index >= 0 && target >= 0 && target < ids.length) {
        [ids[index],ids[target]] = [ids[target],ids[index]];
        await client.query(
          `UPDATE pedagogical_topics topic SET position=ordered.position::int,updated_by=$3,updated_at=now()
           FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id,position)
           WHERE topic.id=ordered.id AND topic.institution_id=$2`, [ids,institutionId,userId]);
        updated.rows[0].position = target + 1;
      }
    }
    if (value.gradeRange) {
      await client.query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM pedagogical_topics WHERE parent_id=$1 AND institution_id=$2 AND discipline_id=$5
           UNION
           SELECT child.id FROM pedagogical_topics child JOIN descendants parent ON child.parent_id=parent.id
           WHERE child.institution_id=$2 AND child.discipline_id=$5
         )
         UPDATE pedagogical_topics SET grade_range=$3,updated_by=$4,updated_at=now()
         WHERE id IN (SELECT id FROM descendants) AND institution_id=$2`,
        [topicId,institutionId,value.gradeRange,userId,owner.rows[0].discipline_id],
      );
    }
    return updated.rows[0];
  }).catch(catalogConflict);
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

export const deletePedagogicalTopicSchema = z.object({
  expectedTopicIds: z.array(z.uuid()).min(1).max(2000),
});

export async function deletePedagogicalTopic({institutionId, topicId, input}) {
  const value = deletePedagogicalTopicSchema.parse(input);
  topicId = z.uuid().parse(topicId).toLowerCase();
  institutionId = z.uuid().parse(institutionId).toLowerCase();
  return transaction(async client => {
    // JSON drafts/imports have no FK: protect their checks as well as revision FKs.
    await client.query(`LOCK TABLE pedagogical_topics, question_revisions,
      question_editor_drafts, exam_imports, pedagogical_topic_skills IN SHARE ROW EXCLUSIVE MODE`);
    const subtree = await client.query(`WITH RECURSIVE subtree AS (
      SELECT id,institution_id,discipline_id FROM pedagogical_topics WHERE id=$1 AND institution_id=$2
      UNION
      SELECT child.id,child.institution_id,child.discipline_id FROM pedagogical_topics child
      JOIN subtree parent ON child.parent_id=parent.id
    ) SELECT * FROM subtree`, [topicId,institutionId]);
    if (!subtree.rowCount) throw Object.assign(new Error('Tópico ou subtópico não encontrado.'),{statusCode:404});
    const disciplineId = subtree.rows.find(row=>row.id===topicId).discipline_id;
    if (subtree.rows.some(row=>row.institution_id!==institutionId || row.discipline_id!==disciplineId))
      throw Object.assign(new Error('A hierarquia contém vínculos inconsistentes. Revise o catálogo antes de excluir.'),{statusCode:409});
    const ids = subtree.rows.map(row=>row.id).sort();
    const expected = [...new Set(value.expectedTopicIds.map(id=>id.toLowerCase()))].sort();
    if (ids.length!==expected.length || ids.some((id,index)=>id!==expected[index]))
      throw Object.assign(new Error('O tópico foi alterado. Atualize o catálogo e confirme a exclusão novamente.'),{statusCode:409});
    const used = await client.query(`SELECT
      EXISTS(SELECT 1 FROM question_revisions WHERE pedagogical_topic_id=ANY($1::uuid[])) OR
      EXISTS(SELECT 1 FROM question_editor_drafts draft CROSS JOIN unnest($1::uuid[]) AS topic(id)
        WHERE draft.completed_at IS NULL AND lower(draft.payload::text) LIKE '%' || topic.id::text || '%') OR
      EXISTS(SELECT 1 FROM exam_imports imported CROSS JOIN unnest($1::uuid[]) AS topic(id)
        WHERE lower(imported.extracted_candidates::text) LIKE '%' || topic.id::text || '%') AS linked`,[ids]);
    if (used.rows[0].linked) throw Object.assign(new Error('Este item ou um de seus subtópicos está vinculado a questões, rascunhos ou importações. Arquive o item para preservar os vínculos.'),{statusCode:409});
    await client.query('DELETE FROM pedagogical_topics WHERE institution_id=$1 AND id=ANY($2::uuid[])',[institutionId,ids]);
    return {id:topicId,deletedCount:ids.length};
  });
}
