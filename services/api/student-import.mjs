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
  const sheets = workbook.worksheets.filter((sheet) => sheet.rowCount > 0);
  if (!sheets.length) throw invalid('O arquivo não contém nenhuma aba com dados.');
  const codeHeaders = ['codigo', 'matricula', 'codigo do aluno', 'matricula do aluno', 'registro', 'ra', 'id do aluno'];
  const nameHeaders = ['nome', 'nome do aluno', 'nome completo', 'nome completo do aluno', 'aluno', 'estudante', 'nome do estudante'];
  let sheet, headerRow, codeColumn, nameColumn;
  for (const candidate of sheets) {
    // Tolerate title/instruction rows before the header, common in exported spreadsheets.
    for (let line = 1; line <= Math.min(candidate.rowCount, 20); line++) {
      let foundCode, foundName;
      candidate.getRow(line).eachCell((cell, column) => {
        const header = normalize(cell.text);
        if (codeHeaders.includes(header)) foundCode = column;
        if (nameHeaders.includes(header)) foundName = column;
      });
      if (foundCode && foundName) {
        sheet = candidate;
        headerRow = line;
        codeColumn = foundCode;
        nameColumn = foundName;
        break;
      }
    }
    if (sheet) break;
  }
  let firstDataRow;
  if (!sheet) {
    // Some class rosters contain only two columns (numeric student code, then name), without headers.
    for (const candidate of sheets) {
      if (candidate.columnCount !== 2) continue;
      for (let line = 1; line <= Math.min(candidate.rowCount, 20); line++) {
        const row = candidate.getRow(line);
        const code = row.getCell(1), name = row.getCell(2);
        if (!code.text.trim() && !name.text.trim()) continue;
        const value = code.text.trim();
        const looksLikeCode = typeof code.value === 'number' || /^[A-Za-z0-9./_-]*\d[A-Za-z0-9./_-]*$/.test(value);
        const normalizedName = normalize(name.text);
        if (!looksLikeCode || codeHeaders.includes(normalize(code.text)) || nameHeaders.includes(normalizedName)) break;
        if (!studentSchema.safeParse({ registration: value, name: name.text.trim() }).success) break;
        sheet = candidate;
        codeColumn = 1;
        nameColumn = 2;
        firstDataRow = line;
        break;
      }
      if (sheet) break;
    }
  }
  if (!sheet) throw invalid('Não encontrei as colunas Código/Matrícula e Nome. Inclua os títulos na mesma linha ou use duas colunas sem cabeçalho: código numérico e nome.');
  const students = [], seen = new Set();
  // Limit scanning as well as imported records; formatting can make Excel report many empty rows.
  const dataStart = firstDataRow || headerRow + 1;
  for (let line = dataStart; line <= Math.min(sheet.rowCount, dataStart + 10_000); line++) {
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
    if (students.length > 1000) throw invalid('A planilha deve conter até 1.000 alunos.');
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
