import { z } from 'zod';
import { pool, transaction } from './db.mjs';
import { isValidCnpj } from './inep-school-data.mjs';

const list = z.array(z.string().trim().min(1).max(100)).max(30).default([]);
export const schoolSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(140),
  schoolType: z.enum(['municipal', 'estadual', 'federal', 'privada', 'outra']),
  cnpj: z
    .string()
    .regex(/^(?:\d{14})?$/, 'Use 14 dígitos no CNPJ.')
    .refine(isValidCnpj, 'Informe um CNPJ válido.')
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
const educatorProfileFields = z.object({
    professionalRole: z.enum(['teacher', 'coordinator']),
    phone: z.string().trim().max(30).default(''),
    subjects: list,
    grades: list,
    stages: list,
    selfieDataUrl: z.string().max(550000).refine((v) => !v || (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.byteLength(v.split(',')[1], 'base64') <= 400000), 'Use selfie PNG/JPEG de até 400 KB.').default(''),
  });
function validateProfessionalProfile(v, ctx) {
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
}
export const educatorProfileSchema = educatorProfileFields.superRefine(validateProfessionalProfile);
export const educatorSchema = educatorProfileFields.extend({ school: schoolSchema }).superRefine(validateProfessionalProfile);

export async function getEducatorProfile(userId) {
  const profile = await pool.query(
    `SELECT professional_role AS "professionalRole",phone,subjects,grades,stages,selfie_data_url AS "selfieDataUrl" FROM educator_profiles WHERE user_id=$1`,
    [userId],
  );
  const schools = await pool.query(
    `SELECT id,name,school_type AS "schoolType",cnpj,inep,address,city,state,postal_code AS "postalCode",phone,email,logo_data_url AS "logoDataUrl",is_header_default AS "isHeaderDefault" FROM educator_schools WHERE user_id=$1 ORDER BY is_header_default DESC,created_at,id`,
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
  return transaction(db => saveEducatorProfileWithClient(db, userId, input));
}

/** Salva somente os dados profissionais, sem exigir uma escola no mesmo envio. */
export async function saveEducatorProfileOnly(userId, input) {
  const value = educatorProfileSchema.parse(input);
  return transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    await saveProfessionalFields(db, userId, value);
    return { saved: true };
  });
}

async function saveProfessionalFields(db, userId, value) {
  await db.query(
    `INSERT INTO educator_profiles(user_id,professional_role,phone,subjects,grades,stages,selfie_data_url)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(user_id) DO UPDATE SET professional_role=$2,phone=$3,subjects=$4,grades=$5,stages=$6,selfie_data_url=$7,updated_at=now()`,
    [userId, value.professionalRole, value.phone, value.subjects, value.grades, value.stages, value.selfieDataUrl],
  );
}

/** Cria ou edita uma escola, sem salvar novamente o perfil profissional. */
export async function saveEducatorSchool(userId, input) {
  const school = schoolSchema.parse(input);
  return transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const values = [userId, school.name, school.schoolType, school.cnpj, school.inep, school.address, school.city, school.state, school.postalCode, school.phone, school.email, school.logoDataUrl];
    let result;
    if (school.id) {
      result = await db.query(
        `UPDATE educator_schools SET name=$2,school_type=$3,cnpj=$4,inep=$5,address=$6,city=$7,state=$8,postal_code=$9,phone=$10,email=$11,logo_data_url=$12,updated_at=now()
         WHERE user_id=$1 AND id=$13 RETURNING id,name,school_type AS "schoolType",cnpj,inep,address,city,state,postal_code AS "postalCode",phone,email,logo_data_url AS "logoDataUrl",is_header_default AS "isHeaderDefault"`,
        [...values, school.id],
      );
    } else {
      const count = await db.query('SELECT count(*)::int n FROM educator_schools WHERE user_id=$1', [userId]);
      if (count.rows[0].n >= 6) throw Object.assign(new Error('Você já cadastrou o limite de 6 escolas.'), { statusCode: 422 });
      result = await db.query(
        `INSERT INTO educator_schools(user_id,name,school_type,cnpj,inep,address,city,state,postal_code,phone,email,logo_data_url,is_header_default)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id,name,school_type AS "schoolType",cnpj,inep,address,city,state,postal_code AS "postalCode",phone,email,logo_data_url AS "logoDataUrl",is_header_default AS "isHeaderDefault"`,
        [...values, count.rows[0].n === 0],
      );
    }
    if (!result.rowCount) throw Object.assign(new Error('Escola não encontrada no seu cadastro.'), { statusCode: 404 });
    return result.rows[0];
  });
}

/** Define a escola principal para os cabeçalhos e remove qualquer outra marcação. */
export async function setHeaderSchool(userId, schoolId) {
  return transaction(async (db) => {
    const selected = await db.query('SELECT id FROM educator_schools WHERE id=$1 AND user_id=$2 FOR UPDATE', [schoolId, userId]);
    if (!selected.rowCount) throw Object.assign(new Error('Escola não encontrada no seu cadastro.'), { statusCode: 404 });
    await db.query('UPDATE educator_schools SET is_header_default=false WHERE user_id=$1 AND is_header_default', [userId]);
    await db.query('UPDATE educator_schools SET is_header_default=true,updated_at=now() WHERE id=$1 AND user_id=$2', [schoolId, userId]);
    return { id: schoolId, isHeaderDefault: true };
  });
}

/** Exclui escola sem apagar turmas, convites ou provas vinculadas. */
export async function deleteEducatorSchool(userId, schoolId) {
  return transaction(async (db) => {
    const selected = await db.query('SELECT id,is_header_default FROM educator_schools WHERE id=$1 AND user_id=$2 FOR UPDATE', [schoolId, userId]);
    if (!selected.rowCount) throw Object.assign(new Error('Escola não encontrada no seu cadastro.'), { statusCode: 404 });
    const usage = await db.query(
      `SELECT EXISTS(SELECT 1 FROM classes WHERE school_id=$1) OR EXISTS(SELECT 1 FROM class_invites WHERE school_id=$1) AS linked`,
      [schoolId],
    );
    if (usage.rows[0].linked) throw Object.assign(new Error('Esta escola está vinculada a turmas ou convites e não pode ser removida.'), { statusCode: 409 });
    await db.query('DELETE FROM educator_schools WHERE id=$1 AND user_id=$2', [schoolId, userId]);
    if (selected.rows[0].is_header_default) {
      await db.query('UPDATE educator_schools SET is_header_default=true,updated_at=now() WHERE id=(SELECT id FROM educator_schools WHERE user_id=$1 ORDER BY created_at,id LIMIT 1)', [userId]);
    }
    return { id: schoolId, deleted: true };
  });
}

export async function saveEducatorProfileWithClient(db, userId, input) {
  const v = educatorSchema.parse(input),
    s = v.school;

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
      if (count.rows[0].n >= 6)
        throw Object.assign(new Error('Limite de 6 escolas no perfil.'), {
          statusCode: 422,
        });
      result = await db.query(
        `INSERT INTO educator_schools(user_id,name,school_type,cnpj,inep,address,city,state,postal_code,phone,email,logo_data_url,is_header_default) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [...values, count.rows[0].n === 0],
      );
    }
    if (!result.rowCount)
      throw Object.assign(new Error('Escola não encontrada no seu cadastro.'), {
        statusCode: 404,
      });
    await saveProfessionalFields(db, userId, v);
    return { id: result.rows[0].id };
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
