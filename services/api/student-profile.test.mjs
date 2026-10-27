import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db.mjs';
import { myStudentProfiles, updateMyStudentPhoto } from './student-profile.mjs';

test('photo is restricted to the authenticated student and approved linked records', async () => {
  const original = pool.query;
  const identity = { role: 'student', userId: 'account' };
  const input = { studentId: 'a21504f2-d004-48aa-aee0-e687ec500726', selfieDataUrl: 'data:image/png;base64,aGVsbG8=' };
  let allowed = true, calls = 0;
  pool.query = async (sql, values) => {
    calls++;
    assert.match(sql, /l.user_id=\$1/);
    assert.match(sql, /r.status='approved'/);
    assert.match(sql, /class_enrollments/);
    assert.equal(values[0], 'account');
    if (sql.startsWith('UPDATE')) assert.deepEqual(values, ['account', input.studentId, input.selfieDataUrl]);
    return { rowCount: allowed ? 1 : 0, rows: allowed ? [{ id: input.studentId }] : [] };
  };
  try {
    await assert.rejects(myStudentProfiles({ role: 'teacher' }), { statusCode: 403 });
    await assert.rejects(updateMyStudentPhoto({ role: 'teacher' }, input), { statusCode: 403 });
    await assert.rejects(updateMyStudentPhoto(identity, { ...input, selfieDataUrl: 'data:text/html;base64,aA==' }));
    await assert.rejects(updateMyStudentPhoto(identity, { ...input, selfieDataUrl: 'data:image/png;base64,' + Buffer.alloc(400001).toString('base64') }));
    await assert.rejects(updateMyStudentPhoto(identity, { studentId: input.studentId }));
    assert.equal(calls, 0);
    assert.equal((await myStudentProfiles(identity)).length, 1);
    assert.equal((await updateMyStudentPhoto(identity, input)).id, input.studentId);
    allowed = false;
    await assert.rejects(updateMyStudentPhoto(identity, input), { statusCode: 403 });
  } finally { pool.query = original; }
});
