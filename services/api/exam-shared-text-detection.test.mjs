import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyDetectedSharedTexts,
  columnSplit,
  detectSharedTexts,
  readingTextFromBbox,
} from './exam-shared-text-detection.mjs';
import { parsePdfQuestionRegions } from './exam-imports.mjs';
import { examSharedTextGroups } from '../../lib/exam-shared-texts.mjs';

// XML de `pdftotext -bbox-layout` de um PDF gerado pelo ConTeXt a partir de
// test-fixtures/texto-base-enem.tex: questões 01–05, "Texto para as Questões
// 06 a 10" com linhas numeradas, questões 06–10 e, numa página em duas
// colunas, "Texto para os itens 12 e 13".
const xml = await readFile(
  new URL('./test-fixtures/texto-base-enem.bbox.xml', import.meta.url),
  'utf8',
);

test('detecta o texto-base do ENEM com título e linhas numeradas', () => {
  const [cronica, poema] = detectSharedTexts(readingTextFromBbox(xml));
  assert.deepEqual(cronica.sourceNumbers, [6, 7, 8, 9, 10]);
  assert.equal(
    cronica.title,
    'De próprio punho — A escrita e suas tecnologias sofrem interessantes metamorfoses',
  );
  assert.equal(cronica.lineNumbering, true);
  assert.equal(cronica.keepLineBreaks, true);
  const lines = cronica.content.split('\n');
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^Estranhei muito/);
  // Os números das linhas saem do texto (o PDF os imprime de novo).
  assert.ok(lines.every((line) => !/^\d/.test(line)));
  assert.deepEqual(poema.sourceNumbers, [12, 13]);
  assert.equal(poema.lineNumbering, false);
  assert.equal(
    poema.content,
    'Minha terra tem palmeiras, onde canta o sabiá; as aves que aqui gorjeiam não gorjeiam como lá. Nosso céu tem mais estrelas, nossas várzeas têm mais flores.',
  );
});

test('lê duas colunas pela margem real da coluna e coluna única inteira', () => {
  const pages = [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(
    (page) =>
      [
        ...page[1].matchAll(
          /<word\b[^>]*xMin="([\d.]+)"[^>]*yMin="([\d.]+)"[^>]*xMax="([\d.]+)"/g,
        ),
      ].map((match) => ({
        xMin: Number(match[1]),
        yMin: Number(match[2]),
        xMax: Number(match[3]),
      })),
  );
  assert.equal(columnSplit(pages[0]), null);
  assert.equal(columnSplit(pages[1]), null);
  // A coluna da direita começa antes do meio da folha (297,6 pt).
  assert.ok(Math.abs(columnSplit(pages[2]) - 290) < 2);
  const regions = parsePdfQuestionRegions(xml);
  const q11 = regions.find((region) => region.sourceNumber === 11);
  assert.doesNotMatch(q11.rawText, /QUESTÃO 12/);
  const q13 = regions.find((region) => region.sourceNumber === 13);
  assert.doesNotMatch(q13.rawText, /coluna da esquerda/);
});

test('tira o texto da questão anterior e liga o grupo', () => {
  const candidates = parsePdfQuestionRegions(xml).map((region) => ({
    id: `c${region.sourceNumber}`,
    sourceNumber: region.sourceNumber,
    rawText: region.rawText,
    questionType: /Certo ou/.test(region.rawText)
      ? 'true_false'
      : 'single_choice',
    status: 'review',
  }));
  const applied = applyDetectedSharedTexts(
    candidates,
    detectSharedTexts(readingTextFromBbox(xml)),
  );
  const byNumber = new Map(applied.map((item) => [item.sourceNumber, item]));
  assert.doesNotMatch(byNumber.get(5).rawText, /Texto para|Estranhei/);
  assert.match(byNumber.get(5).rawText, /E\) quinta alternativa/);
  assert.doesNotMatch(byNumber.get(11).rawText, /Texto para|Minha terra/);
  // A questão 06 caiu numa quebra de página e não foi extraída: o texto fica
  // com a 07, a primeira do intervalo que existe.
  assert.equal(byNumber.has(6), false);
  assert.equal(byNumber.get(7).sharedTextDetection, 'text');
  assert.equal(byNumber.get(12).sharedText.sourceNumbers.join(), '12,13');
  const { byCandidate } = examSharedTextGroups(applied);
  assert.deepEqual(
    ['c7', 'c8', 'c9', 'c10'].map((id) => byCandidate.get(id)?.key),
    Array(4).fill('texto-6-10'),
  );
  assert.equal(byCandidate.get('c13').key, 'texto-12-13');
  assert.equal(byCandidate.get('c5'), undefined);
});

test('texto puro vira ConTeXt seguro e respeita texto-base já vindo da IA', () => {
  const text = [
    'QUESTÃO 01',
    'Enunciado da questão um com texto suficiente.',
    'Texto para as questões 2 e 3',
    'Custo de R$ 10 & 50% de desconto_final #1 no ~mercado^.',
    'QUESTÃO 02',
    'Enunciado dois.',
  ].join('\n');
  const [detection] = detectSharedTexts(text);
  assert.equal(
    detection.content,
    'Custo de R\\$ 10 \\& 50\\% de desconto\\_final \\#1 no mercado.',
  );
  const [owner] = applyDetectedSharedTexts(
    [
      {
        id: 'q2',
        sourceNumber: 2,
        rawText: 'Enunciado dois, já com texto-base da IA.',
        sharedText: { content: 'IA', sourceNumbers: [2] },
      },
    ],
    [detection],
  );
  assert.equal(owner.sharedText.content, 'IA');
  // Sem a primeira questão do intervalo depois do texto, nada é detectado.
  assert.deepEqual(
    detectSharedTexts('Texto para as questões 7 a 9\nTexto solto.'),
    [],
  );
});

test('não corta questão que só cita linhas do texto', () => {
  const detection = {
    heading: 'Texto para as questões 6 a 10',
    sourceNumbers: [6, 7, 8, 9, 10],
    title: '',
    content: 'x',
    keepLineBreaks: false,
    lineNumbering: false,
  };
  const [own, ocr] = applyDetectedSharedTexts(
    [
      {
        id: 'a',
        sourceNumber: 3,
        rawText:
          'QUESTÃO 03 Leia o texto e explique o trecho das linhas 6 a 10 do poema.',
      },
      {
        id: 'b',
        sourceNumber: 5,
        rawText:
          'QUESTÃO 05 Enunciado da questão cinco.\nE) quinta alternativa\nTEXTO PARA AS QUESTOES 06 A 10\nEstranhei muito',
      },
    ],
    [detection],
  );
  assert.match(own.rawText, /linhas 6 a 10 do poema/);
  // OCR: maiúsculas, sem acento e com zero à esquerda.
  assert.equal(
    ocr.rawText,
    'QUESTÃO 05 Enunciado da questão cinco.\nE) quinta alternativa',
  );
});
