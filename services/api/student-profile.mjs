import { z } from 'zod';
import { pool } from './db.mjs';
import { studentSchema } from './academic.mjs';

function studentOnly(identity) {
  if (identity.role !== 'student')
    throw Object.assign(new Error('Esta opção está disponível apenas para alunos.'), { statusCode: 403 });
}
const ownProfile = `FROM student_account_links l JOIN students s ON s.id=l.student_id AND s.institution_id=l.institution_id
  WHERE l.user_id=$1 AND s.active AND EXISTS (
    SELECT 1 FROM class_join_requests r JOIN class_enrollments ce ON ce.class_id=r.class_id AND ce.student_id=s.id
    WHERE r.user_id=l.user_id AND r.student_id=s.id AND r.institution_id=l.institution_id AND r.status='approved')`;

export async function myStudentProfiles(identity) {
  studentOnly(identity);
  return (await pool.query(`SELECT s.id,s.name,s.registration,s.selfie_data_url AS "selfieDataUrl" ${ownProfile}`, [identity.userId])).rows;
}

export async function updateMyStudentPhoto(identity, input) {
  studentOnly(identity);
  const value = z.object({ studentId: z.uuid(), selfieDataUrl: studentSchema.shape.selfieDataUrl }).strict().parse(input);
  if (!value.selfieDataUrl) throw Object.assign(new Error('Selecione uma foto PNG/JPEG de até 100 KB.'), { statusCode: 422 });
  const result = await pool.query(`UPDATE students SET selfie_data_url=$3 WHERE id=$2 AND id IN (SELECT s.id ${ownProfile}) RETURNING id`, [identity.userId, value.studentId, value.selfieDataUrl]);
  if (!result.rowCount) throw Object.assign(new Error('Cadastro não vinculado à sua conta. Aguarde a aprovação do professor.'), { statusCode: 403 });
  return result.rows[0];
}
