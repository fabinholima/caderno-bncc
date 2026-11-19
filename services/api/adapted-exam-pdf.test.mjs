import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { montarPdfsAdaptados } from './adapted-exam-pdf.mjs';
import {
  montarSnapshotAdaptado,
  questoesParaReescrita,
  validarQuestoesReescritas,
} from '../../lib/prova-adaptada.mjs';

const executar = promisify(execFile);

// PNG 1x1 vermelho: basta para o PDF embutir uma imagem real.
const PNG_VERMELHO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const alternativas = () =>
  ['alt-a', 'alt-b', 'alt-c', 'alt-d', 'alt-e'].map((stableKey, i) => ({
    stableKey,
    label: 'ABCDE'[i],
    content: [
      { type: 'paragraph', text: ['um', 'dois', 'três', 'quatro', 'cinco'][i] },
    ],
  }));

function questaoBase(number, extra = {}) {
  return {
    id: `q${number}`,
    number,
    type: 'single_choice',
    difficulty: 'easy',
    source: { institution: 'ENEM', year: 2023 },
    statement: [{ type: 'paragraph', text: `Enunciado ${number}.` }],
    alternatives: alternativas(),
    answer: { correctStableKeys: ['alt-c'] },
    points: 1,
    skills: [],
    ...extra,
  };
}

function baseSnapshot(questions) {
  return {
    schemaVersion: '1.0',
    assessment: {
      id: 'a1',
      title: 'Prova bimestral',
      subject: 'Matemática',
      grade: '7º ano',
      instructions: ['Leia com atenção.'],
    },
    institution: { id: 'i1', name: 'Escola Teste' },
    version: {
      id: 'v1',
      code: 'A',
      seed: 1,
      generatedAt: '2026-01-01T00:00:00Z',
    },
    candidateFields: ['name'],
    questions,
    totals: { points: questions.length, questions: questions.length },
    render: {
      locale: 'pt-BR',
      paper: 'A4',
      mode: 'student',
      template: 'basicexam-v1',
      font: 'plex',
      fontSize: 11,
    },
  };
}

// Monta o snapshot adaptado pelo mesmo caminho da IA (validação + montagem).
function adaptada(questions, respostas) {
  const base = baseSnapshot(questions);
  const originais = questoesParaReescrita(base);
  const { validas } = validarQuestoesReescritas(
    { questions: respostas },
    originais,
  );
  return montarSnapshotAdaptado(base, validas, originais);
}

async function comPdfs(snapshot, teste) {
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'pdf-adaptada-'));
  try {
    const { studentPdf, answerKeyPdf } = await montarPdfsAdaptados(snapshot);
    const prova = path.join(pasta, 'prova.pdf');
    const gabarito = path.join(pasta, 'gabarito.pdf');
    await writeFile(prova, studentPdf);
    await writeFile(gabarito, answerKeyPdf);
    await teste({ prova, gabarito, pasta });
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

const texto = async (arquivo) => {
  const { stdout } = await executar('pdftotext', ['-layout', arquivo, '-']);
  return stdout.replace(/\s+/g, ' ');
};

const paginas = async (arquivo) => {
  const { stdout } = await executar('pdfinfo', [arquivo]);
  return Number(stdout.match(/^Pages:\s+(\d+)/m)[1]);
};

test('prova do aluno traz enunciado e alternativas em caixa alta, sem texto original', async () => {
  const snapshot = adaptada(
    [
      questaoBase(1, {
        statement: [{ type: 'paragraph', text: 'Quanto é dois mais dois?' }],
      }),
    ],
    [
      {
        sourceNumber: 1,
        statement: 'Quanto é dois mais dois?',
        alternatives: ['três', 'quatro', 'cinco'],
        correctIndex: 1,
      },
    ],
  );
  await comPdfs(snapshot, async ({ prova }) => {
    const conteudo = await texto(prova);
    assert.match(conteudo, /QUANTO É DOIS MAIS DOIS\?/);
    assert.match(conteudo, /A\) TRÊS/);
    assert.match(conteudo, /B\) QUATRO/);
    assert.match(conteudo, /C\) CINCO/);
    assert.doesNotMatch(
      conteudo,
      /três|quatro|cinco/,
      'não deve sobrar texto em minúsculas',
    );
    assert.doesNotMatch(
      conteudo,
      /\bD\)|\bE\)/,
      'só existem três alternativas',
    );
    assert.match(conteudo, /MARQUE APENAS UMA ALTERNATIVA POR QUESTÃO\./);
    assert.match(conteudo, /Escola Teste/);
    assert.match(
      conteudo,
      /1 ponto(?!s)/,
      'singular para uma prova de um ponto',
    );
    assert.equal(await paginas(prova), 1);
  });
});

