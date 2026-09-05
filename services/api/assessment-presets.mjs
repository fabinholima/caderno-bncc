import { z } from 'zod';
import {
  DEFAULT_RENDER_FONT,
  DEFAULT_RENDER_TEMPLATE,
  renderFontIds,
  renderTemplateIds,
} from '../../lib/render-templates.mjs';
import { assessmentHeaderSchema } from './assessments.mjs';
import { pool } from './db.mjs';

export const assessmentPresetSchema = z.object({
  name: z.string().trim().min(2).max(80),
  configuration: z.object({
    header: assessmentHeaderSchema,
    paper: z.enum(['A4', 'A5']).default('A4'),
    template: z.enum(renderTemplateIds).default(DEFAULT_RENDER_TEMPLATE),
    font: z.enum(renderFontIds).default(DEFAULT_RENDER_FONT),
    fontSize: z.number().int().min(10).max(16).default(11),
  }),
});

function formatPreset(row) {
  return {
    id: row.id,
    name: row.name,
    configuration: row.configuration,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAssessmentPresets({ institutionId, userId }) {
  const result = await pool.query({
    text: `SELECT id, name, configuration, created_at, updated_at
           FROM assessment_presets
           WHERE institution_id = $1 AND user_id = $2
           ORDER BY updated_at DESC, name`,
    values: [institutionId, userId],
  });
  return result.rows.map(formatPreset);
}

export async function saveAssessmentPreset({ institutionId, userId, input }) {
  const value = assessmentPresetSchema.parse(input);
  const result = await pool.query({
    text: `INSERT INTO assessment_presets
             (institution_id, user_id, name, configuration)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (institution_id, user_id, name)
           DO UPDATE SET configuration = EXCLUDED.configuration, updated_at = now()
           RETURNING id, name, configuration, created_at, updated_at`,
    values: [
      institutionId,
      userId,
      value.name,
      JSON.stringify(value.configuration),
    ],
  });
  return formatPreset(result.rows[0]);
}

export async function deleteAssessmentPreset({
  institutionId,
  userId,
  presetId,
}) {
  const result = await pool.query({
    text: `DELETE FROM assessment_presets
           WHERE id = $1 AND institution_id = $2 AND user_id = $3
           RETURNING id`,
    values: [presetId, institutionId, userId],
  });
  return result.rowCount > 0;
}
