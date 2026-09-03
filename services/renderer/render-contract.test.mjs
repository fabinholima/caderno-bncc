import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAssessment } from './render-contract.mjs';

test('converte o contrato imutável para t-basicexam e escapa conteúdo', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.assessment.title = 'Prova 100% segura & versionada';
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\usemodule\[basicexam\]\[mode=student\]/);
  assert.match(tex, /layout basicexam-v1/);
  assert.match(tex, /Prova 100\\% segura \\& versionada/);
  assert.match(tex, /\\startcitem\[\*\] 30 \\stopcitem/);
  assert.match(tex, /\\stoptext/);
});

test('rejeita layout que não esteja no registro', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.render.template = '/tmp/modelo.tex';
  assert.throws(() => renderAssessment(snapshot), /não permitido/);
});

test('renderiza MetaPost e questão discursiva sem lista de alternativas', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement.push({
    type: 'metapost',
    code: 'draw fullcircle scaled 2cm;',
  });
  snapshot.questions[0].type = 'essay';
  snapshot.questions[0].alternatives = [];
  snapshot.questions[0].answer.explanation = [
    { type: 'paragraph', text: 'Resposta esperada.' },
  ];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\startMPcode\ndraw fullcircle scaled 2cm;\n\\stopMPcode/);
  assert.doesNotMatch(tex, /\\startchoice/);
  assert.match(tex, /\\blank\[4\*big\]/);
});

test('rejeita MetaPost com execução de script', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement.push({
    type: 'metapost',
    code: 'runscript "externo";',
  });
  assert.throws(() => renderAssessment(snapshot), /MetaPost inválido/);
});

test('organiza disciplinas em seções com uma ou duas colunas', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.sections = [
    {
      title: 'Matemática',
      subject: 'Matemática',
      columns: 2,
      startOnNewPage: false,
      questions: snapshot.questions,
    },
    {
      title: 'Química',
      subject: 'Química',
      columns: 1,
      startOnNewPage: true,
      questions: snapshot.questions,
    },
  ];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\subject\{Matemática\}/);
  assert.match(tex, /\\startcolumns\[n=2,balance=no\]/);
  assert.match(tex, /\\stopcolumns/);
  assert.match(tex, /\\page\n\\subject\{Química\}/);
});

test('gera gabarito limpo com a letra correta e sem marcações internas', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.render.mode = 'answer-key';
  const tex = renderAssessment(snapshot);
  assert.match(tex, /Gabarito - Avaliação bimestral/);
  assert.match(tex, /\\NC 1 \\NC Matemática \\NC B \\NC\\NR/);
  assert.match(tex, /Comentários e critérios de correção/);
  assert.doesNotMatch(tex, /showanswer=true/);
  assert.doesNotMatch(tex, /\\startcitem/);
});
