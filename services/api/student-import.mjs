import ExcelJS from 'exceljs';
import { studentSchema } from './academic.mjs';
import { transaction } from './db.mjs';
import { assertInstitutionLimit } from './auth.mjs';

const invalid = (message) => Object.assign(new Error(message), { statusCode: 422 });
const normalize = (value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

export async function parseStudentWorkbook(base64) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw invalid('Envie um arquivo Excel (.xlsx) de até 2 MB.');
  if (Buffer.byteLength(base64, 'base64') > 2_000_000) throw invalid('Envie um arquivo Excel (.xlsx) de até 2 MB.');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(Buffer.from(base64, 'base64')); }
  catch { throw invalid('Não foi possível ler o Excel. Salve o arquivo no formato .xlsx.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > 1001) throw invalid('A primeira aba deve conter até 1.000 alunos.');
  let codeColumn, nameColumn;
  sheet.getRow(1).eachCell((cell, column) => {
    const header = normalize(cell.text);
    if (['codigo', 'matricula', 'codigo do aluno'].includes(header)) {
      if (codeColumn) throw invalid('Há mais de uma coluna de código.');
      codeColumn = column;
    }
    if (['nome', 'nome do aluno', 'nome completo'].includes(header)) {
      if (nameColumn) throw invalid('Há mais de uma coluna de nome.');
      nameColumn = column;
    }
  });
  if (!codeColumn || !nameColumn) throw invalid('A primeira linha deve conter as colunas Código e Nome.');
  const students = [], seen = new Set();
  for (let line = 2; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line), code = row.getCell(codeColumn), name = row.getCell(nameColumn);
    if (!code.text.trim() && !name.text.trim()) continue;
    if (code.type === ExcelJS.ValueType.Formula || name.type === ExcelJS.ValueType.Formula)
      throw invalid(`Linha ${line}: use valores, sem fórmulas.`);
    let registration = code.text.trim();
    if (typeof code.value === 'number' && /^0+$/.test(code.numFmt || '')) registration = registration.padStart(code.numFmt.length, '0');
    const result = studentSchema.safeParse({ registration, name: name.text.trim() });
    if (!result.success) throw invalid(`Linha ${line}: informe código (até 60 caracteres) e nome (2 a 160 caracteres).`);
    if (seen.has(registration)) throw invalid(`Linha ${line}: código ${registration} repetido na planilha.`);
    seen.add(registration);
    students.push({ ...result.data, line });
  }
  if (!students.length) throw invalid('A planilha não contém alunos.');
  return students;
}

export async function importClassStudents({ institutionId, userId, classId, input }) {
  const students = await parseStudentWorkbook(input?.base64);
  return transaction(async (client) => {
    await client.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE', [institutionId]);
    const classroom = await client.query('SELECT id FROM classes WHERE id=$1 AND institution_id=$2 FOR UPDATE', [classId, institutionId]);
    if (!classroom.rowCount) throw Object.assign(new Error('Turma não encontrada.'), { statusCode: 404 });
    const existing = await client.query('SELECT id,registration,name,active FROM students WHERE institution_id=$1 AND registration=ANY($2::text[]) FOR UPDATE', [institutionId, students.map(s => s.registration)]);
    const byCode = new Map(existing.rows.map(s => [s.registration, s]));
    for (const student of students) {
      const found = byCode.get(student.registration);
      if (found && (!found.active || normalize(found.name) !== normalize(student.name)))
        throw invalid(`Linha ${student.line}: código ${student.registration} pertence a um aluno inativo ou com outro nome. Revise o cadastro.`);
    }
    const created = students.length - existing.rows.length;
    if (created) await assertInstitutionLimit({ institutionId, kind: 'student', quantity: created, db: client });
    let enrolled = 0;
    for (const student of students) {
      let id = byCode.get(student.registration)?.id;
      if (!id) {
        const result = await client.query(`INSERT INTO students(institution_id,registration,name,teacher_id,access_code) VALUES($1,$2,$3,$4,'UFA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))) RETURNING id`, [institutionId, student.registration, student.name, userId]);
        id = result.rows[0].id;
      }
      const result = await client.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2) ON CONFLICT (class_id,student_id) DO NOTHING', [classId, id]);
      enrolled += result.rowCount;
    }
    return { total: students.length, created, enrolled, alreadyEnrolled: students.length - enrolled };
  });
}
