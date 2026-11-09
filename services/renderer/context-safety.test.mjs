import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  hasCaretEscape,
  unsafeContextCode,
} from '../../lib/context-safety.mjs';
import { renderAssessment } from './render-contract.mjs';
import { contextEnvironment } from './worker.mjs';

const sample = () =>
  JSON.parse(
    fs.readFileSync(
      new URL('../../samples/assessment-snapshot.json', import.meta.url),
      'utf8',
    ),
  );

test('recusa acesso a Lua, inclusive por nomes montados na compilação', () => {
  for (const code of [
    '\\directlua{os.execute("x")}',
    '\\csname directlua\\endcsname{os.execute("x")}',
    '\\begincsname directlua\\endcsname{}',
    '\\luaexpr{1+1}',
    '\\cldcontext{os.exit()}',
    '\\ctxcommand{x()}',
    '\\clf_doit',
    '\\startluacode os.exit() \\stopluacode',
    '\\catcode`|=0 |directlua{x}',
    '\\scantextokens{\\x}',
    '\\tokenized{x}',
    '^^5cdirectlua{x}',
  ])
    assert.equal(unsafeContextCode(code), true, code);
});

test('recusa leitura de arquivos, módulos e diretivas', () => {
  for (const code of [
    '\\input /etc/passwd',
    '\\typefile{/proc/self/environ}',
    '\\readfile{x}{}{}',
    '\\startbuffer[a]x\\stopbuffer\\savebuffer[a][saida]',
    '\\usemodule[x]',
    '\\xmlprocessfile{a}{b}{}',
    '\\executesystemcommand{ls}',
    '\\enabledirectives[system.x]',
    '\\startuseMPgraphic{a}runscript("x")\\stopuseMPgraphic',
    '\\externalfigure[/var/data/renders/outra.pdf]',
    '\\externalfigure[../segredo.pdf]',
    '\\externalfigure{arquivo.pdf}',
    '\\setupexternalfigures[directory=/]',
  ])
    assert.equal(unsafeContextCode(code), true, code);
});

test('aceita o ConTeXt usado nas questões', () => {
  for (const code of [
    'Texto com \\bold{ênfase}, \\emph{itálico} e \\unit{2 kilogram}.',
    '\\startformula\n\\frac{1}{2} + x^2\n\\stopformula',
    '\\startitemize[I,packed]\n\\item Primeiro\n\\stopitemize',
    '\\externalfigure[imagem1][width=4cm]',
    '\\externalfigure[question-image-2.png]',
    '\\placefigure[here][]{Legenda}{\\externalfigure[imagem2]}',
  ])
    assert.equal(unsafeContextCode(code), false, code);
  assert.equal(unsafeContextCode('\\starttext a \\stoptext'), true);
  assert.equal(
    unsafeContextCode('\\starttext a \\stoptext', { allowTextWrapper: true }),
    false,
  );
});

test('a renderização barra ^^ em fórmulas e parágrafos', () => {
  assert.equal(hasCaretEscape({ items: ['a', 'b^^5c'] }), true);
  for (const node of [
    { type: 'math', tex: '^^5cdirectlua{os.exit()}' },
    { type: 'paragraph', text: 'Valor \\m{^^5cdirectlua{os.exit()}}' },
    { type: 'contextRaw', code: '\\csname directlua\\endcsname{os.exit()}' },
  ]) {
    const snapshot = sample();
    snapshot.questions[0].statement = [node];
    assert.throws(() => renderAssessment(snapshot), /permitid/, node.type);
  }
});

test('o ConTeXt não herda os segredos do processo', () => {
  const env = contextEnvironment({
    PATH: '/usr/bin',
    HOME: '/root',
    TEXMFCACHE: '/var/data/tex-cache',
    DATABASE_URL: 'postgresql://x',
    AWS_SECRET_ACCESS_KEY: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    QR_SIGNING_SECRET: 'x',
  });
  assert.deepEqual(env, {
    PATH: '/usr/bin',
    HOME: '/root',
    TEXMFCACHE: '/var/data/tex-cache',
  });
});