test('gabarito indica a letra correta de cada questão', async () => {
  const snapshot = adaptada(
    [questaoBase(1), questaoBase(2)],
    [
      {
        sourceNumber: 1,
        statement: 'Primeira',
        alternatives: ['a', 'b', 'c'],
        correctIndex: 2,
      },
      {
        sourceNumber: 2,
        statement: 'Segunda',
        alternatives: ['d', 'e', 'f'],
        correctIndex: 0,
      },
    ],
  );
  await comPdfs(snapshot, async ({ gabarito }) => {
    const conteudo = await texto(gabarito);
    assert.match(conteudo, /GABARITO — PROVA ADAPTADA/);
    assert.match(conteudo, /Questão 1: C/);
    assert.match(conteudo, /Questão 2: A/);
  });
});

test('imagem da questão original é incorporada ao PDF do aluno', async () => {
  const snapshot = adaptada(
    [
      questaoBase(1, {
        statement: [
          { type: 'paragraph', text: 'Observe a figura.' },
          {
            type: 'image',
            dataUrl: PNG_VERMELHO,
            fileName: 'figura.png',
            alt: 'figura',
          },
        ],
      }),
    ],
    [
      {
        sourceNumber: 1,
        statement: 'Observe a figura.',
        alternatives: ['a', 'b', 'c'],
        correctIndex: 0,
      },
    ],
  );
  await comPdfs(snapshot, async ({ prova }) => {
    const { stdout } = await executar('pdfimages', ['-list', prova]);
    const linhas = stdout
      .split('\n')
      .filter((linha) => /^\s*\d+\s+\d+\s+image/.test(linha));
    assert.equal(linhas.length, 1, 'uma imagem embutida na prova');
  });
});

test('prova longa quebra em várias páginas sem perder a última questão', async () => {
  const perguntas = Array.from({ length: 40 }, (_, i) =>
    questaoBase(i + 1, {
      statement: [
        {
          type: 'paragraph',
          text: `Enunciado número ${i + 1} com um pouco mais de texto para ocupar linhas da página.`,
        },
      ],
    }),
  );
  const respostas = perguntas.map((q) => ({
    sourceNumber: q.number,
    statement: `Enunciado número ${q.number} com um pouco mais de texto para ocupar linhas da página.`,
    alternatives: ['x', 'y', 'z'],
    correctIndex: 0,
  }));
  const snapshot = adaptada(perguntas, respostas);
  await comPdfs(snapshot, async ({ prova }) => {
    assert.ok((await paginas(prova)) > 1, 'a prova ocupa mais de uma página');
    assert.match(await texto(prova), /ENUNCIADO NÚMERO 40 /);
  });
});

test('caracteres fora da fonte padrão viram "?" em vez de quebrar o PDF', async () => {
  const snapshot = adaptada(
    [
      questaoBase(1, {
        statement: [{ type: 'paragraph', text: 'Escolha a seta → correta.' }],
      }),
    ],
    [
      {
        sourceNumber: 1,
        statement: 'Escolha a seta → correta.',
        alternatives: ['←', 'b', 'c'],
        correctIndex: 1,
      },
    ],
  );
  await comPdfs(snapshot, async ({ prova }) => {
    const conteudo = await texto(prova);
    assert.match(conteudo, /ESCOLHA A SETA \? CORRETA\./);
    assert.match(conteudo, /A\) \?/);
  });
});
