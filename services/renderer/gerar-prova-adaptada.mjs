#!/usr/bin/env node
// Gerador de prova adaptada para estudantes com laudo.
//
//   node services/renderer/gerar-prova-adaptada.mjs prova.json pasta-de-saida \
//     [--seed 42] [--dificuldades easy,medium] [--alternativas 3] [--max-caracteres 400]
//
// "prova.json" é um snapshot de avaliação no formato de samples/assessment-snapshot.json.
// Na pasta de saída são gravados:
//   prova-adaptada.json  snapshot adaptado (questões simples, 3 alternativas, caixa alta)
//   relatorio.json       o que foi mantido, excluído e por quê
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptarProva } from '../../lib/prova-adaptada.mjs';

const [entrada, saida, ...argumentos] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error(
    'Uso: node services/renderer/gerar-prova-adaptada.mjs prova.json pasta-de-saida [--seed N] [--dificuldades easy,medium] [--alternativas 3] [--max-caracteres 400]',
  );
  process.exit(1);
}

function lerOpcoes(lista) {
  const opcoes = {};
  for (let i = 0; i < lista.length; i += 2) {
    const chave = lista[i];
    const valor = lista[i + 1];
    if (valor === undefined) throw new Error(`Falta o valor de ${chave}.`);
    if (chave === '--seed') opcoes.seed = Number(valor);
    else if (chave === '--dificuldades')
      opcoes.dificuldades = valor
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    else if (chave === '--alternativas') opcoes.alternativas = Number(valor);
    else if (chave === '--max-caracteres')
      opcoes.caracteresMaximos = Number(valor);
    else throw new Error(`Opção desconhecida: ${chave}`);
  }
  return opcoes;
}

const opcoes = lerOpcoes(argumentos);
const original = JSON.parse(await readFile(entrada, 'utf8'));
const { snapshot: adaptada, relatorio } = adaptarProva(original, opcoes);

if (!adaptada.questions.length)
  throw new Error(
    'Nenhuma questão atende ao perfil simples. Revise o relatório (use --dificuldades e --max-caracteres) e tente de novo.',
  );

await mkdir(saida, { recursive: true });
await writeFile(
  path.join(saida, 'prova-adaptada.json'),
  `${JSON.stringify(adaptada, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(saida, 'relatorio.json'),
  `${JSON.stringify(relatorio, null, 2)}\n`,
  'utf8',
);

console.log(`Prova adaptada gerada em ${path.resolve(saida)}`);
console.log(
  `Questões: ${relatorio.questoesMantidas} de ${relatorio.questoesOriginais} mantidas.`,
);
console.log(`Alternativas removidas: ${relatorio.alternativasRemovidas}.`);
console.log(
  `Parâmetros: dificuldades ${relatorio.opcoes.dificuldades.join(', ')}, ${relatorio.opcoes.alternativas} alternativas, seed ${relatorio.opcoes.seed}.`,
);
for (const item of relatorio.removidas) {
  console.log(`  Questão ${item.numero} excluída: ${item.motivo}.`);
}
