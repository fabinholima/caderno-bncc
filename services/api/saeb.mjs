import { z } from 'zod';
import { pool } from './db.mjs';

export const saebFiltersSchema = z.object({
  stage: z
    .enum(['Ensino Fundamental', 'Ensino Médio'])
    .optional()
    .or(z.literal('')),
  subject: z.string().trim().max(120).default(''),
  gradeRange: z.string().trim().max(80).default(''),
  matrixId: z.uuid().optional().or(z.literal('')),
});

export async function listSaebMatrices({
  stage = '',
  subject = '',
  gradeRange = '',
} = {}) {
  const filters = saebFiltersSchema
    .pick({ stage: true, subject: true, gradeRange: true })
    .parse({
      stage,
      subject,
      gradeRange,
    });
  const result = await pool.query({
    text: `SELECT m.id, m.source_key, m.name, m.stage, m.subject,
                  m.grade_range, m.version, m.source_url, m.source_metadata,
                  COUNT(DISTINCT t.id)::int AS topic_count,
                  COUNT(DISTINCT d.id)::int AS descriptor_count
           FROM saeb_matrices m
           LEFT JOIN saeb_topics t ON t.matrix_id = m.id
           LEFT JOIN saeb_descriptors d ON d.matrix_id = m.id
           WHERE ($1 = '' OR m.stage = $1)
             AND ($2 = '' OR m.subject = $2)
             AND ($3 = '' OR m.grade_range = $3)
           GROUP BY m.id
           ORDER BY m.subject, m.grade_range`,
    values: [filters.stage, filters.subject, filters.gradeRange],
  });
  return result.rows;
}

export async function listSaebDescriptors({
  stage = '',
  matrixId = '',
  subject = '',
  gradeRange = '',
} = {}) {
  const filters = saebFiltersSchema.parse({
    stage,
    matrixId,
    subject,
    gradeRange,
  });
  const result = await pool.query({
    text: `SELECT d.id, d.code, d.description, d.position,
                  t.id AS topic_id, t.code AS topic_code, t.name AS topic,
                  m.id AS matrix_id, m.name AS matrix, m.subject,
                  m.grade_range, m.version, m.source_url
           FROM saeb_descriptors d
           JOIN saeb_topics t ON t.id = d.topic_id
           JOIN saeb_matrices m ON m.id = d.matrix_id
           WHERE ($1::uuid IS NULL OR m.id = $1::uuid)
             AND ($2 = '' OR m.stage = $2)
             AND ($3 = '' OR m.subject = $3)
             AND ($4 = '' OR m.grade_range = $4)
           ORDER BY m.subject, m.grade_range, t.position, d.position`,
    values: [
      filters.matrixId || null,
      filters.stage,
      filters.subject,
      filters.gradeRange,
    ],
  });
  return result.rows;
}
