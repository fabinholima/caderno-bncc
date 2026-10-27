import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseStudentWorkbook } from './student-import.mjs';

async function file(rows, configure) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Alunos');
  sheet.addRows(rows);
  configure?.(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

test('imports code/name, ignores blank rows and preserves leading zeros', async () => {
  const data = await file([['Código', 'Nome'], ['0012', 'Ana Silva'], [], [13, 'João Souza']], s => { s.getCell('A4').numFmt = '0000'; });
  const students = await parseStudentWorkbook(data);
  assert.deepEqual(students.map(s => [s.registration, s.name]), [['0012', 'Ana Silva'], ['0013', 'João Souza']]);
});

test('accepts reversed columns and matrícula header', async () => {
  const students = await parseStudentWorkbook(await file([['Nome do aluno', 'Matrícula'], ['Ana Silva', 'A-1']]));
  assert.equal(students[0].registration, 'A-1');
});

test('finds headers after a title row and skips an empty first worksheet', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Instruções').addRow(['Planilha de alunos']);
  const sheet = workbook.addWorksheet('Importação');
  sheet.addRows([['Lista de alunos da turma'], [], ['Nome completo do aluno', 'Matrícula do aluno'], ['Ana Silva', 'A-1']]);
  const students = await parseStudentWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'));
  assert.deepEqual(students.map(({ registration, name }) => [registration, name]), [['A-1', 'Ana Silva']]);
});

test('rejects missing headers, incomplete rows, duplicates and formulas with actionable errors', async () => {
  for (const [rows, message] of [
    [[['ID', 'Aluno']], /colunas Código\/Matrícula e Nome/],
    [[['Código', 'Nome'], ['1', '']], /Linha 2/],
    [[['Código', 'Nome'], ['1', 'Ana'], ['1', 'Ana']], /Linha 3.*repetido/],
    [[['Código', 'Nome'], [{ formula: '1+1', result: 2 }, 'Ana']], /sem fórmulas/],
    [[['Código', 'Nome']], /não contém alunos/],
  ]) await assert.rejects(parseStudentWorkbook(await file(rows)), message);
});

test('rejects malformed uploads and too many rows', async () => {
  await assert.rejects(parseStudentWorkbook('invalid'), /Não foi possível ler/);
  await assert.rejects(parseStudentWorkbook(''), /até 2 MB/);
  await assert.rejects(parseStudentWorkbook(await file([['Código', 'Nome'], ...Array.from({ length: 1001 }, (_, i) => [String(i), 'Aluno'])])), /até 1.000/);
});

test('batch import reuses students and enrollments, and rolls back conflicts and plan limits', async () => {
  const { pool } = await import('./db.mjs');
  const { importClassStudents } = await import('./student-import.mjs');
  const original = pool.connect;
  let conflict = false, limit = 10;
  const calls = [];
  pool.connect = async () => ({
    release() {},
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT id FROM classes')) return { rowCount: 1, rows: [{ id: 'class' }] };
      if (sql.startsWith('SELECT id,registration')) return { rows: [{ id: 'old', registration: '01', name: conflict ? 'Outra pessoa' : 'Ana', active: true }] };
      if (sql.includes('FROM institution_subscriptions')) return { rowCount: 1, rows: [{ max_students: limit }] };
      if (sql.includes('count(*)::int used')) return { rows: [{ used: 1 }] };
      if (sql.startsWith('INSERT INTO students')) return { rows: [{ id: 'new' }] };
      if (sql.startsWith('INSERT INTO class_enrollments')) return { rowCount: 0 };
      return { rowCount: 1, rows: [] };
    },
  });
  try {
    const input = { base64: await file([['Código', 'Nome'], ['01', 'Ana'], ['02', 'Bruno']]) };
    const args = { institutionId: 'institution', userId: 'teacher', classId: 'class', input };
    const result = await importClassStudents(args);
    assert.equal(result.created, 1);
    assert.equal(calls.filter(sql => sql.startsWith('INSERT INTO students')).length, 1);
    assert.equal(calls.at(-1), 'COMMIT');
    calls.length = 0;
    conflict = true;
    await assert.rejects(importClassStudents(args), /outro nome/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.ok(!calls.some(sql => sql.startsWith('INSERT')));
    calls.length = 0;
    conflict = false;
    limit = 1;
    await assert.rejects(importClassStudents(args), /Limite de alunos/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.ok(!calls.some(sql => sql.startsWith('INSERT')));
  } finally { pool.connect = original; }
});
