import ExcelJS from 'exceljs';
import { studentSchema } from './academic.mjs';
import { pool, transaction } from './db.mjs';
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
  const codeHeaders = ['codigo', 'matricula', 'codigo/matricula', 'matricula/codigo', 'codigo do aluno', 'matricula do aluno', 'registro', 'ra', 'id do aluno'];
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
    // Some class rosters contain only a numeric code and a name, without headers.
    for (const candidate of sheets) {
      for (let line = 1; line <= Math.min(candidate.rowCount, 20); line++) {
        const row = candidate.getRow(line);
        const values = [];
        row.eachCell((cell, column) => {
          if (cell.text.trim()) values.push({ cell, column });
        });
        if (values.length !== 2) continue;
        const codeEntry = values.find(({ cell }) =>
          typeof cell.value === 'number' || /\d/.test(cell.text.trim()),
        );
        const nameEntry = values.find(({ cell, column }) =>
          column !== codeEntry?.column &&
          !nameHeaders.includes(normalize(cell.text)) &&
          studentSchema.safeParse({ registration: '1', name: cell.text.trim() }).success,
        );
        if (!codeEntry || !nameEntry || codeHeaders.includes(normalize(codeEntry.cell.text))) continue;
        const value = codeEntry.cell.text.trim();
        if (typeof codeEntry.cell.value !== 'number' && !/^[A-Za-z0-9./_\-\s,]+$/.test(value)) continue;
        sheet = candidate;
        codeColumn = codeEntry.column;
        nameColumn = nameEntry.column;
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

export async function previewClassStudentImport({ institutionId, classId, input }) {
  const students = await parseStudentWorkbook(input?.base64);
  const classroom = await pool.query('SELECT id FROM classes WHERE id=$1 AND institution_id=$2', [classId, institutionId]);
  if (!classroom.rowCount) throw Object.assign(new Error('Turma não encontrada.'), { statusCode: 404 });
  const existing = await pool.query(
    'SELECT id,registration,name,active,status FROM students WHERE institution_id=$1 AND registration=ANY($2::text[])',
    [institutionId, students.map(student => student.registration)],
  );
  const byCode = new Map(existing.rows.map(student => [student.registration, student]));
  return students.map(student => {
    const found = byCode.get(student.registration);
    let warning = null;
    if (found && !found.active) warning = 'A conta de acesso deste aluno está inativa; a situação escolar não reativa a conta.';
    else if (found && normalize(found.name) !== normalize(student.name)) warning = `Este código já está cadastrado para “${found.name}”.`;
    return { ...student, status: found?.status || 'ativo', existing: Boolean(found), warning };
  });
}

export async function importClassStudents({ institutionId, userId, classId, input }) {
  const students = Array.isArray(input?.students)
    ? input.students.map((student, index) => {
      const result = studentSchema.safeParse(student);
      if (!result.success) throw invalid(`Aluno ${index + 1}: informe código, nome e situação válidos.`);
      return { ...result.data, line: student.line || index + 1 };
    })
    : await parseStudentWorkbook(input?.base64);
  if (!students.length || students.length > 1000) throw invalid('Selecione de 1 a 1.000 alunos para importar.');
  return transaction(async (client) => {
    await client.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE', [institutionId]);
    const classroom = await client.query('SELECT id FROM classes WHERE id=$1 AND institution_id=$2 FOR UPDATE', [classId, institutionId]);
    if (!classroom.rowCount) throw Object.assign(new Error('Turma não encontrada.'), { statusCode: 404 });
    const existing = await client.query('SELECT id,registration,name,active FROM students WHERE institution_id=$1 AND registration=ANY($2::text[]) FOR UPDATE', [institutionId, students.map(s => s.registration)]);
    const byCode = new Map(existing.rows.map(s => [s.registration, s]));
    for (const student of students) {
      const found = byCode.get(student.registration);
      if (found && !found.active)
        throw invalid(`Linha ${student.line}: a conta de acesso do aluno ${student.registration} está inativa. A situação escolar não reativa a conta; revise o cadastro do aluno.`);
      if (found && normalize(found.name) !== normalize(student.name))
        throw invalid(`Linha ${student.line}: o código ${student.registration} já pertence a “${found.name}”. Revise o cadastro.`);
    }
    const created = students.length - existing.rows.length;
    if (created) await assertInstitutionLimit({ institutionId, kind: 'student', quantity: created, db: client });
    let enrolled = 0;
    for (const student of students) {
      let id = byCode.get(student.registration)?.id;
      if (!id) {
        const result = await client.query(`INSERT INTO students(institution_id,registration,name,teacher_id,access_code,status) VALUES($1,$2,$3,$4,'UFA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),$5) RETURNING id`, [institutionId, student.registration, student.name, userId, student.status || 'ativo']);
        id = result.rows[0].id;
      } else {
        await client.query('UPDATE students SET status=$3 WHERE id=$1 AND institution_id=$2', [id, institutionId, student.status || 'ativo']);
      }
      const result = await client.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2) ON CONFLICT (class_id,student_id) DO NOTHING', [classId, id]);
      enrolled += result.rowCount;
    }
    return { total: students.length, created, enrolled, alreadyEnrolled: students.length - enrolled };
  });
}
