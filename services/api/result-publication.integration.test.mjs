import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Aplica as migrações reais até a 102, cria um resultado que o aluno já via,
// aplica a 103 e confere o legado publicado e as garantias do novo modelo.
const databaseUrl = process.env.RESULT_PUBLICATION_TEST_DATABASE_URL;
const databaseDir = path.resolve(new URL('../../database', import.meta.url).pathname);

test('result publication migration keeps legacy results visible and blocks unsafe publication', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const schema = 'results_' + randomUUID().replaceAll('-', '');
  const control = new pg.Pool({ connectionString: databaseUrl });
  await control.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  const db = new pg.Pool({ connectionString: url.href, max: 1 });
  const files = (await readdir(databaseDir)).filter((file) => /^\d{3}_.*\.sql$/.test(file)).sort();
  // A trava evita corrida em CREATE EXTENSION quando outros testes aplicam
  // migrações no mesmo banco ao mesmo tempo.
  const apply = async (filter) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ufaprova:schema-migrations',0))");
      for (const file of files.filter(filter)) await client.query(await readFile(path.join(databaseDir, file), 'utf8'));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
  const expectCheck = (promise) => assert.rejects(promise, (error) => ['23514', '23505', '23503'].includes(error.code));
  try {
    await apply((file) => file < '103_');
    const one = async (sql, values) => (await db.query(sql, values)).rows[0];
    const institution = await one(`INSERT INTO institutions(name,slug) VALUES('Escola A',$1) RETURNING id`, ['a-' + schema]);
    const user = await one(`INSERT INTO users(email,display_name) VALUES($1,'Prof A') RETURNING id`, [`${schema}@test.local`]);
    const assessment = await one(`INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Prova 1','Química','1º ano',$2) RETURNING id`, [institution.id, user.id]);
    const question = (number, correct) => ({ number, type: 'single_choice', points: 1,
      alternatives: ['A', 'B', 'C'].map((label) => ({ label, stableKey: `${number}${label}` })), answer: { correctStableKeys: [`${number}${correct}`] } });
    const version = await one(`INSERT INTO assessment_versions(assessment_id,code,seed,snapshot,answer_key) VALUES($1,'A',1,$2::jsonb,'{"1":"A","2":"B","3":"C"}') RETURNING id`,
      [assessment.id, JSON.stringify({ questions: [question(1, 'A'), question(2, 'B'), question(3, 'C')] })]);
    const klass = await one(`INSERT INTO classes(institution_id,name,grade,school_year) VALUES($1,'1A','1º ano',2026) RETURNING id`, [institution.id]);
    const application = await one(`INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
      [institution.id, assessment.id, klass.id, user.id]);
    const student = async (name) => {
      const s = await one(`INSERT INTO students(institution_id,name,registration) VALUES($1,$2,$3) RETURNING id`, [institution.id, name, randomUUID()]);
      return one(`INSERT INTO application_students(application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4) RETURNING id`,
        [application.id, s.id, version.id, randomUUID()]);
    };
    const visible = await student('Ana'), inReview = await student('Bia');
    const items = [
      { questionNumber: 1, status: 'correct', selectedLabels: ['A'], correctLabels: ['A'] },
      { questionNumber: 2, status: 'incorrect', selectedLabels: ['A', 'C'], correctLabels: ['B'] },
      { questionNumber: 3, status: 'unanswered', selectedLabels: [], correctLabels: ['C'] },
    ];
    for (const [assignment, manual] of [[visible, false], [inReview, true]]) {
      const sub = await one(`INSERT INTO assessment_submissions(assessment_version_id,responses,result,score,max_score,requires_manual_review) VALUES($1,'[]',$2::jsonb,1,3,$3) RETURNING id`,
        [version.id, JSON.stringify({ items }), manual]);
      await db.query(`INSERT INTO card_scans(institution_id,uploaded_by,mime_type,image_data,status,application_student_id,submission_id,completed_at) VALUES($1,$2,'image/png','\\x','completed',$3,$4,now())`,
        [institution.id, user.id, assignment.id, sub.id]);
    }

    await apply((file) => file.startsWith('103_'));
    await apply((file) => file.startsWith('103_')); // reaplicar não duplica o legado

    const results = (await db.query(`SELECT ar.*,v.correct_count,v.incorrect_count,v.blank_count,v.invalid_count,v.valid_count,v.percent,v.score,v.source,p.legacy
      FROM assessment_results ar JOIN assessment_result_versions v ON v.id=ar.published_version_id
      JOIN assessment_result_publications p ON p.result_version_id=v.id`)).rows;
    assert.equal(results.length, 1, 'somente o resultado que o aluno já via vira publicação legada');
    const [legacy] = results;
    assert.equal(legacy.application_student_id, visible.id);
    assert.equal(legacy.publication_status, 'published');
    assert.deepEqual([legacy.correct_count, legacy.incorrect_count, legacy.blank_count, legacy.invalid_count, legacy.valid_count], [1, 0, 1, 1, 3]);
    assert.equal(Number(legacy.percent), 33.33);
    assert.equal(legacy.source, 'legacy');
    assert.equal(legacy.legacy, true);

    // Não existe segundo resultado para o mesmo aluno na mesma aplicação.
    await expectCheck(db.query(`INSERT INTO assessment_results(institution_id,application_student_id) VALUES($1,$2)`, [institution.id, visible.id]));

    // Versão com leitura pendente não pode ser publicada.
    await db.query('BEGIN');
    const pendingResult = await one(`INSERT INTO assessment_results(institution_id,application_student_id,processing_status) VALUES($1,$2,'needs_review') RETURNING id`, [institution.id, inReview.id]);
    const pendingVersion = await one(`INSERT INTO assessment_result_versions(result_id,version_number,source,assessment_version_id,answer_key_sha256,scoring_rule,items,question_count,valid_count,correct_count,incorrect_count,blank_count,invalid_count,review_pending_count)
      VALUES($1,1,'omr',$2,repeat('a',64),'{}','[]',3,3,1,0,0,0,2) RETURNING id`, [pendingResult.id, version.id]);
    await db.query(`UPDATE assessment_results SET current_version_id=$2 WHERE id=$1`, [pendingResult.id, pendingVersion.id]);
    await db.query('COMMIT');
    await expectCheck(db.query(`INSERT INTO assessment_result_publications(result_id,result_version_id,authorized_by,authorizer_name) VALUES($1,$2,$3,'Prof A')`,
      [pendingResult.id, pendingVersion.id, user.id]));
    // Contagens precisam fechar: certas + erradas + brancas + inválidas + pendentes = válidas.
    await expectCheck(db.query(`INSERT INTO assessment_result_versions(result_id,version_number,source,assessment_version_id,answer_key_sha256,scoring_rule,items,question_count,valid_count,correct_count,incorrect_count,blank_count,invalid_count,review_pending_count)
      VALUES($1,2,'omr',$2,repeat('b',64),'{}','[]',3,3,2,2,0,0,0)`, [pendingResult.id, version.id]));
    // Uma versão de outro resultado não pode ser publicada neste.
    await expectCheck(db.query(`INSERT INTO assessment_result_publications(result_id,result_version_id,authorized_by,authorizer_name) VALUES($1,$2,$3,'Prof A')`,
      [pendingResult.id, legacy.published_version_id, user.id]));
    // Só uma publicação ativa por resultado.
    await expectCheck(db.query(`INSERT INTO assessment_result_publications(result_id,result_version_id,authorized_by,authorizer_name) VALUES($1,$2,$3,'Prof A')`,
      [legacy.id, legacy.published_version_id, user.id]));
    // Resultado publicado precisa apontar uma versão publicada.
    await expectCheck(db.query(`UPDATE assessment_results SET publication_status='published' WHERE id=$1`, [pendingResult.id]));
    // Anulação sem regra e motivo "outro" sem descrição são recusados.
    await expectCheck(db.query(`INSERT INTO application_result_settings(application_id,institution_id,annulled_questions) VALUES($1,$2,'{2}')`, [application.id, institution.id]));
    await expectCheck(db.query(`INSERT INTO performance_followups(institution_id,result_id,status,reasons) VALUES($1,$2,'justified','{other}')`, [institution.id, legacy.id]));
    await expectCheck(db.query(`INSERT INTO performance_followups(institution_id,result_id,status) VALUES($1,$2,'justified')`, [institution.id, legacy.id]));
    await expectCheck(db.query(`INSERT INTO performance_followups(institution_id,result_id,status,student_guidance_published) VALUES($1,$2,'pending',true)`, [institution.id, legacy.id]));
    await db.query(`INSERT INTO performance_followups(institution_id,result_id,status,reasons,actions,internal_note) VALUES($1,$2,'justified','{attendance}','{recovery}','nota interna')`, [institution.id, legacy.id]);
    await db.query(`INSERT INTO performance_thresholds(institution_id,subject,min_expected_percent) VALUES($1,'Química',60)`, [institution.id]);
    await expectCheck(db.query(`INSERT INTO performance_thresholds(institution_id,subject,min_expected_percent) VALUES($1,'química',70)`, [institution.id]));
  } finally {
    await db.end();
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end();
  }
});
