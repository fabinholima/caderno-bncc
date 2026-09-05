import { pool } from './db.mjs';
import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  stage: z.string().trim().min(2).max(120),
});

export const createKnowledgeObjectSchema = z.object({
  subjectId: z.string().uuid(),
  name: z.string().trim().min(2).max(240),
  gradeRange: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2_000).optional().or(z.literal('')),
});

export const createSkillSchema = z.object({
  knowledgeObjectId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[0-9A-Z]{4,12}$/),
  description: z.string().trim().min(10).max(2_000),
});

export async function listCurriculum({ subject = '' } = {}) {
  const result = await pool.query({
    text: `SELECT cs.id AS subject_id, cs.name AS subject, cs.stage,
                  ko.id AS knowledge_object_id, ko.name AS knowledge_object, ko.grade_range,
                  sk.id AS skill_id, sk.code AS skill_code, sk.description AS skill_description
           FROM curriculum_subjects cs
           LEFT JOIN knowledge_objects ko ON ko.subject_id = cs.id
           LEFT JOIN skill_knowledge_objects sko ON sko.knowledge_object_id = ko.id
           LEFT JOIN curriculum_skills sk ON sk.id = sko.skill_id
           WHERE ($1 = '' OR cs.name = $1)
           ORDER BY cs.name, ko.grade_range, ko.name, sk.code`,
    values: [subject],
  });
  return result.rows;
}

export async function listHighSchoolCurriculum({ area = '' } = {}) {
  const result = await pool.query({
    text: `SELECT ca.id AS area_id, ca.source_key AS area_source_key, ca.name AS area, ca.stage,
                  cc.id AS competency_id, cc.number AS competency_number,
                  cc.description AS competency_description,
                  sk.id AS skill_id, sk.code AS skill_code,
                  sk.description AS skill_description, sk.grade_range,
                  sk.source_metadata
           FROM curriculum_areas ca
           JOIN curriculum_competencies cc ON cc.area_id = ca.id
           LEFT JOIN skill_competencies sc ON sc.competency_id = cc.id
           LEFT JOIN curriculum_skills sk ON sk.id = sc.skill_id
           WHERE ($1 = '' OR ca.source_key = $1 OR ca.name = $1)
           ORDER BY ca.name, cc.number, sk.code`,
    values: [area],
  });
  return result.rows;
}

export async function createSubject(input) {
  const value = createSubjectSchema.parse(input);
  const result = await pool.query(
    `INSERT INTO curriculum_subjects (name, stage)
     VALUES ($1, $2)
     ON CONFLICT (curriculum_version, name, stage)
     DO UPDATE SET name = EXCLUDED.name
     RETURNING id AS subject_id, name AS subject, stage`,
    [value.name, value.stage],
  );
  return result.rows[0];
}

export async function createKnowledgeObject(input) {
  const value = createKnowledgeObjectSchema.parse(input);
  const result = await pool.query(
    `INSERT INTO knowledge_objects (subject_id, name, grade_range, description)
     VALUES ($1, $2, $3, NULLIF($4, ''))
     ON CONFLICT (subject_id, name, grade_range)
     DO UPDATE SET description = EXCLUDED.description
     RETURNING id AS knowledge_object_id, subject_id, name AS knowledge_object, grade_range, description`,
    [value.subjectId, value.name, value.gradeRange, value.description || ''],
  );
  return result.rows[0];
}

export async function createSkill(input) {
  const value = createSkillSchema.parse(input);
  const context = await pool.query(
    `SELECT cs.curriculum_version, cs.name AS subject, cs.stage, ko.grade_range
     FROM knowledge_objects ko
     JOIN curriculum_subjects cs ON cs.id = ko.subject_id
     WHERE ko.id = $1`,
    [value.knowledgeObjectId],
  );
  if (!context.rowCount)
    throw Object.assign(new Error('Objeto de conhecimento não encontrado.'), {
      statusCode: 404,
    });
  const item = context.rows[0];
  const result = await pool.query(
    `INSERT INTO curriculum_skills
       (curriculum_version, code, stage, subject, grade_range, description, knowledge_object_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (curriculum_version, code)
     DO UPDATE SET stage = EXCLUDED.stage, subject = EXCLUDED.subject,
       grade_range = EXCLUDED.grade_range, description = EXCLUDED.description,
       knowledge_object_id = EXCLUDED.knowledge_object_id
     RETURNING id AS skill_id, code AS skill_code, description AS skill_description, knowledge_object_id`,
    [
      item.curriculum_version,
      value.code,
      item.stage,
      item.subject,
      item.grade_range,
      value.description,
      value.knowledgeObjectId,
    ],
  );
  const created = result.rows[0];
  await pool.query('DELETE FROM skill_knowledge_objects WHERE skill_id = $1', [
    created.skill_id,
  ]);
  await pool.query(
    `INSERT INTO skill_knowledge_objects (skill_id, knowledge_object_id, position)
     VALUES ($1, $2, 1)`,
    [created.skill_id, value.knowledgeObjectId],
  );
  return created;
}
