import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

// Fluxo completo da correção de redações sobre um banco com todas as
// migrações (ESSAY_TEST_DATABASE_URL). O provedor de IA é substituído por um
// fetch de teste que devolve respostas no formato do Gemini.
const url = process.env.ESSAY_TEST_DATABASE_URL;

const png = `data:image/png;base64,${Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.from('conteudo de teste da folha'),
]).toString('base64')}`;

function geminiReply(payload) {
  return async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      modelVersion: 'gemini-teste',
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(payload) }] },
        },
      ],
      usageMetadata: {
        promptTokenCount: 1000,
        candidatesTokenCount: 200,
        totalTokenCount: 1200,
      },
    }),
  });
}

const essayText = Array.from(
  { length: 10 },
  (_, index) =>
    `Parágrafo ${index + 1}: a mobilidade urbana no Brasil enfrenta desafios históricos de planejamento e investimento público.`,
).join('\n');

test(
  'correção de redações: envio, IA, correção manual, publicação e permissões',
  { skip: !url, timeout: 300_000 },
  async () => {
    process.env.DATABASE_URL = url;
    const storageDir = mkdtempSync(path.join(tmpdir(), 'essay-files-'));
    process.env.FILE_STORAGE_PROVIDER = 'filesystem';
    process.env.FILE_STORAGE_DIR = storageDir;
    process.env.ESSAY_AI_PROVIDER = 'gemini';
    const { pool } = await import('./db.mjs');
    const essays = await import('./essays.mjs');
    const correction = await import('./essay-correction.mjs');
    const jobs = await import('./essay-jobs.mjs');
    const grading = await import('./essay-grading.mjs');
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    const institutionId = randomUUID();
    const otherInstitutionId = randomUUID();
    const [teacherId, colleagueId, coordinatorId, studentUserId, outsiderId] =
      Array.from({ length: 5 }, () => randomUUID());
    const aiEnv = { GEMINI_API_KEY: 'chave-de-teste' };
    try {
      await admin.query(
        `INSERT INTO institutions(id,name,slug) VALUES ($1,'Escola Redação',$3),($2,'Outra',$4)`,
        [
          institutionId,
          otherInstitutionId,
          `r-${institutionId}`,
          `x-${otherInstitutionId}`,
        ],
      );
      for (const [id, name, type] of [
        [teacherId, 'Profa. Ana', 'educator'],
        [colleagueId, 'Prof. Beto', 'educator'],
        [coordinatorId, 'Coord. Clara', 'educator'],
        [studentUserId, 'Aluna Duda', 'student'],
        [outsiderId, 'Prof. Externo', 'educator'],
      ])
        await admin.query(
          'INSERT INTO users(id,email,display_name,account_type) VALUES ($1,$2,$3,$4)',
          [id, `${id}@teste.local`, name, type],
        );
      await admin.query(
        `INSERT INTO memberships(institution_id,user_id,role) VALUES ($1,$2,'teacher'),($1,$3,'teacher'),($1,$4,'coordinator'),($5,$6,'teacher')`,
        [
          institutionId,
          teacherId,
          colleagueId,
          coordinatorId,
          otherInstitutionId,
          outsiderId,
        ],
      );
      const classIds = [];
      for (const name of ['A', 'B'])
        classIds.push(
          (
            await admin.query(
              `INSERT INTO classes(institution_id,name,grade,school_year,created_by) VALUES ($1,$2,'3ª série',2026,$3) RETURNING id`,
              [institutionId, name, teacherId],
            )
          ).rows[0].id,
        );
      const students = [];
      for (const [index, name] of ['Duda Alves', 'Enzo Reis'].entries()) {
        const id = (
          await admin.query(
            `INSERT INTO students(institution_id,registration,name) VALUES ($1,$2,$3) RETURNING id`,
            [institutionId, `E${index}`, name],
          )
        ).rows[0].id;
        students.push(id);
        await admin.query(
          'INSERT INTO class_enrollments(class_id,student_id,number) VALUES ($1,$2,$3)',
          [classIds[0], id, index + 1],
        );
      }
      await admin.query(
        `INSERT INTO student_account_links(institution_id,student_id,user_id,linked_by) VALUES ($1,$2,$3,$4)`,
        [institutionId, students[0], studentUserId, teacherId],
      );
      await admin.query(
        `INSERT INTO class_join_requests(class_id,institution_id,user_id,student_id,status,source) VALUES ($1,$2,$3,$4,'approved','access_code')`,
        [classIds[0], institutionId, studentUserId, students[0]],
      );
      const teacher = {
        userId: teacherId,
        institutionId,
        role: 'teacher',
        displayName: 'Profa. Ana',
      };
      const colleague = { userId: colleagueId, institutionId, role: 'teacher' };
      const coordinator = {
        userId: coordinatorId,
        institutionId,
        role: 'coordinator',
      };
      const outsider = {
        userId: outsiderId,
        institutionId: otherInstitutionId,
        role: 'teacher',
      };
      const student = { userId: studentUserId, institutionId, role: 'student' };

      // Modelo do Enem vem do banco (dados, não código).
      const rubrics = await correction.listEssayRubrics(teacher);
      const enem = rubrics.find((item) => item.code === 'enem');
      assert.equal(enem.maxScore, 1000);
      assert.equal(enem.criteria.length, 5);
      assert.deepEqual(
        enem.criteria[0].levels.map((level) => level.score),
        [200, 160, 120, 80, 40, 0],
      );
      await assert.rejects(correction.listEssayRubrics(student), {
        statusCode: 403,
      });

      // Tema e aplicação a duas turmas, com IA e entrega digitada/foto.
      const prompt = await essays.createEssayPrompt(teacher, {
        title: 'Mobilidade urbana',
        theme: 'Desafios da mobilidade urbana no Brasil',
        productionCommand:
          'Redija um texto dissertativo-argumentativo sobre o tema.',
        minLines: 8,
        maxLines: 30,
        status: 'published',
      });
      await assert.rejects(
        essays.createEssayApplication(teacher, {
          promptId: prompt.id,
          classIds,
          appliedOn: '2026-04-01',
          submissionModes: [],
        }),
        { statusCode: 422 },
      );
      const application = await essays.createEssayApplication(teacher, {
        promptId: prompt.id,
        classIds,
        appliedOn: '2026-04-01',
        availableToStudents: true,
        aiAssist: true,
        submissionModes: ['typed', 'upload'],
      });
      assert.equal(application.createdIds.length, 2);
      assert.equal(application.rubricName, enem.name);
      assert.deepEqual(application.submissionModes, ['typed', 'upload']);
      const [entryA, entryB] = application.students.map((item) => item.id);

      // Aluno: rascunho com salvamento automático, conflito e limites.
      const list = await correction.myEssays(student);
      assert.equal(list.length, 1);
      assert.equal(list[0].canWrite, true);
      const first = await correction.saveMyEssayDraft(student, application.id, {
        text: 'Curto.',
      });
      assert.equal(first.wordCount, 1);
      await assert.rejects(correction.submitMyEssay(student, application.id), {
        statusCode: 422,
      });
      const saved = await correction.saveMyEssayDraft(student, application.id, {
        text: essayText,
        revision: first.revision,
      });
      assert.ok(saved.lineCount >= 10);
      await assert.rejects(
        correction.saveMyEssayDraft(student, application.id, {
          text: 'outra aba',
          revision: first.revision,
        }),
        { statusCode: 409 },
      );
      await assert.rejects(
        correction.saveMyEssayDraft(teacher, application.id, { text: 'x' }),
        {
          statusCode: 403,
        },
      );
      const submitted = await correction.submitMyEssay(student, application.id);
      assert.equal(submitted.status, 'awaiting_ai');
      assert.equal(submitted.canWrite, false);
      assert.equal(submitted.result, null);
      await assert.rejects(
        correction.saveMyEssayDraft(student, application.id, {
          text: 'depois do envio',
        }),
        { statusCode: 409 },
      );

      // Worker: sugestão da IA com trecho inventado (descartado) e nota fora do nível.
      const aiJob = await jobs.claimEssayJob();
      assert.equal(aiJob.kind, 'ai_grading');
      assert.equal(await jobs.claimEssayJob(), null);
      await jobs.processEssayJob(aiJob, {
        env: aiEnv,
        fetchImpl: geminiReply({
          criteria: enem.criteria.map((criterion, index) => ({
            criterionId: criterion.id,
            suggestedScore: index === 0 ? 150 : 160,
            justification: 'Justificativa EM13LP01 da competência.',
            evidence: [
              {
                quote: 'a mobilidade urbana no Brasil enfrenta desafios',
                comment: 'Tese clara.',
              },
              {
                quote: 'frase que o aluno nunca escreveu',
                comment: 'Inventado.',
              },
            ],
            problems: [],
            suggestions: ['Detalhe a proposta.'],
            feedback: `Retorno da competência ${criterion.numeral}.`,
          })),
          generalFeedback: 'Bom texto, com repertório a ampliar.',
          strengths: 'Tese clara.',
          improvements: 'Detalhar a intervenção.',
          rewriteSuggestions: '',
          transcriptionLimitations: [],
          warnings: [],
        }),
      });
      let detail = await correction.getEssayEntry(teacher, entryA);
      assert.equal(detail.status, 'awaiting_grading');
      assert.equal(detail.aiGrading.total, 800);
      assert.equal(detail.aiGrading.scores[0].score, 160);
      assert.equal(detail.aiGrading.scores[0].evidence.length, 1);
      assert.ok(!detail.aiGrading.scores[0].justification.includes('EM13LP01'));
      assert.ok(
        detail.aiGrading.warnings.some((item) => item.includes('descartado')),
      );
      assert.ok(
        detail.aiGrading.warnings.some((item) =>
          item.includes('ajustado para 160'),
        ),
      );
      const usage = await admin.query(
        `SELECT count(*)::int AS n FROM usage_events WHERE institution_id=$1 AND kind='ai'`,
        [institutionId],
      );
      assert.equal(usage.rows[0].n, 1);

      // Professor: validação no servidor, rascunho a partir da IA e finalização.
      const scores = enem.criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: 160,
        feedback: `Professor: competência ${criterion.numeral}.`,
      }));
      await assert.rejects(
        correction.saveEssayGrading(teacher, entryA, {
          scores: [{ criterionId: 'c1', score: 150 }],
        }),
        { statusCode: 422 },
      );
      await assert.rejects(
        correction.saveEssayGrading(teacher, entryA, {
          scores: [{ criterionId: 'c1', score: 240 }],
        }),
        { statusCode: 422 },
      );
      await assert.rejects(
        correction.saveEssayGrading(teacher, entryA, {
          scores: [
            {
              criterionId: 'c5',
              score: 120,
              observations: { agente: 'talvez' },
            },
          ],
        }),
        { statusCode: 422 },
      );
      await assert.rejects(correction.getEssayEntry(colleague, entryA), {
        statusCode: 404,
      });
      await assert.rejects(correction.getEssayEntry(outsider, entryA), {
        statusCode: 404,
      });
      detail = await correction.saveEssayGrading(teacher, entryA, {
        scores: [
          ...scores.slice(0, 4),
          {
            criterionId: 'c5',
            score: 120,
            observations: { agente: 'adequado', detalhamento: 'ausente' },
          },
        ],
        basedOnGradingId: detail.aiGrading.id,
        comments: 'Texto bem estruturado.',
      });
      assert.equal(detail.status, 'grading');
      assert.equal(detail.teacherGrading.total, 760);
      assert.equal(detail.teacherGrading.basedOnGradingId, detail.aiGrading.id);
      await assert.rejects(
        correction.saveEssayGrading(teacher, entryA, { scores, revision: 99 }),
        { statusCode: 409 },
      );
      await assert.rejects(
        correction.saveEssayGrading(
          teacher,
          entryA,
          { scores: scores.slice(0, 2) },
          { finalize: true },
        ),
        { statusCode: 422 },
      );
      detail = await correction.saveEssayGrading(
        coordinator,
        entryA,
        {
          scores,
          comments: 'Texto bem estruturado.',
          revision: detail.teacherGrading.revision,
        },
        { finalize: true },
      );
      assert.equal(detail.status, 'awaiting_approval');
      assert.equal(detail.teacherGrading.total, 800);
      assert.equal(
        (await correction.myEssayDetail(student, application.id)).result,
        null,
      );

      // Publicação exige confirmação; aluno vê nota, competências e comentários.
      await assert.rejects(correction.publishEssayEntry(teacher, entryA, {}), {
        name: 'ZodError',
      });
      await correction.publishEssayEntry(teacher, entryA, { confirm: true });
      let mine = await correction.myEssayDetail(student, application.id);
      assert.equal(mine.status, 'published');
      assert.equal(mine.result.total, 800);
      assert.equal(mine.result.criteria.length, 5);
      assert.equal(
        mine.result.criteria[0].feedback,
        'Professor: competência I.',
      );
      assert.equal(mine.result.aiFeedback, '');
      assert.equal((await correction.myEssays(student))[0].total, 800);

      // Reabrir despublica e guarda o histórico.
      await correction.reopenEssayGrading(teacher, entryA);
      mine = await correction.myEssayDetail(student, application.id);
      assert.equal(mine.result, null);
      detail = await correction.getEssayEntry(teacher, entryA);
      assert.ok(detail.history.some((item) => item.action === 'essay.publish'));
      assert.ok(
        detail.history.some((item) => item.action === 'essay.unpublish'),
      );
      assert.ok(
        detail.gradingHistory.some((item) => item.status === 'superseded'),
      );

      // Devolução para reescrita: aluno recebe nova tentativa e envia foto.
      await correction.returnEssayEntry(teacher, entryA, {
        reason: 'Reescreva a proposta de intervenção.',
      });
      mine = await correction.myEssayDetail(student, application.id);
      assert.equal(mine.status, 'returned');
      assert.equal(mine.canWrite, true);
      assert.equal(
        mine.attempts[0].returnReason,
        'Reescreva a proposta de intervenção.',
      );
      await assert.rejects(
        correction.addMyEssayFile(student, application.id, {
          dataUrl: `data:image/png;base64,${Buffer.from('não é png').toString('base64')}`,
        }),
        { statusCode: 422 },
      );
      const page = await correction.addMyEssayFile(student, application.id, {
        dataUrl: png,
      });
      await assert.rejects(
        correction.saveMyEssayDraft(student, application.id, { text: 'texto' }),
        {
          statusCode: 409,
        },
      );
      const file = await correction.myEssayFile(
        student,
        application.id,
        page.id,
      );
      assert.equal(file.mimeType, 'image/png');
      const resubmitted = await correction.submitMyEssay(
        student,
        application.id,
      );
      assert.equal(resubmitted.status, 'awaiting_ocr');
      assert.equal(resubmitted.submission.attempt, 2);
      // Arquivo fica no armazenamento, não no banco.
      const stored = await admin.query(
        'SELECT storage_ref FROM essay_submission_files WHERE id=$1',
        [page.id],
      );
      assert.match(
        stored.rows[0].storage_ref,
        /^filesystem:essay-submissions\//,
      );

      // OCR com baixa confiança: professor precisa revisar antes da IA.
      const ocrJob = await jobs.claimEssayJob();
      assert.equal(ocrJob.kind, 'ocr');
      await jobs.processEssayJob(ocrJob, {
        env: aiEnv,
        fetchImpl: geminiReply({
          text: 'A mobilidade [ilegível] no Brasil',
          lines: [
            {
              text: 'A mobilidade [ilegível] no Brasil',
              confidence: 0.4,
              illegible: true,
            },
          ],
          confidence: 0.5,
          warnings: ['Página inclinada.'],
        }),
      });
      detail = await correction.getEssayEntry(teacher, entryA);
      assert.equal(detail.status, 'awaiting_grading');
      assert.equal(detail.transcriptions[0].needsReview, true);
      assert.equal(await jobs.claimEssayJob(), null);
      await assert.rejects(correction.requestEssayAiGrading(teacher, entryA), {
        statusCode: 409,
      });
      detail = await correction.saveEssayTranscription(teacher, entryA, {
        text: essayText,
      });
      assert.equal(detail.transcriptions[0].source, 'teacher');
      detail = await correction.requestEssayAiGrading(teacher, entryA);
      assert.equal(detail.status, 'awaiting_ai');
      await assert.rejects(correction.requestEssayAiGrading(teacher, entryA), {
        statusCode: 409,
      });

      // Falha do provedor: nova tentativa agendada; falha definitiva libera a correção manual.
      const failing = await jobs.claimEssayJob();
      await assert.rejects(
        jobs.processEssayJob(failing, {
          env: aiEnv,
          fetchImpl: async () => ({
            ok: false,
            status: 400,
            headers: new Headers(),
            json: async () => ({}),
          }),
        }),
      );
      const failed = await admin.query(
        'SELECT status,error_message FROM essay_jobs WHERE id=$1',
        [failing.id],
      );
      assert.equal(failed.rows[0].status, 'failed');
      assert.equal(
        (await correction.getEssayEntry(teacher, entryA)).status,
        'awaiting_grading',
      );

      // Digitalização enviada pelo professor para aluno sem conta.
      await correction.addTeacherScanFile(teacher, entryB, { dataUrl: png });
      await assert.rejects(
        correction.addTeacherScanFile(colleague, entryB, { dataUrl: png }),
        {
          statusCode: 404,
        },
      );
      detail = await correction.receiveTeacherScan(teacher, entryB);
      assert.equal(detail.submission.mode, 'teacher_scan');
      assert.equal(detail.status, 'awaiting_ocr');
      await assert.rejects(
        correction.addTeacherScanFile(teacher, entryB, { dataUrl: png }),
        {
          statusCode: 409,
        },
      );

      // Fila paginada, painel e publicação em lote.
      const queue = await correction.listEssayEntries(teacher, {
        applicationId: application.id,
      });
      assert.equal(queue.total, 2);
      assert.equal((await correction.listEssayEntries(colleague, {})).total, 0);
      await correction.saveEssayGrading(
        teacher,
        entryA,
        { scores },
        { finalize: true },
      );
      const dashboard = await correction.essayDashboard(teacher, {
        schoolYear: '2026',
      });
      assert.equal(dashboard.byStatus.awaiting_approval, 1);
      assert.equal(dashboard.options.classes.length, 2);
      assert.equal(
        (
          await correction.publishEssayApplication(teacher, application.id, {
            confirm: true,
          })
        ).published,
        1,
      );
      assert.equal(
        (await correction.essayDashboard(coordinator, {})).averageTotal,
        800,
      );

      // Ano letivo encerrado: notas só para consulta.
      const year = await admin.query(
        `INSERT INTO academic_years(institution_id,year,status,closed_at) VALUES ($1,2026,'closed',now())
         ON CONFLICT (institution_id,year) DO UPDATE SET status='closed',closed_at=now() RETURNING id`,
        [institutionId],
      );
      await admin.query('UPDATE classes SET academic_year_id=$1 WHERE id=$2', [
        year.rows[0].id,
        classIds[0],
      ]);
      await assert.rejects(correction.reopenEssayGrading(teacher, entryA), {
        statusCode: 409,
      });
      assert.equal((await correction.myEssays(student))[0].canWrite, false);

      // Retenção: originais de produções publicadas há mais de N dias saem do armazenamento.
      assert.equal(await jobs.purgeExpiredEssayFiles(365), 0);
      await admin.query(
        "UPDATE essay_application_students SET published_at=now()-interval '400 days' WHERE id=$1",
        [entryA],
      );
      assert.equal(await jobs.purgeExpiredEssayFiles(365), 1);
      await assert.rejects(
        correction.myEssayFile(student, application.id, page.id),
        { statusCode: 404 },
      );
      assert.equal(
        (await correction.myEssayDetail(student, application.id)).result.total,
        800,
      );

      // Regras puras.
      assert.equal(grading.countWords('Olá,  mundo — 2026!'), 3);
      assert.equal(grading.countLines(`${'a'.repeat(170)}\n\nb`), 4);
    } finally {
      try {
        const ids = [[institutionId, otherInstitutionId]];
        await admin.query('BEGIN');
        await admin.query("SET LOCAL ufaprova.allow_history_purge='on'");
        await admin.query(
          'DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM classes WHERE institution_id=ANY($1))',
          ids,
        );
        await admin.query(
          'DELETE FROM academic_events WHERE institution_id=ANY($1)',
          ids,
        );
        await admin.query(
          'DELETE FROM student_enrollments WHERE institution_id=ANY($1)',
          ids,
        );
        await admin.query(
          'DELETE FROM essay_applications WHERE institution_id=ANY($1)',
          ids,
        );
        await admin.query(
          'DELETE FROM essay_prompts WHERE institution_id=ANY($1)',
          ids,
        );
        await admin.query(
          'DELETE FROM classes WHERE institution_id=ANY($1)',
          ids,
        );
        await admin.query(
          'DELETE FROM academic_years WHERE institution_id=ANY($1)',
          ids,
        );
        await admin.query('DELETE FROM institutions WHERE id=ANY($1)', ids);
        await admin.query('COMMIT');
      } catch (error) {
        await admin.query('ROLLBACK');
        console.error('Falha ao limpar dados do teste de correção:', error);
      }
      await admin.query('DELETE FROM users WHERE id=ANY($1)', [
        [teacherId, colleagueId, coordinatorId, studentUserId, outsiderId],
      ]);
      await admin.end();
      await pool.end();
      rmSync(storageDir, { recursive: true, force: true });
    }
  },
);
