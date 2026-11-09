import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageEssay, essayPromptSchema, imageBytes } from './essays.mjs';
import {
  ENEM_CRITERIA,
  ROWS_PER_CONTINUATION_PAGE,
  contextText,
  inlineMarkup,
  renderEssayDocument,
} from '../renderer/essay-sheet.mjs';

const png = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64')}`;
const basePrompt = {
  title: 'Desafios da mobilidade urbana',
  theme: 'Desafios da mobilidade urbana no Brasil',
  productionCommand: 'Redija um texto dissertativo-argumentativo sobre o tema.',
  minLines: 7,
  maxLines: 30,
};

test('tema: aplica padrões e valida linhas, URL, imagem e publicação', () => {
  const value = essayPromptSchema.parse({
    ...basePrompt,
    keywords: ['Cidade', 'cidade', 'Transporte'],
  });
  assert.equal(value.status, 'draft');
  assert.equal(value.essayType, 'dissertativo-argumentativo');
  assert.deepEqual(value.keywords, ['cidade', 'transporte']);
  assert.throws(
    () => essayPromptSchema.parse({ ...basePrompt, minLines: 31 }),
    /mínima de linhas/,
  );
  assert.throws(
    () =>
      essayPromptSchema.parse({
        ...basePrompt,
        motivatingTexts: [{ title: 'T', url: 'javascript:alert(1)' }],
      }),
    /http/,
  );
  assert.throws(
    () =>
      essayPromptSchema.parse({
        ...basePrompt,
        motivatingTexts: [
          { title: 'T', imageDataUrl: 'data:image/gif;base64,R0lGOD' },
        ],
      }),
    /PNG ou JPEG/,
  );
  assert.throws(
    () =>
      essayPromptSchema.parse({
        ...basePrompt,
        productionCommand: '',
        status: 'published',
      }),
    /comando de produção/,
  );
  assert.throws(
    () => essayPromptSchema.parse({ ...basePrompt, motivatingTexts: [{}] }),
    /título, conteúdo ou imagem/,
  );
});

test('imagens: aceita somente PNG/JPEG com assinatura correspondente', () => {
  assert.ok(imageBytes(png) > 0);
  const fakePng = `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`;
  assert.equal(imageBytes(fakePng), 0);
  assert.equal(imageBytes('data:image/svg+xml;base64,PHN2Zz4='), 0);
});

test('permissões: autor e gestores administram; alunos e outros professores não', () => {
  const teacher = { userId: 'a', role: 'teacher' };
  assert.equal(canManageEssay(teacher, 'a'), true);
  assert.equal(canManageEssay(teacher, 'b'), false);
  assert.equal(canManageEssay({ userId: 'c', role: 'coordinator' }, 'a'), true);
  assert.equal(canManageEssay({ userId: 'c', role: 'admin' }, 'a'), true);
  assert.equal(canManageEssay({ userId: 'a', role: 'student' }, 'a'), false);
  assert.equal(canManageEssay(null, 'a'), false);
});

test('ConTeXt: escapa caracteres especiais e converte negrito/itálico', () => {
  assert.equal(
    contextText('50% & #1 $ {x} _ ~ ^ | "a"'),
    '50\\% \\& \\#1 \\$ \\{x\\} \\_ \\lettertilde  \\letterhat  \\letterbar  \\letterdoublequote a\\letterdoublequote ',
  );
  assert.equal(
    inlineMarkup('um **forte** e *leve*'),
    'um {\\bf forte} e {\\it leve}',
  );
  assert.equal(
    contextText('\\input{/etc/passwd}'),
    '\\letterbackslash input\\{/etc/passwd\\}',
  );
});

