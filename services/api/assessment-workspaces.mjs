import { z } from 'zod';
import { pool } from './db.mjs';
import { createAssessmentSchema } from './assessments.mjs';

// Incomplete identification and empty sections are valid while drafting.
export const workspaceConfigurationSchema = createAssessmentSchema
  .partial()
  .extend({
    title: z.string().max(180),
    grade: z.string().max(40),
    header: z.object({
      institutionName: z.string().max(300),
      teacherName: z.string().max(160),
      className: z.string().max(80),
      term: z.string().max(80),
      date: z.string().max(40),
      transcriptionPhrase: z.string().max(240),
      logoDataUrl: z.string().max(550000),
    }),
    sections: z
      .array(
        z.object({
          id: z.string().max(100),
          subject: z.string().max(120),
          columns: z.union([z.literal(1), z.literal(2)]),
          startOnNewPage: z.boolean(),
          questionIds: z.array(z.uuid()).max(100),
          fullWidthQuestionIds: z.array(z.uuid()).max(100),
        }),
      )
      .max(20),
  })
  .refine(
    (v) => v.sections.reduce((n, s) => n + s.questionIds.length, 0) <= 100,
    'Máximo de 100 questões.',
  );
export const workspaceSaveSchema = z.object({
  configuration: workspaceConfigurationSchema,
  revision: z.number().int().positive(),
  assessmentId: z.uuid().nullable().default(null),
});
const missing = () =>
  Object.assign(new Error('Montagem não encontrada.'), { statusCode: 404 });
export async function listWorkspaces({ institutionId, userId, offset = 0 }) {
  const r = await pool.query(
    `SELECT id,configuration->>'title' title,configuration->>'grade' grade,
 (SELECT string_agg(s->>'subject', ', ') FROM jsonb_array_elements(configuration->'sections') s) subject,
 assessment_id AS "assessmentId",pinned,revision,updated_at AS "updatedAt"
 FROM assessment_workspaces WHERE institution_id=$1 AND created_by=$2
 ORDER BY pinned DESC,updated_at DESC,id LIMIT 10 OFFSET $3`,
    [institutionId, userId, offset],
  );
  return r.rows;
}
export async function getWorkspace({ institutionId, userId, id }) {
  const r = await pool.query(
    'SELECT id,configuration,revision,pinned,assessment_id AS "assessmentId" FROM assessment_workspaces WHERE id=$1 AND institution_id=$2 AND created_by=$3',
    [id, institutionId, userId],
  );
  if (!r.rowCount) throw missing();
  return r.rows[0];
}
export async function createWorkspace({ institutionId, userId, input }) {
  const configuration = workspaceConfigurationSchema.parse(input.configuration);
  const r = await pool.query(
    'INSERT INTO assessment_workspaces(institution_id,created_by,configuration) VALUES($1,$2,$3) RETURNING id,configuration,revision,pinned,assessment_id AS "assessmentId"',
    [institutionId, userId, configuration],
  );
  return r.rows[0];
}
export async function saveWorkspace({ institutionId, userId, id, input }) {
  const v = workspaceSaveSchema.parse(input);
  if (v.assessmentId) {
    const a = await pool.query(
      'SELECT id FROM assessments WHERE id=$1 AND institution_id=$2 AND created_by=$3',
      [v.assessmentId, institutionId, userId],
    );
    if (!a.rowCount) throw missing();
  }
  const r = await pool.query(
    `UPDATE assessment_workspaces SET configuration=$4,assessment_id=$5,revision=revision+1,updated_at=now()
 WHERE id=$1 AND institution_id=$2 AND created_by=$3 AND revision=$6 RETURNING revision`,
    [id, institutionId, userId, v.configuration, v.assessmentId, v.revision],
  );
  if (!r.rowCount)
    throw Object.assign(
      new Error(
        'Esta montagem foi alterada em outra sessão. Reabra antes de editar.',
      ),
      { statusCode: 409 },
    );
  return r.rows[0];
}
export async function pinWorkspace({ institutionId, userId, id, input }) {
  const { pinned } = z.object({ pinned: z.boolean() }).parse(input);
  const r = await pool.query(
    'UPDATE assessment_workspaces SET pinned=$4 WHERE id=$1 AND institution_id=$2 AND created_by=$3 RETURNING id,pinned',
    [id, institutionId, userId, pinned],
  );
  if (!r.rowCount) throw missing();
  return r.rows[0];
}

export async function deleteWorkspace({ institutionId, userId, id }) {
  const r = await pool.query(
    `DELETE FROM assessment_workspaces
     WHERE id=$1 AND institution_id=$2 AND created_by=$3
     RETURNING id, assessment_id AS "assessmentId"`,
    [id, institutionId, userId],
  );
  if (!r.rowCount) throw missing();
  return {
    id: r.rows[0].id,
    assessmentPreserved: Boolean(r.rows[0].assessmentId),
  };
}
