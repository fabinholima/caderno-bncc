import { z } from 'zod';
import { pool, transaction } from './db.mjs';

const list = z.array(z.string().trim().min(1).max(100)).max(30).default([]);
export const schoolSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(140),
  schoolType: z.enum(['municipal', 'estadual', 'federal', 'privada', 'outra']),
  cnpj: z
    .string()
    .regex(/^(?:\d{14})?$/, 'Use 14 dígitos no CNPJ.')
    .default(''),
  inep: z
    .string()
    .regex(/^(?:\d{8})?$/, 'Use 8 dígitos no código INEP.')
    .default(''),
  address: z.string().trim().min(3).max(240),
  city: z.string().trim().min(2).max(100),
  state: z.enum([
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
  ]),
  postalCode: z
    .string()
    .regex(/^(?:\d{8})?$/, 'Use 8 dígitos no CEP.')
    .default(''),
  phone: z.string().trim().max(30).default(''),
  email: z.union([z.email(), z.literal('')]).default(''),
  logoDataUrl: z
    .string()
    .max(550000)
    .refine(
      (v) =>
        !v ||
        (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) &&
          Buffer.byteLength(v.split(',')[1], 'base64') <= 400000),
      'Use logotipo PNG/JPEG de até 400 KB.',
    )
    .default(''),
});
export const educatorSchema = z
  .object({
    professionalRole: z.enum(['teacher', 'coordinator']),
    phone: z.string().trim().max(30).default(''),
    subjects: list,
    grades: list,
    stages: list,
    selfieDataUrl: z.string().max(550000).refine((v) => !v || (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.byteLength(v.split(',')[1], 'base64') <= 400000), 'Use selfie PNG/JPEG de até 400 KB.').default(''),
    school: schoolSchema,
  })
  .superRefine((v, ctx) => {
    if (
      v.professionalRole === 'teacher' &&
      (!v.subjects.length || !v.grades.length)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Informe disciplinas e séries em que leciona.',
      });
    if (v.professionalRole === 'coordinator' && !v.stages.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Informe as etapas sob sua coordenação.',
      });
  });

export async function getEducatorProfile(userId) {
  const profile = await pool.query(
    `SELECT professional_role AS "professionalRole",phone,subjects,grades,stages,selfie_data_url AS "selfieDataUrl" FROM educator_profiles WHERE user_id=$1`,
    [userId],
  );
  const schools = await pool.query(
    `SELECT id,name,school_type AS "schoolType",cnpj,inep,address,city,state,postal_code AS "postalCode",phone,email,logo_data_url AS "logoDataUrl" FROM educator_schools WHERE user_id=$1 ORDER BY created_at,id`,
    [userId],
  );
  const user = await pool.query('SELECT display_name FROM users WHERE id=$1', [
    userId,
  ]);
  return {
    profile: profile.rows[0] || null,
    schools: schools.rows,
    teacherName: user.rows[0]?.display_name || '',
  };
}

export async function saveEducatorProfile(userId, input) {
  const v = educatorSchema.parse(input),
    s = v.school;
  return transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const values = [
      userId,
      s.name,
      s.schoolType,
      s.cnpj,
      s.inep,
      s.address,
      s.city,
      s.state,
      s.postalCode,
      s.phone,
      s.email,
      s.logoDataUrl,
    ];
    let result;
    if (s.id)
      result = await db.query(
        `UPDATE educator_schools SET name=$2,school_type=$3,cnpj=$4,inep=$5,address=$6,city=$7,state=$8,postal_code=$9,phone=$10,email=$11,logo_data_url=$12,updated_at=now() WHERE user_id=$1 AND id=$13 RETURNING id`,
        [...values, s.id],
      );
    else {
      const count = await db.query(
        'SELECT count(*)::int n FROM educator_schools WHERE user_id=$1',
        [userId],
      );
      const schoolLimit = v.professionalRole === 'teacher' ? 6 : 30;
      if (count.rows[0].n >= schoolLimit)
        throw Object.assign(new Error(`Limite de ${schoolLimit} escolas no perfil.`), {
          statusCode: 422,
        });
      result = await db.query(
        `INSERT INTO educator_schools(user_id,name,school_type,cnpj,inep,address,city,state,postal_code,phone,email,logo_data_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        values,
      );
    }
    if (!result.rowCount)
      throw Object.assign(new Error('Escola não encontrada no seu cadastro.'), {
        statusCode: 404,
      });
    await db.query(
      `INSERT INTO educator_profiles(user_id,professional_role,phone,subjects,grades,stages,selfie_data_url) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET professional_role=$2,phone=$3,subjects=$4,grades=$5,stages=$6,selfie_data_url=$7,updated_at=now()`,
      [userId, v.professionalRole, v.phone, v.subjects, v.grades, v.stages, v.selfieDataUrl],
    );
    return { id: result.rows[0].id };
  });
}

export async function schoolHeader(db, userId, schoolId) {
  const result = await db.query(
    'SELECT name,city,state,logo_data_url FROM educator_schools WHERE user_id=$1 AND id=$2',
    [userId, schoolId],
  );
  if (!result.rowCount)
    throw Object.assign(new Error('Selecione uma escola do seu cadastro.'), {
      statusCode: 422,
    });
  const s = result.rows[0];
  return {
    institutionName: `${s.name} — ${s.city}/${s.state}`,
    logoDataUrl: s.logo_data_url,
  };
}
