import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Banco com todas as migrações aplicadas (node migrate.mjs).
const url = process.env.ACADEMIC_INSIGHTS_TEST_DATABASE_URL;

test('indicadores acadêmicos e histórico do aluno usam dados reais e respeitam o escopo', { skip: !url }, async (t) => {
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  const admin = new pg.Pool({ connectionString: url });
  const { pool } = await import('./db.mjs');
  const insights = await import('./academic-insights.mjs');
  const one = async (sql, values) => (await admin.query(sql, values)).rows[0];
  const tag = randomUUID().slice(0, 8);

  const inst = await one(`INSERT INTO institutions(name,slug) VALUES('Escola H',$1) RETURNING id`, [`hist-${tag}`]);
  const user = async (name, type = 'educator') =>
    (await one(`INSERT INTO users(email,display_name,account_type) VALUES($1,$2,$3) RETURNING id`, [`${name}-${tag}@teste.local`, name, type])).id;
  const coordId = await user('coord');
  const teacherId = await user('teacher');
  const otherTeacherId = await user('other');
  const anaUserId = await user('ana', 'student');
  const biaUserId = await user('bia', 'student');
  for (const [id, role] of [[coordId, 'coordinator'], [teacherId, 'teacher'], [otherTeacherId, 'teacher'], [anaUserId, 'student'], [biaUserId, 'student']])
    await admin.query('INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,$3)', [inst.id, id, role]);
  const coordinator = { userId: coordId, institutionId: inst.id, role: 'coordinator' };
  const teacher = { userId: teacherId, institutionId: inst.id, role: 'teacher' };

  const klass = async (name, grade, year, owner) =>
    one(`INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`, [inst.id, name, grade, year, owner]);
  const c2026 = await klass('1º A', '1º ano', 2026, teacherId);
  const c2027 = await klass('2º A', '2º ano', 2027, teacherId);
  const cOther = await klass('1º X', '1º ano', 2026, otherTeacherId);
  const student = async (name) =>
    (await one(`INSERT INTO students(institution_id,name,registration,teacher_id) VALUES($1,$2,$3,$4) RETURNING id`, [inst.id, name, randomUUID(), teacherId])).id;
  const ana = await student('Ana');
  const bia = await student('Bia');
  const caio = await student('Caio');
  await admin.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2),($1,$3),($4,$5)', [c2026.id, ana, bia, cOther.id, caio]);
  // Ana sai do 1º ano (concluído) e vai para o 2º ano.
  await admin.query(`UPDATE student_enrollments SET academic_outcome='promoted' WHERE student_id=$1`, [ana]);
  await admin.query('DELETE FROM class_enrollments WHERE class_id=$1 AND student_id=$2', [c2026.id, ana]);
  await admin.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)', [c2027.id, ana]);
  for (const [userId, studentId] of [[anaUserId, ana], [biaUserId, bia]])
    await admin.query('INSERT INTO student_account_links(institution_id,user_id,student_id,linked_by) VALUES($1,$2,$3,$4)', [inst.id, userId, studentId, coordId]);

  // Prova de 2026 aplicada à turma, com nota publicada para Ana e não publicada para Bia.
  const assessment = await one(`INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Química 1','Química','1º ano',$2) RETURNING id`, [inst.id, teacherId]);
  const version = await one(`INSERT INTO assessment_versions(assessment_id,code,seed,snapshot,answer_key) VALUES($1,'A',1,'{"questions":[]}'::jsonb,'{}') RETURNING id`, [assessment.id]);
  const application = await one(`INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`, [inst.id, assessment.id, c2026.id, teacherId]);
  const result = async (studentId, percent, publish) => {
    const aps = await one(`INSERT INTO application_students(application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4) RETURNING id`, [application.id, studentId, version.id, randomUUID()]);
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      const r = (await client.query(`INSERT INTO assessment_results(institution_id,application_student_id,processing_status) VALUES($1,$2,'ready') RETURNING id`, [inst.id, aps.id])).rows[0];
      const v = (await client.query(`INSERT INTO assessment_result_versions(result_id,version_number,source,assessment_version_id,answer_key_sha256,scoring_rule,items,question_count,valid_count,correct_count,incorrect_count,blank_count,invalid_count,review_pending_count,percent)
        VALUES($1,1,'omr',$2,repeat('a',64),'{}','[]',10,10,$3,$4,0,0,0,$5) RETURNING id`, [r.id, version.id, percent / 10, 10 - percent / 10, percent])).rows[0];
      if (publish) {
        await client.query(`INSERT INTO assessment_result_publications(result_id,result_version_id,authorized_by,authorizer_name) VALUES($1,$2,$3,'Prof')`, [r.id, v.id, teacherId]);
        await client.query(`UPDATE assessment_results SET current_version_id=$2,published_version_id=$2,publication_status='published' WHERE id=$1`, [r.id, v.id]);
      } else await client.query('UPDATE assessment_results SET current_version_id=$2 WHERE id=$1', [r.id, v.id]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  };
  await result(ana, 80, true);
  await result(bia, 60, false);
  await admin.query(`INSERT INTO card_scans(institution_id,uploaded_by,mime_type,image_data,status) VALUES($1,$2,'image/png','\\x','review')`, [inst.id, teacherId]);

  try {
    await t.test('painel da coordenação vê a instituição inteira', async () => {
      const d = await insights.academicDashboard(coordinator, null);
      assert.equal(d.scope, 'institution');
      assert.equal(d.students, 3);
      assert.equal(d.teachers, 3);
      assert.equal(d.activeClasses, 3);
      assert.equal(d.activeEnrollments, 3);
      assert.equal(d.academicYears, 2);
      assert.equal(d.outcomes.promoted, 1);
      assert.equal(d.pending.scansInReview, 1);
      assert.equal(d.pending.resultsUnpublished, 1);
      assert.deepEqual(d.years.map((y) => [y.year, y.classes, y.activeEnrollments]), [[2026, 2, 2], [2027, 1, 1]]);
    });

    await t.test('painel do professor fica restrito às suas turmas', async () => {
      const d = await insights.academicDashboard(teacher, teacherId);
      assert.equal(d.scope, 'teacher');
      assert.equal(d.teachers, null);
      assert.equal(d.activeClasses, 2);
      assert.equal(d.activeEnrollments, 2);
      await assert.rejects(insights.academicDashboard({ ...teacher, role: 'student' }, teacherId), { statusCode: 403 });
    });

    await t.test('linha do tempo da equipe tem os anos e as notas atuais', async () => {
      const { timeline } = await insights.studentTimeline(coordinator, ana, null);
      assert.deepEqual(timeline.map((e) => [e.year, e.gradeLevel, e.status, e.academicOutcome]), [
        [2026, '1º ano', 'completed', 'promoted'],
        [2027, '2º ano', 'active', 'pending'],
      ]);
      assert.equal(timeline[0].assessments.length, 1);
      assert.equal(timeline[0].averagePercent, 80);
      const biaTimeline = (await insights.studentTimeline(coordinator, bia, null)).timeline;
      assert.equal(biaTimeline[0].assessments[0].published, false);
      // Professor sem vínculo com o aluno não vê a linha do tempo.
      await assert.rejects(
        insights.studentTimeline({ ...teacher, userId: otherTeacherId }, ana, otherTeacherId),
        { statusCode: 404 },
      );
    });

    await t.test('meu histórico mostra só o próprio aluno e só notas publicadas', async () => {
      const anaHistory = await insights.myAcademicHistory({ userId: anaUserId, role: 'student' });
      assert.deepEqual(anaHistory.map((e) => e.year), [2026, 2027]);
      assert.equal(anaHistory[0].assessments[0].percent, 80);
      const biaHistory = await insights.myAcademicHistory({ userId: biaUserId, role: 'student' });
      assert.equal(biaHistory.length, 1);
      assert.deepEqual(biaHistory[0].assessments, [], 'nota não publicada não aparece para o aluno');
      assert.equal(biaHistory[0].averagePercent, null);
      await assert.rejects(insights.myAcademicHistory(teacher), { statusCode: 403 });
    });
  } finally {
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL ufaprova.allow_history_purge='on'");
      const ids = [[inst.id]];
      const results = 'SELECT id FROM assessment_results WHERE institution_id=ANY($1)';
      await client.query(`DELETE FROM assessment_result_publications WHERE result_id IN (${results})`, ids);
      await client.query(`UPDATE assessment_results SET current_version_id=NULL,published_version_id=NULL,publication_status='unpublished' WHERE institution_id=ANY($1)`, ids);
      await client.query(`DELETE FROM assessment_result_versions WHERE result_id IN (${results})`, ids);
      await client.query('DELETE FROM assessment_results WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM card_scans WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM assessment_applications WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM assessments WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM student_account_links WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM classes WHERE institution_id=ANY($1))', ids);
      await client.query('DELETE FROM academic_events WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM student_enrollments WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM classes WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM academic_years WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM institutions WHERE id=ANY($1)', ids);
      await client.query('DELETE FROM users WHERE id=ANY($1)', [[coordId, teacherId, otherTeacherId, anaUserId, biaUserId]]);
      await client.query('COMMIT');
    } finally {
      client.release();
      await admin.end();
      await pool.end();
    }
  }
});
