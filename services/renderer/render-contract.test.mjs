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
  assert.match(tex, /\\setupbodyfont\[plex,11pt\]/);
});

test('renderiza cartão OMR com marcas de alinhamento e cinco círculos', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.version.qrPayload =
    'CBS1:c07a8f8f-7d5e-4b34-9cc0-2d7dc36eee95:759d74e761c57f8cf0d0';
  snapshot.version.qrFileName = 'qr.png';
  snapshot.candidate = { name: 'Aluno Demonstração', number: 1 };
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\blackrule\[width=8mm,height=8mm\]/);
  assert.match(tex, /\\NC 01 \\NC \\framed\[width=6mm,height=6mm/);
  assert.match(tex, /offset=overlay\]\{E\}/);
});

test('aplica somente família e tamanho de fonte permitidos', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.render.font = 'libertinus';
  snapshot.render.fontSize = 16;
  assert.match(
    renderAssessment(snapshot),
    /\\setupbodyfont\[libertinus,16pt\]/,
  );
  snapshot.render.font = 'times';
  assert.throws(() => renderAssessment(snapshot), /Fonte de renderização/);
  snapshot.render.font = 'plex';
  snapshot.render.fontSize = 9;
  assert.throws(() => renderAssessment(snapshot), /entre 10 e 16 pt/);
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

test('renderiza fórmulas matemáticas e equações químicas estruturadas', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement.push(
    { type: 'math', tex: '\\frac{n}{V}' },
    { type: 'chemical', formula: '2H_2 + O_2 -> 2H_2O' },
  );
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\startformula\n\\frac\{n\}\{V\}\n\\stopformula/);
  assert.match(tex, /\\chemical\{2H_2\}/);
  assert.match(tex, /\\chemical\{GIVES\}/);
});

test('renderiza conteúdo científico inline e condições de reação', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement = [
    { type: 'paragraph', text: 'Na reação' },
    {
      type: 'chemical',
      formula: 'N_2 + 3H_2 <=> 2NH_3',
      display: true,
      conditionAbove: '450 °C',
      conditionBelow: 'Fe',
    },
    { type: 'paragraph', text: 'e na concentração' },
    { type: 'math', tex: '\\frac{n}{V}', display: false },
  ];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\chemical\{EQUILIBRIUM\}\{450 °C\}\{Fe\}/);
  assert.match(tex, /e na concentração \\mathematics\{\\frac\{n\}\{V\}\}/);
});

test('renderiza estrutura orgânica por preset seguro', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement.push({
    type: 'chemicalStructure',
    preset: 'benzene',
    caption: 'Benzeno',
  });
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\chemical\[SIX,SB246,DB135\]/);
  assert.match(tex, /\\midaligned\{Benzeno\}/);
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

test('renderiza os dados e o logotipo do cabeçalho institucional', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.assessment.header = {
    institutionName: 'Escola Modelo',
    teacherName: 'Prof. Ana & Silva',
    className: '7º A',
    term: '2º bimestre',
    date: '15/09/2026',
  };
  snapshot.institution.name = snapshot.assessment.header.institutionName;
  snapshot.institution.logoFileName = 'institution-logo.png';
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\externalfigure\[institution-logo\.png\]/);
  assert.match(tex, /Professor\(a\): Prof\. Ana \\& Silva/);
  assert.match(tex, /Turma: 7º A/);
  assert.match(tex, /Período: 2º bimestre/);
  assert.match(tex, /Data: 15\/09\/2026/);
});

test('renderiza imagem materializada no enunciado com limite de página', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement.push({
    type: 'image',
    fileName: 'question-image-1.png',
    alt: 'Gráfico da questão',
    caption: 'Figura 1 — Transformação química',
  });
  const tex = renderAssessment(snapshot);
  assert.match(
    tex,
    /\\externalfigure\[question-image-1\.png\]\[maxwidth=\.88\\textwidth,maxheight=\.32\\textheight\]/,
  );
  assert.match(tex, /Figura 1 — Transformação química/);
});

test('renderiza lista romana e equação destacada como ambientes ConTeXt', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement = [
    { type: 'paragraph', text: 'Considere as afirmações:' },
    { type: 'romanList', items: ['Primeira afirmação.', 'Segunda afirmação.'] },
    {
      type: 'math',
      tex: '2\\,\\mathrm{HI}(g) \\rightarrow \\mathrm{H}_2(g) + \\mathrm{I}_2(g)',
      display: true,
    },
  ];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\startitemize\[I,packed\]/);
  assert.match(tex, /\\item Primeira afirmação\./);
  assert.match(tex, /\\stopitemize/);
  assert.match(tex, /\\startformula/);
  assert.match(tex, /2\\,\\mathrm\{HI\}/);
  assert.match(tex, /\\stopformula/);
});

