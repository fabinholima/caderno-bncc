import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import pg from 'pg';

// Banco com todas as migrações aplicadas (node migrate.mjs). A compilação do
// PDF só roda quando ESSAY_TEST_CONTEXT=1 e o ConTeXt está configurado.
const url = process.env.ESSAY_TEST_DATABASE_URL;
const compilePdf = process.env.ESSAY_TEST_CONTEXT === '1';
// PNG RGB 4×4 válido, montado com zlib.
function samplePng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.concat(
    Array.from({ length: 4 }, () => Buffer.from([0, ...Array(12).fill(120)])),
  );
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`;
}
const png = samplePng();

function pdfText(contents) {
  const directory = mkdtempSync(path.join(tmpdir(), 'essay-pdf-'));
  try {
    const file = path.join(directory, 'folha.pdf');
    writeFileSync(file, contents);
    const pages = Number(
      execFileSync('pdfinfo', [file], { encoding: 'utf8' }).match(
        /Pages:\s+(\d+)/,
      )[1],
    );
    const images =
      execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' })
        .trim()
        .split('\n').length - 2;
    return {
      pages,
      images,
      text: execFileSync('pdftotext', ['-layout', file, '-'], {
        encoding: 'utf8',
      }),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test(
  'redação: banco de temas, permissões, aplicação à turma e folhas',
  { skip: !url, timeout: 600_000 },
  async () => {
    process.env.DATABASE_URL = url;
    const { pool } = await import('./db.mjs');
    const essays = await import('./essays.mjs');
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    const institutionId = randomUUID();
    const otherInstitutionId = randomUUID();
    const [teacherId, colleagueId, coordinatorId, studentUserId, outsiderId] =
      Array.from({ length: 5 }, () => randomUUID());
    try {
      await admin.query(
        `INSERT INTO institutions(id,name,slug) VALUES ($1,'Escola Teste',$3),($2,'Outra',$4)`,
        [
          institutionId,
          otherInstitutionId,
          `t-${institutionId}`,
          `o-${otherInstitutionId}`,
        ],
      );
      for (const [id, name, type] of [
        [teacherId, 'Profa. Lúcia', 'educator'],
        [colleagueId, 'Prof. Caio', 'educator'],
        [coordinatorId, 'Coord. Rita', 'educator'],
        [studentUserId, 'Aluna Bia', 'student'],
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
      const classId = (
        await admin.query(
          `INSERT INTO classes(institution_id,name,grade,school_year) VALUES ($1,'A','3ª série',2026) RETURNING id`,
          [institutionId],
        )
      ).rows[0].id;
      const students = [];
      for (const [index, name] of [
        'Bianca Souza',
        'Davi Lima',
        'Eva Rocha',
      ].entries()) {
        const id = (
          await admin.query(
            `INSERT INTO students(institution_id,registration,name,active) VALUES ($1,$2,$3,$4) RETURNING id`,
            [institutionId, `R${index}`, name, index < 2],
          )
        ).rows[0].id;
        students.push(id);
        await admin.query(
          'INSERT INTO class_enrollments(class_id,student_id,number) VALUES ($1,$2,$3)',
          [classId, id, index + 1],
        );
      }
      await admin.query(
        `INSERT INTO student_account_links(institution_id,student_id,user_id,linked_by) VALUES ($1,$2,$3,$4)`,
        [institutionId, students[0], studentUserId, teacherId],
      );
      await admin.query(
        `INSERT INTO class_join_requests(class_id,institution_id,user_id,student_id,status,source) VALUES ($1,$2,$3,$4,'approved','access_code')`,
        [classId, institutionId, studentUserId, students[0]],
      );

      const teacher = {
        userId: teacherId,
        institutionId,
        role: 'teacher',
        displayName: 'Profa. Lúcia',
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

      // Cadastro com textos motivadores, imagem e tabela.
      const created = await essays.createEssayPrompt(teacher, {
        title: 'Mobilidade urbana',
        theme: 'Desafios da mobilidade urbana no Brasil',
        thematicAxis: 'Cidades',
        category: 'Sociedade',
        referenceInstitution: 'ENEM',
        referenceYear: 2025,
        productionCommand:
          'Redija um texto dissertativo-argumentativo sobre o tema proposto.',
        studentGuidance: 'Use caneta azul ou preta.',
        minLines: 8,
        maxLines: 30,
        keywords: ['Transporte', 'cidade'],
        status: 'draft',
        motivatingTexts: [
          {
            title: 'Texto de apoio',
            author: 'IBGE',
            url: 'https://exemplo.org/dados',
            content: [
              { type: 'paragraph', text: 'O **trânsito** cresce 5% ao ano.' },
              {
                type: 'table',
                rows: [
                  ['Ano', 'Frota'],
                  ['2024', '100'],
                ],
              },
            ],
            imageDataUrl: png,
            imageCaption: 'Mapa',
          },
          {
            title: 'Charge',
            content: [
              {
                type: 'image',
                dataUrl: png,
                caption: 'Charge',
                width: 'small',
              },
            ],
          },
        ],
      });
      assert.equal(created.revision, 1);
      assert.equal(created.motivatingTexts.length, 2);
      assert.equal(created.motivatingTexts[0].imageDataUrl, png);
      assert.equal(created.motivatingTexts[1].content[0].width, 'small');
      assert.deepEqual(created.keywords, ['transporte', 'cidade']);

      // Rascunho é privado: colega e outra instituição não veem.
      await assert.rejects(essays.getEssayPrompt(colleague, created.id), {
        statusCode: 404,
      });
      await assert.rejects(essays.getEssayPrompt(outsider, created.id), {
        statusCode: 404,
      });
      assert.equal((await essays.listEssayPrompts(colleague, {})).length, 0);
      assert.equal((await essays.listEssayPrompts(coordinator, {})).length, 1);
      await assert.rejects(essays.listEssayPrompts(student, {}), {
        statusCode: 403,
      });

      // Edição com revisão, reordenação dos textos e conflito.
      const edited = await essays.updateEssayPrompt(teacher, created.id, {
        ...created,
        status: 'published',
        motivatingTexts: [
          created.motivatingTexts[1],
          created.motivatingTexts[0],
        ],
      });
      assert.equal(edited.revision, 2);
      assert.equal(edited.motivatingTexts[0].title, 'Charge');
      await assert.rejects(
        essays.updateEssayPrompt(teacher, created.id, {
          ...created,
          revision: 1,
        }),
        { statusCode: 409 },
      );
      await assert.rejects(
        essays.updateEssayPrompt(colleague, created.id, edited),
        { statusCode: 403 },
      );
      const byCoordinator = await essays.updateEssayPrompt(
        coordinator,
        created.id,
        { ...edited, category: 'Cidadania' },
      );
      assert.equal(byCoordinator.category, 'Cidadania');

      // Biblioteca: publicado aparece para o colega; filtros e busca.
      assert.equal((await essays.listEssayPrompts(colleague, {})).length, 1);
      assert.equal(
        (await essays.listEssayPrompts(colleague, { scope: 'mine' })).length,
        0,
      );
      assert.equal(
        (await essays.listEssayPrompts(teacher, { q: 'mobilidade' })).length,
        1,
      );
      assert.equal(
        (await essays.listEssayPrompts(teacher, { keyword: 'transp' })).length,
        1,
      );
      assert.equal(
        (
          await essays.listEssayPrompts(teacher, {
            category: 'Cidadania',
            institution: 'ENEM',
            year: '2025',
          })
        ).length,
        1,
      );
      assert.equal(
        (await essays.listEssayPrompts(teacher, { year: '2024' })).length,
        0,
      );
      const filters = await essays.essayPromptFilters(colleague);
      assert.deepEqual(filters.categories, ['Cidadania']);
      assert.deepEqual(filters.years, [2025]);

      // Duplicar cria rascunho do próprio usuário com os textos.
      const copy = await essays.duplicateEssayPrompt(colleague, created.id);
      assert.equal(copy.status, 'draft');
      assert.equal(copy.owned, true);
      assert.equal(copy.title, 'Cópia de Mobilidade urbana');
      assert.equal(copy.motivatingTexts.length, 2);

      // Aplicação à turma existente: alunos ativos e cópia congelada do tema.
      await assert.rejects(
        essays.createEssayApplication(outsider, {
          promptId: created.id,
          classId,
          appliedOn: '2026-03-10',
        }),
        { statusCode: 404 },
      );
      await assert.rejects(
        essays.createEssayApplication(teacher, {
          promptId: created.id,
          classId,
          appliedOn: '2026-03-10',
          dueAt: '2026-03-01',
        }),
        /prazo/,
      );
      const application = await essays.createEssayApplication(teacher, {
        promptId: created.id,
        classId,
        appliedOn: '2026-03-10',
        dueAt: '2026-03-17',
        availableToStudents: true,
        template: 'enem-30-v1',
        includeCriteria: true,
      });
      assert.equal(application.status, 'open');
      assert.equal(application.studentsCount, 2);
      assert.deepEqual(
        application.students.map((item) => item.name),
        ['Bianca Souza', 'Davi Lima'],
      );
      assert.equal(application.className, 'A');

      // A imagem repetida (2 usos, cópia e aplicação) é guardada uma vez só;
      // textos e snapshot guardam o hash, não os bytes.
      const stored = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM essay_images WHERE institution_id=$1) AS images,
           (SELECT prompt_snapshot::text FROM essay_applications WHERE id=$2) AS snapshot,
           (SELECT string_agg(content::text, '') FROM essay_motivating_texts
             WHERE prompt_id=ANY($3::uuid[])) AS contents`,
        [institutionId, application.id, [created.id, copy.id]],
      );
      assert.equal(stored.rows[0].images, 1);
      assert.doesNotMatch(stored.rows[0].snapshot, /data:image/);
      assert.match(stored.rows[0].snapshot, /"imageSha256": "[0-9a-f]{64}"/);
      assert.doesNotMatch(stored.rows[0].contents, /data:image/);
      // O editor continua recebendo as imagens como data URL.
      const copyTexts = (await essays.getEssayPrompt(colleague, copy.id))
        .motivatingTexts;
      assert.equal(
        copyTexts.find((item) => item.title === 'Charge').content[0].dataUrl,
        png,
      );
      assert.equal(
        copyTexts.find((item) => item.title !== 'Charge').imageDataUrl,
        png,
      );

      await essays.updateEssayPrompt(teacher, created.id, {
        ...(await essays.getEssayPrompt(teacher, created.id)),
        title: 'Título revisado',
      });
      const history = await essays.listEssayApplications(teacher, { classId });
      assert.equal(history.length, 1);
      assert.equal(history[0].promptTitle, 'Mobilidade urbana');
      await assert.rejects(
        essays.updateEssayApplication(colleague, application.id, {
          status: 'closed',
        }),
        { statusCode: 403 },
      );

      // Arquivar: some da biblioteca e não pode ser aplicado.
      await essays.setEssayPromptStatus(teacher, created.id, {
        status: 'archived',
      });
      assert.equal(
        (await essays.listEssayPrompts(teacher, {})).some(
          (item) => item.id === created.id,
        ),
        false,
      );
      assert.equal(
        (await essays.listEssayPrompts(teacher, { status: 'archived' })).length,
        1,
      );
      await assert.rejects(
        essays.createEssayApplication(teacher, {
          promptId: created.id,
          classId,
          appliedOn: '2026-04-01',
        }),
        { statusCode: 409 },
      );
      await assert.rejects(
        pool.query('DELETE FROM essay_prompts WHERE id=$1', [created.id]),
        /violates foreign key/,
      );

      // Portal do aluno: só vê a proposta liberada da própria turma.
      const mine = await essays.myEssayApplications(student);
      assert.equal(mine.length, 1);
      assert.equal(mine[0].title, 'Mobilidade urbana');
      await assert.rejects(essays.myEssayApplications(teacher), {
        statusCode: 403,
      });
      await essays.updateEssayApplication(teacher, application.id, {
        availableToStudents: false,
      });
      assert.equal((await essays.myEssayApplications(student)).length, 0);
      await essays.updateEssayApplication(teacher, application.id, {
        availableToStudents: true,
      });

      if (compilePdf) {
        const sheets = pdfText(
          await essays.essayApplicationSheetsPdf(teacher, application.id),
        );
        // Proposta (1+ páginas) + 2 alunos × (folha + critérios).
        assert.ok(sheets.pages >= 5, `páginas: ${sheets.pages}`);
        for (const expected of [
          'Bianca Souza (nº 1)',
          'Davi Lima (nº 2)',
          'PRODUÇÃO DE TEXTO',
          'MAPA DOS CRITÉRIOS',
          'Profa. Lúcia',
          'Mobilidade urbana',
        ])
          assert.ok(sheets.text.includes(expected), expected);
        assert.equal(sheets.text.includes('Eva Rocha'), false);
        assert.equal(sheets.text.includes('Título revisado'), false);
        // Somente as imagens dos textos motivadores são raster.
        assert.equal(sheets.images, 2);
        const single = pdfText(
          await essays.essaySheetPdf(colleague, {
            promptId: copy.id,
            includeProposal: false,
            includeCriteria: false,
          }),
        );
        assert.equal(single.pages, 1);
        assert.equal(single.images, 0);
        for (let line = 1; line <= 30; line += 1)
          assert.match(single.text, new RegExp(`(^|\\s)${line}(\\s|$)`, 'm'));
        const studentPdf = pdfText(
          await essays.myEssayProposalPdf(student, application.id),
        );
        assert.ok(studentPdf.text.includes('Bianca Souza'));
        assert.equal(studentPdf.text.includes('Davi Lima'), false);
      }
    } finally {
      await admin.query(
        'DELETE FROM essay_applications WHERE institution_id=ANY($1)',
        [[institutionId, otherInstitutionId]],
      );
      // Histórico acadêmico (migração 111) é protegido contra exclusão;
      // a limpeza de teste libera explicitamente dentro da transação.
      const purge = admin;
      try {
        const ids = [[institutionId, otherInstitutionId]];
        await purge.query('BEGIN');
        await purge.query("SET LOCAL ufaprova.allow_history_purge='on'");
        await purge.query(
          'DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM classes WHERE institution_id=ANY($1))',
          ids,
        );
        await purge.query(
          'DELETE FROM academic_events WHERE institution_id=ANY($1)',
          ids,
        );
        await purge.query(
          'DELETE FROM student_enrollments WHERE institution_id=ANY($1)',
          ids,
        );
        await purge.query(
          'DELETE FROM classes WHERE institution_id=ANY($1)',
          ids,
        );
        await purge.query(
          'DELETE FROM academic_years WHERE institution_id=ANY($1)',
          ids,
        );
        await purge.query('DELETE FROM institutions WHERE id=ANY($1)', ids);
        await purge.query('COMMIT');
      } catch (error) {
        // Sem throw no finally: registra a falha de limpeza e segue.
        await purge.query('ROLLBACK');
        console.error('Falha ao limpar dados do teste de redação:', error);
      }
      await admin.query('DELETE FROM users WHERE id=ANY($1)', [
        [teacherId, colleagueId, coordinatorId, studentUserId, outsiderId],
      ]);
      await admin.end();
      await pool.end();
    }
  },
);
