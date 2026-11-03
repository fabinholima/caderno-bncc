import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Fluxo completo sobre as migrações reais: resultado provisório invisível ao
// aluno, autorização individual e em lote, recálculo por anulação com nova
// autorização, histórico e isolamento entre instituições e alunos.
const databaseUrl = process.env.RESULT_PUBLICATION_TEST_DATABASE_URL;
const databaseDir = path.resolve(new URL('../../database', import.meta.url).pathname);

test('teacher authorization publishes results only to the student who owns them', { skip: !databaseUrl }, async () => {
  const { default: pg } = await import('pg');
  const schema = 'authorize_' + randomUUID().replaceAll('-', '');
  const control = new pg.Pool({ connectionString: databaseUrl });
  await control.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.href;
  const { pool, transaction } = await import('./db.mjs');
  try {
    // Mesma trava do migrate.mjs: outros testes podem migrar o banco ao mesmo tempo.
    await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ufaprova:schema-migrations',0))");
      for (const file of (await readdir(databaseDir)).filter((name) => /^\d{3}_.*\.sql$/.test(name)).sort())
        await client.query(await readFile(path.join(databaseDir, file), 'utf8'));
    });
    const publication = await import('./result-publication.mjs');
    const { recordResultVersion } = await import('./result-versions.mjs');
    const { myActivities } = await import('./class-invites.mjs');
    const one = async (sql, values) => (await pool.query(sql, values)).rows[0];

    const institution = await one(`INSERT INTO institutions(name,slug) VALUES('Escola A',$1) RETURNING id`, ['a' + schema]);
    const otherInstitution = await one(`INSERT INTO institutions(name,slug) VALUES('Escola B',$1) RETURNING id`, ['b' + schema]);
    const teacher = await one(`INSERT INTO users(email,display_name) VALUES($1,'Profa. Ana') RETURNING id`, [`t-${schema}@test.local`]);
    const outsider = await one(`INSERT INTO users(email,display_name) VALUES($1,'Prof. B') RETURNING id`, [`o-${schema}@test.local`]);
    const assessment = await one(`INSERT INTO assessments(institution_id,title,subject,grade,created_by) VALUES($1,'Prova 1','Química','1º ano',$2) RETURNING id`, [institution.id, teacher.id]);
    const question = (number, correct) => ({ number, type: 'single_choice', points: 1,
      alternatives: ['A', 'B', 'C'].map((label) => ({ label, stableKey: `${number}${label}` })), answer: { correctStableKeys: [`${number}${correct}`] },
      skills: number < 3 ? [{ code: 'EM13CNT101', primary: true }] : [] });
    const version = await one(`INSERT INTO assessment_versions(assessment_id,code,seed,snapshot,answer_key) VALUES($1,'A',1,$2::jsonb,'{}') RETURNING id`,
      [assessment.id, JSON.stringify({ questions: [question(1, 'A'), question(2, 'B'), question(3, 'C')] })]);
    const klass = await one(`INSERT INTO classes(institution_id,name,grade,school_year) VALUES($1,'1A','1º ano',2026) RETURNING id`, [institution.id]);
    const application = await one(`INSERT INTO assessment_applications(institution_id,assessment_id,class_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
      [institution.id, assessment.id, klass.id, teacher.id]);
    const enroll = async (name) => {
      const student = await one(`INSERT INTO students(institution_id,name,registration) VALUES($1,$2,$3) RETURNING id`, [institution.id, name, randomUUID()]);
      await pool.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2)', [klass.id, student.id]);
      const assignment = await one(`INSERT INTO application_students(application_id,student_id,assessment_version_id,qr_payload) VALUES($1,$2,$3,$4) RETURNING id`,
        [application.id, student.id, version.id, randomUUID()]);
      return { studentId: student.id, assignmentId: assignment.id };
    };
    const ana = await enroll('Ana'), bia = await enroll('Bia'), caio = await enroll('Caio');
    const studentAccount = async (enrolled, email) => {
      const user = await one(`INSERT INTO users(email,display_name,account_type) VALUES($1,$1,'student') RETURNING id`, [email]);
      await pool.query('INSERT INTO student_account_links(institution_id,user_id,student_id,linked_by) VALUES($1,$2,$3,$2)', [institution.id, user.id, enrolled.studentId]);
      await pool.query(`INSERT INTO class_join_requests(class_id,institution_id,user_id,student_id,status,source) VALUES($1,$2,$3,$4,'approved','access_code')`,
        [klass.id, institution.id, user.id, enrolled.studentId]);
      return { userId: user.id, role: 'student' };
    };
    const anaAccount = await studentAccount(ana, `ana-${schema}@test.local`);
    const caioAccount = await studentAccount(caio, `caio-${schema}@test.local`);
    const answer = (questionNumber, label, status = 'recognized') => ({ questionNumber, selectedLabels: label ? [label] : [], status });
    const record = (enrolled, answers, extra = {}) => transaction((client) => recordResultVersion(client, {
      applicationStudentId: enrolled.assignmentId, source: 'omr', answers, ...extra,
    }));

    const anaV1 = await record(ana, [answer(1, 'A'), answer(2, 'B'), answer(3, 'A')]);
    const biaV1 = await record(bia, [answer(1, 'A'), answer(2, 'B', 'uncertain'), answer(3, 'C')]);
    assert.equal(anaV1.summary.publishable, true);
    assert.equal(biaV1.summary.publishable, false);

    // Provisório: o aluno sabe que está em correção, mas não vê nota.
    let [activity] = await myActivities(anaAccount);
    assert.deepEqual([activity.resultStatus, activity.score, activity.percent, activity.correctCount], ['in_correction', null, null, null]);

    const listed = await publication.listApplicationResults({ institutionId: institution.id, applicationId: application.id });
    assert.equal(listed.application.subject, 'Química');
    assert.deepEqual(listed.application.questionCounts, [3]);
    const byName = Object.fromEntries(listed.students.map((student) => [student.studentName, student]));
    assert.equal(byName.Ana.publishable, true);
    assert.deepEqual(byName.Ana.counts, { questions: 3, valid: 3, correct: 2, incorrect: 1, blank: 0, invalid: 0, annulled: 0, reviewPending: 0, manualPending: 0 });
    assert.equal(byName.Bia.publishable, false);
    assert.equal(byName.Bia.processingStatus, 'needs_review');
    assert.equal(byName.Caio.processingStatus, 'not_scanned');

    // Outra instituição não enxerga nem autoriza.
    await assert.rejects(publication.listApplicationResults({ institutionId: otherInstitution.id, applicationId: application.id }), (error) => error.statusCode === 404);
    await assert.rejects(publication.getResultDetail({ institutionId: otherInstitution.id, resultId: anaV1.resultId }), (error) => error.statusCode === 404);
    await assert.rejects(publication.authorizeResults({ institutionId: otherInstitution.id, userId: outsider.id,
      input: { applicationId: application.id, items: [{ resultId: anaV1.resultId, versionId: anaV1.versionId }] } }), (error) => error.statusCode === 404);

    // Lote: só o resultado sem pendências é publicado.
    const batch = { clientMutationId: randomUUID(), applicationId: application.id, items: [
      { resultId: anaV1.resultId, versionId: anaV1.versionId },
      { resultId: biaV1.resultId, versionId: biaV1.versionId },
      { resultId: randomUUID(), versionId: randomUUID() },
    ] };
    const authorized = await publication.authorizeResults({ institutionId: institution.id, userId: teacher.id, input: batch });
    assert.deepEqual(authorized.items.map((item) => item.outcome), ['published', 'pending_review', 'not_found']);
    // Repetir o envio devolve a mesma resposta, sem outro lançamento.
    assert.deepEqual(await publication.authorizeResults({ institutionId: institution.id, userId: teacher.id, input: batch }), authorized);
    assert.equal((await publication.authorizeResults({ institutionId: institution.id, userId: teacher.id,
      input: { applicationId: application.id, items: [{ resultId: anaV1.resultId, versionId: anaV1.versionId }] } })).items[0].outcome, 'already_published');
    assert.equal((await one('SELECT count(*)::int n FROM assessment_result_publications')).n, 1);

    [activity] = await myActivities(anaAccount);
    assert.deepEqual([activity.resultStatus, Number(activity.score), activity.percent, activity.correctCount, activity.incorrectCount, activity.subject],
      ['published', 2, 66.67, 2, 1, 'Química']);
    assert.ok(activity.publishedAt);
    // Cada aluno vê somente a própria matrícula.
    const caioActivities = await myActivities(caioAccount);
    assert.equal(caioActivities.length, 1);
    assert.deepEqual([caioActivities[0].resultStatus, caioActivities[0].score], ['not_corrected', null]);
    await assert.rejects(myActivities({ userId: teacher.id, role: 'teacher' }), (error) => error.statusCode === 403);

    // Anulação sem regra é recusada; com regra, recalcula e exige nova autorização.
    await assert.rejects(publication.saveResultSettings({ institutionId: institution.id, userId: teacher.id, applicationId: application.id,
      input: { annulledQuestions: [3] } }), (error) => error.statusCode === 422);
    await assert.rejects(publication.saveResultSettings({ institutionId: institution.id, userId: teacher.id, applicationId: application.id,
      input: { annulledQuestions: [9], annulledPolicy: 'exclude' } }), (error) => error.statusCode === 422);
    await assert.rejects(publication.saveResultSettings({ institutionId: otherInstitution.id, userId: outsider.id, applicationId: application.id,
      input: { minExpectedPercent: 10 } }), (error) => error.statusCode === 404);
    const settings = await publication.saveResultSettings({ institutionId: institution.id, userId: teacher.id, applicationId: application.id,
      input: { minExpectedPercent: 70, releasePolicy: 'answers', annulledQuestions: [3], annulledPolicy: 'exclude' } });
    assert.equal(settings.recalculated, 2);
    assert.equal(settings.effectiveMinExpectedPercent, 70);
    // Salvar a mesma regra não recalcula de novo.
    assert.equal((await publication.saveResultSettings({ institutionId: institution.id, userId: teacher.id, applicationId: application.id,
      input: { minExpectedPercent: 70, releasePolicy: 'answers', annulledQuestions: [3], annulledPolicy: 'exclude' } })).recalculated, 0);

    const afterRule = Object.fromEntries((await publication.listApplicationResults({ institutionId: institution.id, applicationId: application.id }))
      .students.map((student) => [student.studentName, student]));
    assert.equal(afterRule.Ana.publicationStatus, 'republish_required');
    assert.equal(afterRule.Ana.currentVersion, 2);
    assert.equal(afterRule.Ana.percent, 100);
    assert.equal(afterRule.Ana.published.version, 1);
    assert.equal(afterRule.Ana.belowExpected, false);
    assert.equal(afterRule.Bia.counts.reviewPending, 1, 'o recálculo não resolve a leitura duvidosa');
    // O aluno continua vendo a versão publicada até a nova autorização.
    [activity] = await myActivities(anaAccount);
    assert.equal(activity.percent, 66.67);

    const stale = await publication.authorizeResults({ institutionId: institution.id, userId: teacher.id,
      input: { applicationId: application.id, items: [{ resultId: anaV1.resultId, versionId: anaV1.versionId }] } });
    assert.equal(stale.items[0].outcome, 'stale');
    await publication.authorizeResults({ institutionId: institution.id, userId: teacher.id,
      input: { applicationId: application.id, items: [{ resultId: anaV1.resultId, versionId: afterRule.Ana.currentVersionId }] } });
    [activity] = await myActivities(anaAccount);
    assert.deepEqual([activity.percent, Number(activity.score), Number(activity.maxScore), activity.annulledCount], [100, 2, 2, 1]);

    // Detalhe do aluno: respostas conforme a política, habilidades com a base
    // de evidência e somente a orientação publicada.
    const studentResults = await import('./student-results.mjs');
    let mine = await studentResults.myResultDetail(anaAccount, anaV1.resultId);
    assert.equal(mine.releasePolicy, 'answers');
    assert.deepEqual(mine.questions.map((q) => [q.questionNumber, q.status, q.selectedLabels, q.correctLabels]),
      [[1, 'correct', ['A'], undefined], [2, 'correct', ['B'], undefined], [3, 'annulled', ['A'], undefined]]);
    // A descrição vem do catálogo BNCC carregado pelas migrações.
    const [{ description, ...skill }] = mine.skills;
    assert.deepEqual(skill, { code: 'EM13CNT101', questions: 2, correct: 2, percent: 100, sufficientEvidence: false });
    assert.match(description, /^Analisar e representar/);
    assert.equal(mine.guidance, null);
    await pool.query(`INSERT INTO performance_followups(institution_id,result_id,status,reasons,actions,internal_note,student_guidance,student_guidance_published)
      VALUES($1,$2,'justified','{attendance}','{recovery}','conversa com a família','Refaça a lista 3 até sexta.',true)`, [institution.id, anaV1.resultId]);
    mine = await studentResults.myResultDetail(anaAccount, anaV1.resultId);
    assert.equal(mine.guidance.text, 'Refaça a lista 3 até sexta.');
    assert.ok(!JSON.stringify(mine).includes('família'), 'nota interna nunca chega ao aluno');
    assert.ok(!JSON.stringify(mine).includes('attendance'), 'motivos não chegam ao aluno');
    await pool.query(`INSERT INTO performance_followups(institution_id,result_id,status,reasons,student_guidance,student_guidance_published,created_at)
      VALUES($1,$2,'justified','{attendance}','rascunho',false,now()+interval '1 second')`, [institution.id, anaV1.resultId]);
    assert.equal((await studentResults.myResultDetail(anaAccount, anaV1.resultId)).guidance, null, 'orientação retirada deixa de aparecer');
    await publication.saveResultSettings({ institutionId: institution.id, userId: teacher.id, applicationId: application.id,
      input: { minExpectedPercent: 70, releasePolicy: 'answers_and_key', annulledQuestions: [3], annulledPolicy: 'exclude' } });
    assert.deepEqual((await studentResults.myResultDetail(anaAccount, anaV1.resultId)).questions[0].correctLabels, ['A']);
    await publication.saveResultSettings({ institutionId: institution.id, userId: teacher.id, applicationId: application.id,
      input: { minExpectedPercent: 70, releasePolicy: 'summary', annulledQuestions: [3], annulledPolicy: 'exclude' } });
    assert.deepEqual((await studentResults.myResultDetail(anaAccount, anaV1.resultId)).questions, []);
    // Outro aluno, resultado não publicado ou conta de professor não acessam.
    await assert.rejects(studentResults.myResultDetail(caioAccount, anaV1.resultId), (error) => error.statusCode === 404);
    await assert.rejects(studentResults.myResultDetail(anaAccount, randomUUID()), (error) => error.statusCode === 404);
    await assert.rejects(studentResults.myResultDetail({ userId: teacher.id, role: 'teacher' }, anaV1.resultId), (error) => error.statusCode === 403);
    const performance = await studentResults.mySkillPerformance(anaAccount);
    assert.deepEqual(performance.map((entry) => [entry.subject, entry.assessments, entry.skills.map((skill) => [skill.code, skill.questions])]), [['Química', 1, [['EM13CNT101', 2]]]]);
    assert.deepEqual(await studentResults.mySkillPerformance(caioAccount), []);

    const detail = await publication.getResultDetail({ institutionId: institution.id, resultId: anaV1.resultId });
    assert.deepEqual(detail.versions.map((item) => [item.version, item.source]), [[2, 'recalculation'], [1, 'omr']]);
    assert.equal(detail.publications.length, 2);
    assert.equal(detail.publications.filter((item) => item.supersededAt === null).length, 1);
    assert.equal(detail.publications[0].authorizerName, 'Profa. Ana');
    assert.deepEqual(detail.changes.map((change) => [change.questionNumber, change.previousStatus, change.newStatus]), [[3, 'incorrect', 'annulled']]);

    // Professor revisa a leitura duvidosa; só então o resultado pode ser publicado.
    const biaReviewed = await record(bia, [answer(1, 'A', 'confirmed'), answer(2, 'B', 'confirmed'), answer(3, 'C', 'confirmed')], { userId: teacher.id });
    assert.equal(biaReviewed.summary.publishable, true);
    const biaPublished = await publication.authorizeResults({ institutionId: institution.id, userId: teacher.id,
      input: { applicationId: application.id, items: [{ resultId: biaReviewed.resultId, versionId: biaReviewed.versionId }] } });
    assert.equal(biaPublished.items[0].outcome, 'published');
    assert.equal((await one(`SELECT count(*)::int n FROM audit_log WHERE action='result.authorize'`)).n, 3);

    // Inativar a assinatura não esconde o histórico publicado.
    await pool.query(`UPDATE institution_subscriptions SET status='past_due',period_ends_at=now()-interval '1 day' WHERE institution_id=$1`, [institution.id]);
    [activity] = await myActivities(anaAccount);
    assert.equal(activity.resultStatus, 'published');
  } finally {
    await pool.end();
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end();
  }
});
