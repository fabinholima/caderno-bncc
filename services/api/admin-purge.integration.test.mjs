import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Banco com todas as migrações aplicadas (node migrate.mjs).
const url = process.env.ADMIN_PURGE_TEST_DATABASE_URL;

test('permissão do administrador: exclusão total de prova e descarte de cartão corrigido', { skip: !url }, async (t) => {
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  const admin = new pg.Pool({ connectionString: url });
  const { pool } = await import('./db.mjs');
  const { deleteAssessment } = await import('./assessments.mjs');
  const { discardScan } = await import('./scans.mjs');
  const { canPurgeAcademicRecords } = await import('./institution-permissions.mjs');
  const one = async (sql, values) => (await admin.query(sql, values)).rows[0];
  const count = async (sql, values) => Number((await one(sql, values)).n);
  const tag = randomUUID().slice(0, 8);

  const institution = await one(`INSERT INTO institutions(name,slug) VALUES('Escola P',$1) RETURNING id`, [`purge-${tag}`]);
  const teacher = await one(`INSERT INTO users(email,display_name) VALUES($1,'Prof') RETURNING id`, [`prof-${tag}@teste.local`]);
  const boss = await one(`INSERT INTO users(email,display_name) VALUES($1,'Admin') RETURNING id`, [`admin-${tag}@teste.local`]);

  // Prova aplicada com dois alunos corrigidos e notas publicadas.
  const build = async () => {
    const assessment = await one(`INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Prova P','Química','1º ano',$2) RETURNING id`, [institution.id, teacher.id]);
    const version = await one(`INSERT INTO assessment_versions(assessment_id,code,seed,snapshot,answer_key) VALUES($1,'A',1,'{"questions":[]}'::jsonb,'{}') RETURNING id`, [assessment.id]);
    const klass = await one(`INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES($1,$2,'1º ano',2026,$3) RETURNING id`, [institution.id, `1P-${randomUUID().slice(0, 6)}`, teacher.id]);
    const application = await one(`INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`, [institution.id, assessment.id, klass.id, teacher.id]);
    const assignments = [];
    for (const name of ['Ana', 'Bia']) {
      const student = await one(`INSERT INTO students(institution_id,name,registration) VALUES($1,$2,$3) RETURNING id`, [institution.id, name, randomUUID()]);
      await admin.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)', [klass.id, student.id]);
      const aps = await one(`INSERT INTO application_students(application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4) RETURNING id`, [application.id, student.id, version.id, randomUUID()]);
      const sub = await one(`INSERT INTO assessment_submissions(assessment_version_id,responses,result,score,max_score) VALUES($1,'[]','{}'::jsonb,1,1) RETURNING id`, [version.id]);
      const scan = await one(`INSERT INTO card_scans(institution_id,uploaded_by,mime_type,image_data,status,application_student_id,submission_id,completed_at,image_ref)
        VALUES($1,$2,'image/png','\\x','completed',$3,$4,now(),$5) RETURNING id`, [institution.id, teacher.id, aps.id, sub.id, `local:teste/${randomUUID()}.png`]);
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(`INSERT INTO assessment_results(institution_id,application_student_id,processing_status) VALUES($1,$2,'ready') RETURNING id`, [institution.id, aps.id]).then((r) => r.rows[0]);
        const resultVersion = await client.query(`INSERT INTO assessment_result_versions(result_id,version_number,source,card_scan_id,submission_id,assessment_version_id,answer_key_sha256,scoring_rule,items,question_count,valid_count,correct_count,incorrect_count,blank_count,invalid_count,review_pending_count)
          VALUES($1,1,'omr',$2,$3,$4,repeat('a',64),'{}','[]',1,1,1,0,0,0,0) RETURNING id`, [result.id, scan.id, sub.id, version.id]).then((r) => r.rows[0]);
        await client.query(`INSERT INTO assessment_result_publications(result_id,result_version_id,authorized_by,authorizer_name) VALUES($1,$2,$3,'Prof')`, [result.id, resultVersion.id, teacher.id]);
        await client.query(`UPDATE assessment_results SET current_version_id=$2,published_version_id=$2,publication_status='published' WHERE id=$1`, [result.id, resultVersion.id]);
        await client.query(`INSERT INTO performance_followups(institution_id,result_id,status) VALUES($1,$2,'pending')`, [institution.id, result.id]);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      assignments.push({ aps, scan, student });
    }
    return { assessment, version, klass, application, assignments };
  };

  try {
    await t.test('só papel admin e admin do portal têm a permissão', () => {
      assert.equal(canPurgeAcademicRecords({ role: 'admin' }), true);
      assert.equal(canPurgeAcademicRecords({ role: 'teacher', portalAdmin: true }), true);
      assert.equal(canPurgeAcademicRecords({ role: 'teacher' }), false);
      assert.equal(canPurgeAcademicRecords({ role: 'coordinator' }), false);
      assert.equal(canPurgeAcademicRecords({ role: 'student' }), false);
    });

    await t.test('professor continua sem excluir prova com notas nem descartar cartão corrigido', async () => {
      const data = await build();
      await assert.rejects(
        deleteAssessment({ institutionId: institution.id, userId: teacher.id, assessmentId: data.assessment.id, unlinkUnsentApplications: true }),
        { statusCode: 409 },
      );
      await assert.rejects(
        discardScan({ institutionId: institution.id, userId: teacher.id, scanId: data.assignments[0].scan.id }),
        { statusCode: 409 },
      );
      // Sem o modo total, a prova de outro professor nem aparece para o admin.
      await assert.rejects(
        deleteAssessment({ institutionId: institution.id, userId: boss.id, assessmentId: data.assessment.id }),
        { statusCode: 404 },
      );
    });

    await t.test('admin descarta cartão corrigido e a nota do aluno é zerada', async () => {
      const data = await build();
      const [ana, bia] = data.assignments;
      const out = await discardScan({ institutionId: institution.id, userId: boss.id, scanId: ana.scan.id, privileged: true });
      assert.deepEqual(out, { id: ana.scan.id, status: 'discarded', resultReset: true });
      const scan = await one('SELECT status,discarded_by,submission_id FROM card_scans WHERE id=$1', [ana.scan.id]);
      assert.equal(scan.status, 'discarded');
      assert.equal(scan.discarded_by, boss.id);
      assert.ok(scan.submission_id, 'o cartão guarda a leitura para auditoria');
      assert.equal(await count('SELECT count(*) n FROM assessment_results WHERE application_student_id=$1', [ana.aps.id]), 0);
      assert.equal(await count('SELECT count(*) n FROM assessment_results WHERE application_student_id=$1', [bia.aps.id]), 1);
      const log = await one(`SELECT user_id,before_data FROM audit_log WHERE action='card_scan.discard_admin' AND entity_id=$1`, [ana.scan.id]);
      assert.equal(log.user_id, boss.id);
      assert.equal(log.before_data.status, 'completed');
      await assert.rejects(
        discardScan({ institutionId: institution.id, userId: boss.id, scanId: ana.scan.id, privileged: true }),
        { statusCode: 409 },
      );
      // Outra instituição não alcança o cartão.
      const other = await one(`INSERT INTO institutions(name,slug) VALUES('Outra',$1) RETURNING id`, [`purge-o-${tag}`]);
      await assert.rejects(
        discardScan({ institutionId: other.id, userId: boss.id, scanId: bia.scan.id, privileged: true }),
        { statusCode: 404 },
      );
      await admin.query('DELETE FROM institutions WHERE id=$1', [other.id]);
    });

    await t.test('admin exclui de vez a prova de outro professor com aplicações, cartões e notas', async () => {
      const data = await build();
      const out = await deleteAssessment({ institutionId: institution.id, userId: boss.id, assessmentId: data.assessment.id, purge: true });
      assert.equal(out.deleted, true);
      assert.deepEqual(out.purged, { applications: 1, students: 2, cardScans: 2, submissions: 2, results: 2 });
      assert.equal(out.imageRefs.length, 2);
      assert.equal(await count('SELECT count(*) n FROM assessments WHERE id=$1', [data.assessment.id]), 0);
      assert.equal(await count('SELECT count(*) n FROM assessment_applications WHERE id=$1', [data.application.id]), 0);
      assert.equal(await count('SELECT count(*) n FROM card_scans WHERE id=ANY($1::uuid[])', [data.assignments.map((a) => a.scan.id)]), 0);
      assert.equal(await count('SELECT count(*) n FROM assessment_submissions WHERE assessment_version_id=$1', [data.version.id]), 0);
      assert.equal(await count('SELECT count(*) n FROM assessment_results WHERE application_student_id=ANY($1::uuid[])', [data.assignments.map((a) => a.aps.id)]), 0);
      // Turma, alunos e histórico de matrícula ficam intactos.
      assert.equal(await count('SELECT count(*) n FROM classes WHERE id=$1', [data.klass.id]), 1);
      assert.equal(await count(`SELECT count(*) n FROM student_enrollments WHERE class_id=$1 AND status='active'`, [data.klass.id]), 2);
      const log = await one(`SELECT user_id,before_data FROM audit_log WHERE action='assessment.purge' AND entity_id=$1`, [data.assessment.id]);
      assert.equal(log.user_id, boss.id);
      assert.equal(log.before_data.title, 'Prova P');
      assert.equal(log.before_data.submissions, 2);
    });
  } finally {
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL ufaprova.allow_history_purge='on'");
      const ids = [[institution.id]];
      const apps = 'SELECT id FROM assessment_applications WHERE institution_id=ANY($1)';
      const results = `SELECT ar.id FROM assessment_results ar WHERE ar.institution_id=ANY($1)`;
      for (const table of ['assessment_result_changes', 'assessment_result_publications', 'performance_followups'])
        await client.query(`DELETE FROM ${table} WHERE result_id IN (${results})`, ids);
      await client.query(`UPDATE assessment_results SET current_version_id=NULL,published_version_id=NULL,publication_status='unpublished' WHERE institution_id=ANY($1)`, ids);
      await client.query(`DELETE FROM assessment_result_versions WHERE result_id IN (${results})`, ids);
      await client.query('DELETE FROM assessment_results WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM card_scans WHERE institution_id=ANY($1)', ids);
      await client.query(`DELETE FROM assessment_applications WHERE id IN (${apps})`, ids);
      await client.query('DELETE FROM assessments WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM classes WHERE institution_id=ANY($1))', ids);
      await client.query('DELETE FROM academic_events WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM student_enrollments WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM classes WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM academic_years WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM audit_log WHERE institution_id=ANY($1)', ids);
      await client.query('DELETE FROM institutions WHERE id=ANY($1)', ids);
      await client.query('DELETE FROM users WHERE id=ANY($1)', [[teacher.id, boss.id]]);
      await client.query('COMMIT');
    } finally {
      client.release();
      await admin.end();
      await pool.end();
    }
  }
});
