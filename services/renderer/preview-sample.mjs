#!/usr/bin/env node
// Gera o .tex de uma prova de exemplo (Certo/Errado em duas colunas) para
// conferir o layout no ConTeXt local, sem banco nem API:
//
//   node services/renderer/preview-sample.mjs saida.tex [modelo]
//   context saida.tex
//
// modelo: certo-errado-v1 (padrão), basicexam-v1, caderno-duas-colunas-v1...
import { readFile, writeFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';

const [output = 'amostra-prova.tex', template = 'certo-errado-v1'] = process.argv.slice(2);
const base = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url), 'utf8'));

const items = [
  'Comparando-se massas iguais de combustível, a fusão nuclear libera menos energia que a fissão nuclear e gera grande quantidade de rejeitos radioativos de longa duração.',
  'A fusão nuclear ocorre naturalmente no interior das estrelas, onde núcleos leves se unem e liberam grande quantidade de energia.',
  'A meia-vida de um isótopo radioativo é o tempo necessário para que metade dos núcleos de uma amostra sofra decaimento.',
  'A emissão de uma partícula alfa diminui o número atômico do elemento em duas unidades e o número de massa em quatro unidades.',
  'As radiações gama são ondas eletromagnéticas de alta energia e, por isso, têm maior poder de penetração que as partículas alfa e beta.',
  'Em reatores nucleares de usinas, a reação em cadeia é mantida sem nenhum controle, pois o aumento descontrolado da energia é o objetivo do processo.',
  'O carbono-14 é utilizado na datação de materiais de origem orgânica, como ossos e madeira, com idade de até cerca de 50 mil anos.',
  'Na medicina nuclear, radioisótopos são empregados tanto em diagnósticos por imagem quanto no tratamento de alguns tipos de câncer.',
];

const questions = items.map((text, index) => ({
  ...base.questions[0],
  id: `amostra-${index + 1}`,
  number: index + 1,
  type: 'true_false',
  source: { institution: 'UFAProva', year: 2026 },
  statement: [{ type: 'paragraph', text }],
  alternatives: [
    { stableKey: 'alt-a', label: 'A', content: [{ type: 'paragraph', text: 'Certo' }] },
    { stableKey: 'alt-b', label: 'B', content: [{ type: 'paragraph', text: 'Errado' }] },
  ],
  answer: { correctStableKeys: [index % 3 ? 'alt-a' : 'alt-b'], explanation: [] },
  skills: [],
}));

const snapshot = {
  ...base,
  assessment: {
    ...base.assessment,
    title: 'Radioatividade',
    subject: 'Química',
    grade: 'Ensino Médio',
    header: { teacherName: 'Fabio de Lima', className: '2 Ano A', term: '4º Bimestre', date: '' },
  },
  institution: { id: 'amostra', name: 'EE Profª Clarinda Mendes de Aquino — Campo Grande/MS' },
  questions,
  sections: [{ title: 'Química', subject: 'Química', columns: 2, startOnNewPage: false, questions }],
  totals: { points: questions.length, questions: questions.length },
  render: { ...base.render, template, mode: 'student' },
};

await writeFile(output, renderAssessment(snapshot), 'utf8');
console.log(`Gerado ${output} (modelo ${template}). Compile com: context ${output}`);
