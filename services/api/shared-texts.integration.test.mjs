import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Banco com todas as migrações aplicadas (node migrate.mjs), inclusive a 115.
const url = process.env.SHARED_TEXT_TEST_DATABASE_URL;

test(
  'texto-base: cadastro, vínculo de itens C/E e prova com o grupo unido',
  { skip: !url },
  async () => {
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    const admin = new pg.Pool({ connectionString: url });
    const { pool } = await import('./db.mjs');
    const {
      createSharedText,
      updateSharedText,
      getSharedText,
      listSharedTexts,
    } = await import('./shared-texts.mjs');
    const { createQuestion, getQuestion, listQuestions } =
      await import('./questions.mjs');
    const { createAssessment } = await import('./assessments.mjs');
    const tag = randomUUID().slice(0, 8);
    try {
      const {
        rows: [institution],
      } = await admin.query(
        `INSERT INTO institutions(name,slug) VALUES('Escola Texto',$1) RETURNING id`,
        [`texto-${tag}`],
      );
      const {
        rows: [other],
      } = await admin.query(
        `INSERT INTO institutions(name,slug) VALUES('Outra',$1) RETURNING id`,
        [`outra-${tag}`],
      );
      const {
        rows: [user],
      } = await admin.query(
        `INSERT INTO users(email,display_name) VALUES($1,'Editor') RETURNING id`,
        [`editor-${tag}@teste.local`],
      );
      const institutionId = institution.id;
      const userId = user.id;
      const text = await createSharedText({
        institutionId,
        userId,
        input: {
          title: 'De próprio punho',
          source: 'ENEM 2025',
          content: [
            { type: 'paragraph', text: 'Estranhei muito na primeira vez.' },
          ],
        },
      });
      assert.equal(text.questionCount, 0);
      const item = (statement, sharedTextId, correct = 'alt-a') => ({
        type: 'true_false',
        statement,
        statementBlocks: [{ type: 'paragraph', text: statement }],
        subject: 'Língua Portuguesa',
        grade: '3ª série',
        sourceInstitution: 'ENEM',
        sourceYear: 2025,
        difficulty: 'Média',
        sharedTextId,
        alternatives: ['Certo', 'Errado'].map((content, index) => ({
          stableKey: index ? 'alt-b' : 'alt-a',
          content,
          contentBlocks: [{ type: 'paragraph', text: content }],
          isCorrect: (index ? 'alt-b' : 'alt-a') === correct,
          position: index + 1,
        })),
      });
      const first = await createQuestion({
        institutionId,
        userId,
        input: item('O texto pertence ao gênero crônica.', text.id),
      });
      const second = await createQuestion({
        institutionId,
        userId,
        input: item('A autora rejeita a escrita digital.', text.id, 'alt-b'),
      });
      const loose = await createQuestion({
        institutionId,
        userId,
        input: item('Item sem texto-base comum na prova.', ''),
      });
      // A mesma afirmação em outro texto-base não é duplicata.
      const otherText = await createSharedText({
        institutionId,
        userId,
        input: { content: [{ type: 'paragraph', text: 'Outro texto.' }] },
      });
      await createQuestion({
        institutionId,
        userId,
        input: item('O texto pertence ao gênero crônica.', otherText.id),
      });
      await assert.rejects(
        createQuestion({
          institutionId,
          userId,
          input: item('O texto pertence ao gênero crônica.', text.id),
        }),
        { statusCode: 409 },
      );
      // Texto-base de outra instituição é recusado.
      const foreign = await createSharedText({
        institutionId: other.id,
        userId,
        input: { content: [{ type: 'paragraph', text: 'Alheio.' }] },
      });
      await assert.rejects(
        createQuestion({
          institutionId,
          userId,
          input: item('Item com texto-base de outra escola.', foreign.id),
        }),
        { statusCode: 422 },
      );

      const loaded = await getQuestion({ institutionId, questionId: first.id });
      assert.equal(loaded.sharedTextId, text.id);
      const listed = await listQuestions({ institutionId });
      assert.equal(
        listed.find((question) => question.id === first.id).sharedTextTitle,
        'De próprio punho',
      );
      assert.equal(
        listed.find((question) => question.id === loose.id).sharedTextId,
        null,
      );
      const detail = await getSharedText({ institutionId, id: text.id });
      assert.equal(detail.questionCount, 2);
      assert.deepEqual(
        new Set(detail.questions.map((question) => question.id)),
        new Set([first.id, second.id]),
      );
      assert.equal(
        await getSharedText({ institutionId: other.id, id: text.id }),
        null,
      );
      assert.equal(
        (await listSharedTexts({ institutionId, query: 'punho' })).length,
        1,
      );
      const updated = await updateSharedText({
        institutionId,
        userId,
        id: text.id,
        input: { ...detail, title: 'De próprio punho (adaptado)' },
      });
      assert.equal(updated.title, 'De próprio punho (adaptado)');
      await assert.rejects(
        updateSharedText({
          institutionId: other.id,
          userId,
          id: text.id,
          input: detail,
        }),
        { statusCode: 404 },
      );

      await admin.query(
        "UPDATE questions SET status='approved' WHERE id = ANY($1::uuid[])",
        [[first.id, second.id, loose.id]],
      );
      const base = {
        title: 'Prova de itens',
        grade: '3ª série',
        template: 'certo-errado-v1',
        versionCount: 3,
        shuffleQuestions: true,
      };
      const section = (questionIds) => ({
        subject: 'Língua Portuguesa',
        questionIds,
      });
      await assert.rejects(
        createAssessment({
          institutionId,
          userId,
          portalAdmin: true,
          input: {
            ...base,
            sections: [section([first.id, loose.id, second.id])],
          },
        }),
        /precisam ficar juntas/,
      );
      const assessment = await createAssessment({
        institutionId,
        userId,
        portalAdmin: true,
        input: {
          ...base,
          sections: [section([loose.id, first.id, second.id])],
        },
      });
      const versions = await admin.query(
        'SELECT snapshot FROM assessment_versions WHERE assessment_id = $1',
        [assessment.id],
      );
      assert.equal(versions.rowCount, 3);
      for (const { snapshot } of versions.rows) {
        assert.equal(snapshot.sharedTexts.length, 1);
        assert.equal(
          snapshot.sharedTexts[0].title,
          'De próprio punho (adaptado)',
        );
        const order = snapshot.questions.map(
          (question) => question.sourceQuestionId,
        );
        const firstIndex = order.indexOf(first.id);
        assert.equal(order.indexOf(second.id), firstIndex + 1);
        assert.equal(snapshot.questions[firstIndex].sharedTextId, text.id);
        assert.equal(
          snapshot.questions[order.indexOf(loose.id)].sharedTextId,
          undefined,
        );
      }
    } finally {
      await pool.end();
      await admin.end();
    }
  },
);
