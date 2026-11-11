import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Banco com todas as migrações aplicadas (node migrate.mjs), inclusive a 112.
const url = process.env.ACADEMIC_CLOSING_TEST_DATABASE_URL;

test(
  'encerramento do ano letivo: diagnóstico, transação, bloqueio e reabertura',
  { skip: !url },
  async (t) => {
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    const admin = new pg.Pool({ connectionString: url });
    const { pool } = await import('./db.mjs');
    const years = await import('./academic-years.mjs');
    const insights = await import('./academic-insights.mjs');
    const one = async (sql, values) => (await admin.query(sql, values)).rows[0];
    const tag = randomUUID().slice(0, 8);

    const inst = await one(
      `INSERT INTO institutions(name,slug) VALUES('Escola E',$1) RETURNING id`,
      [`close-${tag}`],
    );
    const user = async (name) =>
      (
        await one(
          `INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id`,
          [`${name}-${tag}@teste.local`, name],
        )
      ).id;
    const adminId = await user('diretora');
    const teacherId = await user('prof');
    const userIds = [adminId, teacherId];
    for (const [id, role] of [
      [adminId, 'admin'],
      [teacherId, 'teacher'],
    ])
      await admin.query(
        'INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,$3)',
        [inst.id, id, role],
      );
    const director = { userId: adminId, institutionId: inst.id, role: 'admin' };
    const teacher = {
      userId: teacherId,
      institutionId: inst.id,
      role: 'teacher',
    };

    const klass = await one(
      `INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES($1,'9º A','9º ano',2031,$2) RETURNING id,academic_year_id`,
      [inst.id, teacherId],
    );
    const yearId = klass.academic_year_id;
    const ana = (
      await one(
        `INSERT INTO students(institution_id,name,registration,teacher_id) VALUES($1,'Ana',$2,$3) RETURNING id`,
        [inst.id, randomUUID(), teacherId],
      )
    ).id;
    await admin.query(
      'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
      [klass.id, ana],
    );
    const assessment = await one(
      `INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Física','Física','9º ano',$2) RETURNING id`,
      [inst.id, teacherId],
    );
    const version = await one(
      `INSERT INTO assessment_versions(assessment_id,code,seed,snapshot,answer_key) VALUES($1,'A',1,'{"questions":[]}'::jsonb,'{}') RETURNING id`,
      [assessment.id],
    );
    const application = await one(
      `INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
      [inst.id, assessment.id, klass.id, teacherId],
    );
    const aps = await one(
      `INSERT INTO application_students(application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4) RETURNING id`,
      [application.id, ana, version.id, randomUUID()],
    );
    const result = await one(
      `INSERT INTO assessment_results(institution_id,application_student_id,processing_status) VALUES($1,$2,'ready') RETURNING id`,
      [inst.id, aps.id],
    );
    const scan = await one(
      `INSERT INTO card_scans(institution_id,uploaded_by,mime_type,image_data,status,expected_application_id) VALUES($1,$2,'image/png','\\x','review',$3) RETURNING id`,
      [inst.id, teacherId, application.id],
    );

    try {
      await t.test(
        'professor não encerra nem consulta o diagnóstico',
        async () => {
          await assert.rejects(
            years.academicYearClosingCheck(teacher, yearId),
            { statusCode: 403 },
          );
          await assert.rejects(
            years.closeAcademicYear(teacher, yearId, { confirmYear: 2031 }),
            { statusCode: 403 },
          );
        },
      );

      await t.test(
        'diagnóstico aponta cartão em revisão como pendência crítica',
        async () => {
          const check = await years.academicYearClosingCheck(director, yearId);
          assert.equal(check.canClose, false);
          assert.deepEqual(
            check.critical.map((item) => item.code),
            ['scans_in_review'],
          );
          assert.equal(check.activeEnrollments, 1);
          assert.ok(
            check.warnings.some((item) => item.code === 'results_unpublished'),
          );
        },
      );

      await t.test('com pendência crítica nada muda (rollback)', async () => {
        await assert.rejects(
          years.closeAcademicYear(director, yearId, { confirmYear: 2031 }),
          (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.report.critical[0].code, 'scans_in_review');
            return true;
          },
        );
        const year = await one(
          'SELECT status FROM academic_years WHERE id=$1',
          [yearId],
        );
        assert.equal(year.status, 'active', 'continua aberto');
        const enrollment = await one(
          'SELECT status FROM student_enrollments WHERE student_id=$1',
          [ana],
        );
        assert.equal(enrollment.status, 'active');
      });

      await t.test('confirmação exige digitar o ano certo', async () => {
        await admin.query(
          `UPDATE card_scans SET status='discarded' WHERE id=$1`,
          [scan.id],
        );
        await assert.rejects(
          years.closeAcademicYear(director, yearId, { confirmYear: 2030 }),
          { statusCode: 422 },
        );
      });

      await t.test(
        'encerra o ano: turmas encerradas, matrículas concluídas e evento registrado',
        async () => {
          const closed = await years.closeAcademicYear(director, yearId, {
            confirmYear: 2031,
            reason: 'Fim do ano',
          });
          assert.equal(closed.year.status, 'closed');
          assert.equal(closed.summary.classesClosed, 1);
          assert.equal(closed.summary.enrollmentsCompleted, 1);
          assert.equal(closed.closedBy, 'diretora');
          assert.equal(
            (await one('SELECT status FROM classes WHERE id=$1', [klass.id]))
              .status,
            'closed',
          );
          const enrollment = await one(
            'SELECT status,exit_date FROM student_enrollments WHERE student_id=$1',
            [ana],
          );
          assert.equal(enrollment.status, 'completed');
          assert.ok(enrollment.exit_date);
          const event = await one(
            `SELECT count(*)::int n FROM academic_events WHERE academic_year_id=$1 AND event_type='year_closed'`,
            [yearId],
          );
          assert.equal(event.n, 1);
          const log = await one(
            `SELECT count(*)::int n FROM audit_log WHERE institution_id=$1 AND action='academic_year.close'`,
            [inst.id],
          );
          assert.equal(log.n, 1);
          await assert.rejects(
            years.closeAcademicYear(director, yearId, { confirmYear: 2031 }),
            { statusCode: 409 },
          );
        },
      );

      await t.test(
        'ano encerrado bloqueia notas e novas aplicações',
        async () => {
          await assert.rejects(
            admin.query(
              `UPDATE assessment_results SET processing_status='needs_review' WHERE id=$1`,
              [result.id],
            ),
            /encerrado/,
          );
          await assert.rejects(
            admin.query(
              `INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4)`,
              [inst.id, assessment.id, klass.id, teacherId],
            ),
            /encerrado/,
          );
        },
      );

      await t.test('histórico do ano encerrado continua legível', async () => {
        const { timeline } = await insights.studentTimeline(
          director,
          ana,
          null,
        );
        assert.equal(timeline.length, 1);
        assert.equal(timeline[0].year, 2031);
        assert.equal(timeline[0].status, 'completed');
      });

      await t.test(
        'reabertura libera alterações e reativa a matrícula',
        async () => {
          await years.reopenAcademicYear(director, yearId, {
            reason: 'Correção de nota',
          });
          await admin.query(
            `UPDATE assessment_results SET processing_status='needs_review' WHERE id=$1`,
            [result.id],
          );
          assert.equal(
            (await one('SELECT status FROM classes WHERE id=$1', [klass.id]))
              .status,
            'active',
          );
          const enrollment = await one(
            'SELECT status,exit_date FROM student_enrollments WHERE student_id=$1',
            [ana],
          );
          assert.equal(enrollment.status, 'active');
          assert.equal(enrollment.exit_date, null);
          // E agora a nota em revisão volta a impedir o encerramento.
          const check = await years.academicYearClosingCheck(director, yearId);
          assert.deepEqual(
            check.critical.map((item) => item.code),
            ['results_pending'],
          );
        },
      );
    } finally {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL ufaprova.allow_history_purge='on'");
        await client.query("SET LOCAL ufaprova.allow_closed_year_changes='on'");
        const ids = [[inst.id]];
        await client.query(
          'DELETE FROM assessment_results WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM card_scans WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM assessment_applications WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM assessments WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM classes WHERE institution_id=ANY($1))',
          ids,
        );
        await client.query(
          'DELETE FROM academic_events WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM student_enrollments WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM classes WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM academic_years WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query(
          'DELETE FROM audit_log WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query('DELETE FROM institutions WHERE id=ANY($1)', ids);
        await client.query('DELETE FROM users WHERE id=ANY($1)', [userIds]);
        await client.query('COMMIT');
      } catch (error) {
        console.error('Limpeza do teste de encerramento falhou:', error);
      } finally {
        client.release();
        await admin.end();
        await pool.end();
      }
    }
  },
);