test('renderiza equação termoquímica com chemical e módulo units', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement = [
    {
      type: 'thermochemicalEquation',
      equation: '2HI(g) -> H_2(g) + I_2(g)',
      temperature: '25 degrees celsius',
      enthalpy: '-51,9 kilo joule',
    },
  ];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\usemodule\[units\]/);
  assert.match(tex, /\\setupformulas\[align=flushleft\]/);
  assert.match(
    tex,
    /\\define\[1\]\\HabilidadeBNCC\{\{\\switchtobodyfont\[cursor\]#1\}\}/,
  );
  assert.match(tex, /\\setupquestion\[question\]\[option=\{Cr:num,packed,joinedup,continue\}\]/);
  assert.match(tex, /\\chemical\{\} \\chemical\{2HI\(g\)\}/);
  assert.match(tex, /\\chemical\{2HI\(g\)\} \\chemical\{GIVES\}/);
  assert.match(tex, /\\chemical\{PLUS\} \\chemical\{I_2\(g\)\}/);
  assert.match(tex, /\\Delta H\(\\unit\{25 degrees celsius\}\)/);
  assert.match(tex, /\\unit\{-51,9 kilo joule\}/);
});

test('aceita código ConTeXt seguro e normaliza abreviações do módulo units', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.questions[0].statement = [{
    type: 'contextFormula',
    code: '\\chemical{} \\chemical{NO_2(g)} \\qquad m=\\unit{18,4 g} \\quad E=\\unit{51,9 kJ} \\quad T=\\unit{25 °C}',
  }];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /\\unit\{18,4 gram\}/);
  assert.match(tex, /\\unit\{51,9 kilo joule\}/);
  assert.match(tex, /\\unit\{25 degrees celsius\}/);
});

test('renderiza chemical e unit em linha no texto corrido', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.questions[0].statement = [
    { type: 'paragraph', text: 'As energias de ligação do' },
    { type: 'contextInline', code: '\\chemical{H_2}' },
    { type: 'paragraph', text: 'e do' },
    { type: 'contextInline', code: '\\chemical{Cl_2}' },
    { type: 'paragraph', text: 'em' },
    { type: 'contextInline', code: '\\unit{kilo joule inverse mol}' },
  ];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /ligação do \\chemical\{H_2\} e do \\chemical\{Cl_2\} em \\unit\{kilo joule inverse mol\}/);
});

test('preserva chemical e unit exatamente no meio de um único parágrafo', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.questions[0].statement = [{
    type: 'paragraph',
    text: 'As energias de ligação do \\chemical{H_2}, do \\chemical{Cl_2} e do \\chemical{HCl}, em \\unit{kilo joule inverse mol}.',
  }];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /ligação do \\chemical\{H_2\}, do \\chemical\{Cl_2\} e do \\chemical\{HCl\}, em \\unit\{kilo joule inverse mol\}\./);
});

test('escapa comandos não permitidos digitados no parágrafo', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.questions[0].statement = [{ type: 'paragraph', text: 'Não executar \\input{arquivo}.' }];
  const tex = renderAssessment(snapshot);
  assert.doesNotMatch(tex, /Não executar \\input\{arquivo\}/);
  assert.match(tex, /letterbackslash/);
});

test('renderiza matemática ampla com m no meio do parágrafo', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.questions[0].statement = [{
    type: 'paragraph',
    text: 'Considere \\m{\\frac{a_1}{b^2} + \\sqrt{x} \\le \\Delta H \\rightarrow \\infty} no cálculo.',
  }];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /Considere \\m\{\\frac\{a_1\}\{b\^2\} \+ \\sqrt\{x\} \\le \\Delta H \\rightarrow \\infty\} no cálculo\./);
});

test('permite ell em fórmulas matemáticas inseridas no texto', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.questions[0].statement = [{
    type: 'paragraph',
    text: 'Considere \\m{HC\\ell} e \\m{C\\ell_2}.',
  }];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /Considere \\m\{HC\\ell\} e \\m\{C\\ell_2\}\./);
});

test('permite ell dentro de chemical sem forçar itálico matemático', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../samples/assessment-snapshot.json', import.meta.url)));
  snapshot.questions[0].statement = [{
    type: 'paragraph',
    text: 'Considere \\chemical{HC\\ell} e \\chemical{C\\ell_{2}}.',
  }];
  const tex = renderAssessment(snapshot);
  assert.match(tex, /Considere \\chemical\{HC\\ell\} e \\chemical\{C\\ell_\{2\}\}\./);
  assert.doesNotMatch(tex, /\\m\{/);
});

test('usa bold na fonte da questão e permite exibir a habilidade BNCC', async () => {
  const snapshot = JSON.parse(
    await readFile(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
    ),
  );
  snapshot.render.showBnccSkills = true;
  snapshot.questions[0].source = { institution: 'ITA', year: 1997 };
  snapshot.questions[0].skills = [{ code: 'EM13CNT101', primary: true }];
  const tex = renderAssessment(snapshot);
  assert.match(
    tex,
    /\\HabilidadeBNCC\{EM13CNT101\}\\quad \\bold\{\(ITA-1997\)\}/,
  );
  assert.doesNotMatch(tex, /Habilidade BNCC:/);
  assert.match(tex, /\\bold\{\(ITA-1997\)\}/);
});
