import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.CLASS_ROSTER_TEST_DATABASE_URL;

test(
  'lista da turma e relatório individual trazem a foto apenas para a instituição do aluno',
  { skip: !databaseUrl },
  async () => {
    const { default: pg } = await import('pg');
    const control = new pg.Pool({ connectionString: databaseUrl });
    const schema = `class_roster_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    process.env.NODE_ENV = 'test';
    const { pool } = await import('./db.mjs');
    const { getClassRoster } = await import('./academic.mjs');
    const { getStudentApplicationReport } = await import('./reports.mjs');

    try {
      await pool.query(`
        CREATE TABLE institutions(id uuid PRIMARY KEY,name text);
        CREATE TABLE memberships(institution_id uuid,user_id uuid,role text,PRIMARY KEY(institution_id,user_id));
        CREATE TABLE classes(id uuid PRIMARY KEY,institution_id uuid,name text,grade text,school_year integer,school_id uuid);
        CREATE TABLE educator_schools(id uuid PRIMARY KEY,name text);
        CREATE TABLE class_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid,school_id uuid,active boolean);
        CREATE TABLE students(id uuid PRIMARY KEY,institution_id uuid,name text,registration text,
          active boolean DEFAULT true,status text DEFAULT 'ativo',selfie_data_url text DEFAULT '');
        CREATE TABLE class_enrollments(class_id uuid,student_id uuid,number integer,PRIMARY KEY(class_id,student_id));
        CREATE TABLE assessments(id uuid PRIMARY KEY,title text);
        CREATE TABLE assessment_versions(id uuid PRIMARY KEY,code text,snapshot jsonb);
        CREATE TABLE assessment_applications(id uuid PRIMARY KEY,institution_id uuid,assessment_id uuid,class_id uuid);
        CREATE TABLE application_students(id uuid PRIMARY KEY,application_id uuid,student_id uuid,assessment_version_id uuid);
        CREATE TABLE assessment_submissions(id uuid PRIMARY KEY,score numeric,max_score numeric,
          requires_manual_review boolean DEFAULT false,result jsonb);
        CREATE TABLE card_scans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),application_student_id uuid,status text,
          submission_id uuid,completed_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
      `);

      const school = randomUUID();
      const otherSchool = randomUUID();
      const teacher = randomUUID();
      const otherTeacher = randomUUID();
      const outsider = randomUUID();
      const classId = randomUUID();
      const educatorSchool = randomUUID();
      const withPhoto = randomUUID();
      const withoutPhoto = randomUUID();
      const foreignStudent = randomUUID();
      const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      await pool.query(`INSERT INTO institutions VALUES($1,'Instituição A'),($2,'Instituição B')`, [school, otherSchool]);
      await pool.query(`INSERT INTO memberships VALUES($1,$2,'teacher'),($3,$4,'teacher')`, [school, teacher, otherSchool, otherTeacher]);
      await pool.query(`INSERT INTO classes VALUES($1,$2,'3º A','Ensino Médio',2026)`, [classId, school]);
      await pool.query(`INSERT INTO educator_schools VALUES($1,'Escola Estadual Modelo')`, [educatorSchool]);
      await pool.query(`INSERT INTO class_invites(class_id,school_id,active) VALUES($1,$2,true)`, [classId, educatorSchool]);
      await pool.query(
        `INSERT INTO students(id,institution_id,name,registration,selfie_data_url,status) VALUES
          ($1,$4,'Ana','001',$5,'ativo'),($2,$4,'Bruno','002','','transferido'),($3,$6,'Intruso','999',$5,'ativo')`,
        [withPhoto, withoutPhoto, foreignStudent, school, photo, otherSchool],
      );
      await pool.query(
        `INSERT INTO class_enrollments VALUES($1,$2,2),($1,$3,1),($1,$4,3)`,
        [classId, withPhoto, withoutPhoto, foreignStudent],
      );

      const roster = await getClassRoster({ institutionId: school, userId: teacher, classId });
      assert.equal(roster.schoolName, 'Escola Estadual Modelo');
      assert.deepEqual(roster.class, { id: classId, name: '3º A', grade: 'Ensino Médio', schoolYear: 2026 });
      assert.deepEqual(
        roster.students.map((student) => [student.name, student.registration, student.status, student.selfieDataUrl]),
        [
          ['Bruno', '002', 'transferido', null],
          ['Ana', '001', 'ativo', photo],
        ],
      );
      await assert.rejects(
        getClassRoster({ institutionId: otherSchool, userId: otherTeacher, classId }),
        (error) => error.statusCode === 404,
      );
      await assert.rejects(
        getClassRoster({ institutionId: school, userId: outsider, classId }),
        (error) => error.statusCode === 404,
      );
      await pool.query('UPDATE class_invites SET active=false');
      assert.equal(
        (await getClassRoster({ institutionId: school, userId: teacher, classId })).schoolName,
        'Instituição A',
      );

      const assessmentId = randomUUID();
      const versionId = randomUUID();
      const applicationId = randomUUID();
      const applicationStudent = randomUUID();
      const submission = randomUUID();
      await pool.query(`INSERT INTO assessments VALUES($1,'Simulado')`, [assessmentId]);
      await pool.query(`INSERT INTO assessment_versions VALUES($1,'A','{}'::jsonb)`, [versionId]);
      await pool.query(`INSERT INTO assessment_applications VALUES($1,$2,$3,$4)`, [applicationId, school, assessmentId, classId]);
      await pool.query(`INSERT INTO application_students VALUES($1,$2,$3,$4)`, [applicationStudent, applicationId, withPhoto, versionId]);
      await pool.query(
        `INSERT INTO assessment_submissions VALUES($1,1,2,false,$2::jsonb)`,
        [submission, JSON.stringify({ items: [{ questionNumber: 1, status: 'correct' }, { questionNumber: 2, status: 'incorrect' }] })],
      );
      await pool.query(`INSERT INTO card_scans(application_student_id,status,submission_id) VALUES($1,'completed',$2)`, [applicationStudent, submission]);

      const report = await getStudentApplicationReport({ institutionId: school, applicationId, studentId: withPhoto });
      assert.equal(report.student.selfieDataUrl, photo);
      assert.equal(report.student.registration, '001');
      assert.equal(
        await getStudentApplicationReport({ institutionId: otherSchool, applicationId, studentId: withPhoto }),
        null,
      );
      await pool.query('UPDATE students SET selfie_data_url=$2 WHERE id=$1', [withPhoto, '']);
      assert.equal(
        (await getStudentApplicationReport({ institutionId: school, applicationId, studentId: withPhoto })).student.selfieDataUrl,
        null,
      );
    } finally {
      await pool.end();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.end();
    }
  },
);
