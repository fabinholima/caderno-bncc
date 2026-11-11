import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Banco com todas as migrações aplicadas (node migrate.mjs), inclusive a 111.
const url = process.env.ACADEMIC_TEST_DATABASE_URL;

test(
  'gestão acadêmica: anos letivos, histórico de matrículas e autorização',
  { skip: !url },
  async (t) => {
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    const admin = new pg.Pool({ connectionString: url });
    const { pool } = await import('./db.mjs');
    const years = await import('./academic-years.mjs');
    const { enrollStudent, deleteClass } = await import('./academic.mjs');
    const q = (text, values) => admin.query(text, values).then((r) => r.rows);
    const tag = randomUUID().slice(0, 8);

    const [inst] = await q(
      `INSERT INTO institutions(name,slug) VALUES('Escola A',$1) RETURNING id`,
      [`acad-a-${tag}`],
    );
    const [other] = await q(
      `INSERT INTO institutions(name,slug) VALUES('Escola B',$1) RETURNING id`,
      [`acad-b-${tag}`],
    );
    const users = {};
    for (const name of ['coord', 'teacher', 'outsider'])
      users[name] = (
        await q(
          `INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id`,
          [`${name}-${tag}@teste.local`, name],
        )
      )[0].id;
    const coordinator = {
      userId: users.coord,
      institutionId: inst.id,
      role: 'coordinator',
    };
    const teacher = {
      userId: users.teacher,
      institutionId: inst.id,
      role: 'teacher',
    };
    const outsiderAdmin = {
      userId: users.outsider,
      institutionId: other.id,
      role: 'admin',
    };
    const newClass = async (name, grade, year, createdBy = users.coord) =>
      (
        await q(
          `INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,academic_year_id`,
          [inst.id, name, grade, year, createdBy],
        )
      )[0];
    const newStudent = async (name, registration) =>
      (
        await q(
          `INSERT INTO students(institution_id,registration,name,teacher_id) VALUES($1,$2,$3,$4) RETURNING id`,
          [inst.id, registration, name, users.coord],
        )
      )[0].id;

    try {
      await t.test(
        'turma nova cria e vincula o ano letivo automaticamente',
        async () => {
          const c = await newClass('1º A', '1º ano', 2026);
          assert.ok(c.academic_year_id);
          const list = await years.listAcademicYears(coordinator);
          assert.deepEqual(
            list.map((y) => [y.year, y.status, y.classCount]),
            [[2026, 'active', 1]],
          );
        },
      );

      await t.test(
        'matrícula gera histórico e saída da turma não apaga o registro',
        async () => {
          const c = await newClass('1º B', '1º ano', 2026);
          const joao = await newStudent('João', `RA-J-${tag}`);
          await enrollStudent({
            institutionId: inst.id,
            userId: users.coord,
            classId: c.id,
            input: { studentId: joao, number: 7 },
          });
          let history = await years.getStudentHistory(coordinator, joao, null);
          assert.equal(history.enrollments.length, 1);
          assert.equal(history.enrollments[0].status, 'active');
          assert.equal(history.enrollments[0].callNumber, 7);
          assert.equal(history.events[0].type, 'enrollment_created');
          assert.equal(history.events[0].actorName, 'coord');

          await q(
            'DELETE FROM class_enrollments WHERE class_id=$1 AND student_id=$2',
            [c.id, joao],
          );
          history = await years.getStudentHistory(coordinator, joao, null);
          assert.equal(history.enrollments.length, 1);
          assert.equal(history.enrollments[0].status, 'cancelled');
          assert.ok(history.enrollments[0].exitDate);
          assert.deepEqual(
            history.events.map((e) => e.type),
            ['enrollment_created', 'enrollment_closed'],
          );

          // Rematrícula cria novo registro, preservando o anterior.
          await enrollStudent({
            institutionId: inst.id,
            classId: c.id,
            input: { studentId: joao },
          });
          history = await years.getStudentHistory(coordinator, joao, null);
          assert.deepEqual(
            history.enrollments.map((e) => e.status),
            ['cancelled', 'active'],
          );

          // Exclusão de turma vazia de outra forma mantém o retrato da matrícula.
          await q('DELETE FROM class_enrollments WHERE class_id=$1', [c.id]);
          await deleteClass({ institutionId: inst.id, classId: c.id });
          history = await years.getStudentHistory(coordinator, joao, null);
          assert.equal(history.enrollments.length, 2);
          assert.ok(history.enrollments.every((e) => e.classId === null));
          assert.ok(history.enrollments.every((e) => e.className === '1º B'));
        },
      );

      await t.test('impede matrícula ativa duplicada na turma', async () => {
        const c = await newClass('2º A', '2º ano', 2026);
        const ana = await newStudent('Ana', `RA-A-${tag}`);
        await q(
          'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
          [c.id, ana],
        );
        const [{ seid }] = await q(
          `SELECT id seid FROM student_enrollments WHERE student_id=$1`,
          [ana],
        );
        await assert.rejects(
          q(
            `INSERT INTO student_enrollments(student_id,institution_id,class_id,academic_year_id,class_name,grade_level)
             SELECT $1,$2,$3,academic_year_id,'2º A','2º ano' FROM classes WHERE id=$3`,
            [ana, inst.id, c.id],
          ),
          { code: '23505' },
        );
        assert.ok(seid);
      });

      await t.test(
        'histórico é imutável: sem exclusão, sem reativar e eventos fixos',
        async () => {
          const [row] = await q(
            `SELECT se.id FROM student_enrollments se WHERE se.institution_id=$1 AND status='cancelled' LIMIT 1`,
            [inst.id],
          );
          await assert.rejects(
            q('DELETE FROM student_enrollments WHERE id=$1', [row.id]),
            { code: '42501' },
          );
          await assert.rejects(
            q(`UPDATE student_enrollments SET status='active',exit_date=NULL WHERE id=$1`, [
              row.id,
            ]),
            { code: '23514' },
          );
          await assert.rejects(
            q(`UPDATE academic_events SET reason='x' WHERE institution_id=$1`, [
              inst.id,
            ]),
            { code: '42501' },
          );
          await assert.rejects(
            q(`DELETE FROM academic_events WHERE institution_id=$1`, [inst.id]),
            { code: '42501' },
          );
        },
      );

      await t.test(
        'turma com matrícula não muda de ano letivo (sem reutilização)',
        async () => {
          const c = await newClass('3º A', '3º ano', 2026);
          const s = await newStudent('Bia', `RA-B-${tag}`);
          await q(
            'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
            [c.id, s],
          );
          await assert.rejects(
            q('UPDATE classes SET school_year=2027 WHERE id=$1', [c.id]),
            { code: '23514' },
          );
        },
      );

      await t.test(
        'cria e edita ano letivo com auditoria antes/depois',
        async () => {
          const created = await years.createAcademicYear(coordinator, {
            year: 2027,
            startDate: '2027-02-01',
            endDate: '2027-12-15',
          });
          assert.equal(created.status, 'planning');
          await assert.rejects(
            years.createAcademicYear(coordinator, { year: 2027 }),
            { statusCode: 409 },
          );
          await assert.rejects(
            years.updateAcademicYear(coordinator, created.id, {
              startDate: '2028-01-01',
            }),
            { statusCode: 422 },
          );
          const updated = await years.updateAcademicYear(
            coordinator,
            created.id,
            { status: 'active', reason: 'Início do calendário' },
          );
          assert.equal(updated.status, 'active');
          const [log] = await q(
            `SELECT before_data,after_data,reason,user_id FROM audit_log
             WHERE entity_type='academic_year' AND entity_id=$1 AND action='academic_year.update'`,
            [created.id],
          );
          assert.equal(log.before_data.status, 'planning');
          assert.equal(log.after_data.status, 'active');
          assert.equal(log.reason, 'Início do calendário');
          assert.equal(log.user_id, users.coord);
          // Encerrar fica para o fluxo de encerramento.
          await assert.rejects(
            years.updateAcademicYear(coordinator, created.id, {
              status: 'closed',
            }),
          );
        },
      );

      await t.test('ano encerrado bloqueia novas turmas e matrículas', async () => {
        const c = await newClass('1º C', '1º ano', 2025);
        await q(
          `UPDATE academic_years SET status='closed',closed_at=now() WHERE id=$1`,
          [c.academic_year_id],
        );
        const s = await newStudent('Caio', `RA-C-${tag}`);
        await assert.rejects(
          enrollStudent({
            institutionId: inst.id,
            classId: c.id,
            input: { studentId: s },
          }),
          { statusCode: 409 },
        );
        await assert.rejects(newClass('1º D', '1º ano', 2025), {
          code: '23514',
        });
        await assert.rejects(
          years.updateAcademicYear(coordinator, c.academic_year_id, {
            endDate: '2025-12-20',
          }),
          { statusCode: 409 },
        );
      });

      await t.test(
        'exclui ano vazio, arquiva sem matrículas ativas e reabre com motivo',
        async () => {
          const empty = await years.createAcademicYear(coordinator, {
            year: 2031,
          });
          await assert.rejects(
            years.deleteAcademicYear(teacher, empty.id),
            { statusCode: 403 },
          );
          assert.deepEqual(
            await years.deleteAcademicYear(coordinator, empty.id),
            { id: empty.id, deleted: true },
          );
          const [{ n: gone }] = await q(
            'SELECT count(*)::int n FROM academic_years WHERE id=$1',
            [empty.id],
          );
          assert.equal(gone, 0);
          const [log] = await q(
            `SELECT before_data FROM audit_log WHERE action='academic_year.delete' AND entity_id=$1`,
            [empty.id],
          );
          assert.equal(log.before_data.year, 2031);

          const c = await newClass('1º Z', '1º ano', 2032);
          const s = await newStudent('Zeca', `RA-Z-${tag}`);
          await q(
            'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
            [c.id, s],
          );
          await assert.rejects(
            years.deleteAcademicYear(coordinator, c.academic_year_id),
            { statusCode: 409 },
          );
          await assert.rejects(
            years.archiveAcademicYear(coordinator, c.academic_year_id),
            { statusCode: 409 },
          );
          await q('DELETE FROM class_enrollments WHERE class_id=$1', [c.id]);
          const archived = await years.archiveAcademicYear(
            coordinator,
            c.academic_year_id,
            { reason: 'Fim do ano' },
          );
          assert.equal(archived.status, 'archived');
          assert.ok(archived.closedAt);
          const [klass] = await q('SELECT status FROM classes WHERE id=$1', [
            c.id,
          ]);
          assert.equal(klass.status, 'archived');
          // Arquivado não aceita matrícula nem edição.
          await assert.rejects(
            enrollStudent({
              institutionId: inst.id,
              classId: c.id,
              input: { studentId: s },
            }),
            { statusCode: 409 },
          );
          await assert.rejects(
            years.updateAcademicYear(coordinator, c.academic_year_id, {
              endDate: '2032-12-01',
            }),
            { statusCode: 409 },
          );
          // Reabertura: só administrador e com motivo.
          await assert.rejects(
            years.reopenAcademicYear(coordinator, c.academic_year_id, {
              reason: 'Correção de notas',
            }),
            { statusCode: 403 },
          );
          const adminIdentity = { ...coordinator, role: 'admin' };
          await assert.rejects(
            years.reopenAcademicYear(adminIdentity, c.academic_year_id, {}),
          );
          const reopened = await years.reopenAcademicYear(
            adminIdentity,
            c.academic_year_id,
            { reason: 'Correção de notas' },
          );
          assert.equal(reopened.status, 'active');
          const [again] = await q('SELECT status FROM classes WHERE id=$1', [
            c.id,
          ]);
          assert.equal(again.status, 'active');
          const [event] = await q(
            `SELECT reason FROM academic_events WHERE academic_year_id=$1 AND event_type='year_reopened'`,
            [c.academic_year_id],
          );
          assert.equal(event.reason, 'Correção de notas');
          await assert.rejects(
            years.archiveAcademicYear(outsiderAdmin, c.academic_year_id),
            { statusCode: 404 },
          );
        },
      );

      await t.test('autorização no backend', async () => {
        await assert.rejects(
          years.createAcademicYear(teacher, { year: 2030 }),
          { statusCode: 403 },
        );
        await assert.rejects(
          years.listAcademicYears({ ...teacher, role: 'student' }),
          { statusCode: 403 },
        );
        const [own] = await q(
          `SELECT id FROM academic_years WHERE institution_id=$1 LIMIT 1`,
          [inst.id],
        );
        // Outra instituição não enxerga nem altera os anos letivos.
        assert.deepEqual(await years.listAcademicYears(outsiderAdmin), []);
        await assert.rejects(
          years.updateAcademicYear(outsiderAdmin, own.id, {
            endDate: '2026-12-01',
          }),
          { statusCode: 404 },
        );
        const [student] = await q(
          `SELECT id FROM students WHERE institution_id=$1 LIMIT 1`,
          [inst.id],
        );
        await assert.rejects(
          years.getStudentHistory(outsiderAdmin, student.id, null),
          { statusCode: 404 },
        );
        // Professor só vê histórico de alunos das suas turmas.
        await assert.rejects(
          years.getStudentHistory(teacher, student.id, users.teacher),
          { statusCode: 404 },
        );
        const c = await newClass('1º T', '1º ano', 2026, users.teacher);
        await q(
          'INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)',
          [c.id, student.id],
        );
        const history = await years.getStudentHistory(
          teacher,
          student.id,
          users.teacher,
        );
        assert.ok(history.enrollments.length >= 1);
      });
    } finally {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL ufaprova.allow_history_purge='on'");
        const ids = [[inst.id, other.id]];
        await client.query(
          'DELETE FROM academic_events WHERE institution_id=ANY($1)',
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
        await client.query('DELETE FROM classes WHERE institution_id=ANY($1)', ids);
        await client.query(
          'DELETE FROM academic_years WHERE institution_id=ANY($1)',
          ids,
        );
        await client.query('DELETE FROM audit_log WHERE institution_id=ANY($1)', ids);
        await client.query('DELETE FROM institutions WHERE id=ANY($1)', ids);
        await client.query('DELETE FROM users WHERE id=ANY($1)', [
          Object.values(users),
        ]);
        await client.query('COMMIT');
      } finally {
        client.release();
        await admin.end();
        await pool.end();
      }
    }
  },
);