test('folha: 30 linhas numeradas, cabeçalho, critérios sem alteração e páginas numeradas', () => {
  const tex = renderEssayDocument({
    prompt: basePrompt,
    includeCriteria: true,
    teacherName: 'Profa. Ana',
    date: '2026-03-09',
  });
  for (const label of [
    'Estudante:',
    'Professor(a):',
    'Série/Turma:',
    'Data:',
    'PRODUÇÃO DE TEXTO',
    'INFORMAÇÕES',
  ])
    assert.ok(tex.includes(label), label);
  const numbers = [
    ...tex.matchAll(/rawtextext\("\{\\bf (\d+)\}"\); draw p shifted \(39\.74/g),
  ].map((match) => Number(match[1]));
  assert.deepEqual(
    numbers,
    Array.from({ length: 30 }, (_, index) => index + 1),
  );
  assert.ok(tex.includes('{\\tf Profa. Ana}'));
  assert.ok(
    tex.includes('{\\tf 09}') &&
      tex.includes('{\\tf 03}') &&
      tex.includes('{\\tf 2026}'),
  );
  assert.ok(
    tex.includes(
      'MAPA DOS CRITÉRIOS UTILIZADOS NA CORREÇÃO DE REDAÇÃO - MODELO ENEM',
    ),
  );
  for (const criterion of ENEM_CRITERIA)
    for (const level of criterion.levels)
      assert.ok(tex.includes(contextText(level)), level);
  assert.equal(ENEM_CRITERIA.length, 5);
  assert.match(
    tex,
    /rawtextext\("\{\\bf 2\}"\); draw p shifted \(566\.2000 - 1 \*/,
  );
  assert.equal((tex.match(/\\startmakeup\[essayfixedpage\]/g) || []).length, 2);
  assert.ok(!tex.includes('PROPOSTA DE REDAÇÃO'));
});

test('folha: sem critérios quando o professor não os inclui', () => {
  const tex = renderEssayDocument({
    prompt: basePrompt,
    includeCriteria: false,
  });
  assert.ok(!tex.includes('MAPA DOS CRITÉRIOS'));
  assert.equal((tex.match(/\\startmakeup\[essayfixedpage\]/g) || []).length, 1);
});

test('proposta: textos motivadores, imagem, tabela e páginas de continuação', () => {
  const lines = 30 + ROWS_PER_CONTINUATION_PAGE + 5;
  const prompt = {
    ...basePrompt,
    maxLines: lines,
    studentGuidance: '- Use caneta.\n2) Não copie os textos.',
    motivatingTexts: [
      {
        title: 'Dados',
        author: 'IBGE',
        url: 'https://exemplo.org/a_b?c=1&d=2',
        content: [
          { type: 'heading', text: 'Panorama' },
          {
            type: 'table',
            header: true,
            rows: [
              ['Ano', 'Total'],
              ['2024', '10%'],
            ],
          },
          {
            type: 'image',
            file: 'texto-1-imagem-3.png',
            caption: 'Figura 1',
            width: 'medium',
          },
        ],
        imageFile: 'texto-1.jpg',
      },
      { title: 'Segundo', content: [{ type: 'quote', text: 'Citação' }] },
    ],
  };
  const tex = renderEssayDocument({
    prompt,
    template: 'linhas-do-tema-v1',
    includeProposal: true,
    includeCriteria: true,
    duplex: true,
    copies: [{ studentName: 'Aluna Um' }, { studentName: 'Aluno Dois' }],
  });
  assert.ok(tex.includes('TEXTO I') && tex.includes('TEXTO II'));
  assert.ok(
    tex.includes(
      '\\externalfigure[texto-1-imagem-3.png][width=0.55\\textwidth',
    ),
  );
  assert.ok(tex.includes('\\externalfigure[texto-1.jpg]'));
  assert.ok(tex.includes('\\bTABLEhead'));
  assert.ok(
    tex.includes('\\item Use caneta.') &&
      tex.includes('\\item Não copie os textos.'),
  );
  assert.ok(tex.includes(`no mínimo, 7 e, no máximo, ${lines} linhas`));
  assert.ok(tex.includes('\\page[odd]'));
  // Cada aluno: folha (30 linhas), 2 páginas de continuação e critérios.
  assert.equal(
    (tex.match(/\\startmakeup\[essayfixedpage\]/g) || []).length,
    2 * 4,
  );
  assert.equal(
    (tex.match(/PRODUÇÃO DE TEXTO \(CONTINUAÇÃO\)/g) || []).length,
    4,
  );
  assert.ok(tex.includes('Aluna Um') && tex.includes('Aluno Dois'));
  assert.ok(tex.includes(`{\\bf ${lines}}`));
});
