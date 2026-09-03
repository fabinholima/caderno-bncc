import { pool } from './db.mjs';

export async function listCurriculum({ subject = '' } = {}) {
  const result = await pool.query({
    text: `SELECT cs.id AS subject_id, cs.name AS subject, cs.stage,
                  ko.id AS knowledge_object_id, ko.name AS knowledge_object, ko.grade_range,
                  sk.id AS skill_id, sk.code AS skill_code, sk.description AS skill_description
           FROM curriculum_subjects cs
           JOIN knowledge_objects ko ON ko.subject_id = cs.id
           LEFT JOIN curriculum_skills sk ON sk.knowledge_object_id = ko.id
           WHERE ($1 = '' OR cs.name = $1)
           ORDER BY cs.name, ko.grade_range, ko.name, sk.code`,
    values: [subject],
  });
  return result.rows;
}
