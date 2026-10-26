import test from 'node:test';
import assert from 'node:assert/strict';
import { studentSchema, studentUpdateSchema, updateStudent } from './academic.mjs';
import { pool } from './db.mjs';

test('five student statuses and independent adapted exam condition', () => {
  for (const status of ['ativo', 'transferido', 'remanejado', 'atestado', 'regime_domiciliar']) {
    for (const adaptedExam of [true, false]) {
      assert.deepEqual(studentUpdateSchema.parse({ status, adaptedExam }), { status, adaptedExam });
    }
  }
  const student = studentSchema.parse({ registration: '001', name: 'Ana' });
  assert.equal(student.status, 'ativo');
  assert.equal(student.adaptedExam, false);
  for (const invalid of [{}, { status: 'outro' }, { adaptedExam: 'false' }, { active: false }])
    assert.equal(studentUpdateSchema.safeParse(invalid).success, false);
});

test('updates scope by institution and preserve omitted fields, including false', async () => {
  const original = pool.query;
  let query;
  pool.query = async (input) => { query = input; return { rowCount: 1, rows: [{ id: 'student', adaptedExam: false }] }; };
  try {
    await updateStudent({ institutionId: 'school', studentId: 'student', input: { adaptedExam: false } });
    assert.deepEqual(query.values, ['student', 'school', null, false]);
    assert.match(query.text, /institution_id=\$2/);
    assert.doesNotMatch(query.text.split('RETURNING')[0], /\bactive\s*=/);
    for (const status of ['ativo', 'transferido', 'remanejado', 'atestado', 'regime_domiciliar']) {
      await updateStudent({ institutionId: 'school', studentId: 'student', input: { status } });
      assert.doesNotMatch(query.text.split('RETURNING')[0], /\bactive\s*=/);
      assert.equal(query.values[2], status);
    }
    await updateStudent({ institutionId: 'school', studentId: 'student', input: { status: 'atestado' } });
    assert.deepEqual(query.values, ['student', 'school', 'atestado', null]);
    pool.query = async () => ({ rowCount: 0, rows: [] });
    await assert.rejects(updateStudent({ institutionId: 'other', studentId: 'student', input: { status: 'ativo' } }), { statusCode: 404 });
  } finally { pool.query = original; }
});
