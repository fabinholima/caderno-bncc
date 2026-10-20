import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutEmbeddedMetaPost, validMetaPost } from '../../lib/embedded-metapost.mjs';

test('permits textext labels with font and spacing commands while rejecting file and Lua access', () => {
  assert.ok(validMetaPost(String.raw`label(textext("\ss velocidade"), origin); label(textext("$0,3\,c$"), origin);`));
  for (const command of ['input', 'directlua', 'ssinput'])
    assert.equal(validMetaPost(`label(textext("\\${command}{x}"), origin);`), false);
  assert.doesNotThrow(() => withoutEmbeddedMetaPost(String.raw`\startMPcode label(textext("\ss velocidade"), origin); \stopMPcode`));
});

test('accepts embedded MetaPost with native labels and preserves surrounding text', () => {
  assert.equal(withoutEmbeddedMetaPost('Antes\\startMPcode label(btex $B$ etex, origin);\\stopMPcode Depois'), 'Antes Depois');
});
test('rejects unclosed drawings and external execution inside drawings', () => {
  for (const code of ['\\startMPcode draw origin;', '\\stopMPcode', '\\startMPcode runscript "x";\\stopMPcode', '\\startMPcode label(btex ^^5cinput x etex, origin);\\stopMPcode'])
    assert.throws(() => withoutEmbeddedMetaPost(code));
});

test('accepts Greek math in textext and btex without permitting other TeX commands', () => {
  for (const name of ['omega','alpha','theta','varphi','Omega','Delta']) {
    assert.ok(validMetaPost(`label(textext("$\\${name}$"), origin);`));
    assert.doesNotThrow(()=>withoutEmbeddedMetaPost(`\\startMPcode label(btex $\\${name}$ etex, origin); \\stopMPcode`));
  }
  for (const name of ['omegainput','omegafoo','input','ctxlua','def','csname'])
    assert.equal(validMetaPost(`label(textext("$\\${name}$"), origin);`),false);
});

test('accepts native font commands in beam load labels without accepting executable commands',()=>{
  const beam = String.raw`u:=3cm; yd:=-1.8cm;
  vardef load(expr x,s) =
    drawarrow (x,1.6cm)--(x,0) withpen pencircle scaled 1.4pt;
    label.top(textext(s),(x,1.65cm));
  enddef;
  load(0.9u,"\bf 75 kN");
  load(3.3u,"\bf 30 kN");`;
  assert.ok(validMetaPost(beam));
  assert.doesNotThrow(()=>withoutEmbeddedMetaPost(`\\startMPcode\n${beam}\n\\stopMPcode`));
  for(const command of ['bf','rm','it','sl','tt','tf','bold','italic']) assert.ok(validMetaPost(`label(textext("\\${command} Carga"),origin);`));
  for(const command of ['bfinput','boldinput','input','directlua','def','csname']) assert.equal(validMetaPost(`label(textext("\\${command} x"),origin);`),false);
});

test('accepts ConTeXt font sizes in thermal-source label concatenation',()=>{
 const code=String.raw`vardef fonte(expr x,w,t,extra) =
   if length(extra)>0:
     label(textext("Fonte"),(x,0.65cm));
     label(textext(t),(x,0.05cm));
     label(textext("\tfx " & extra),(x,-0.5cm));
   fi;
 enddef;
 fonte(9.8cm,3.4cm,"Temperatura $T_2$","(desconhecida)");`;
 assert.ok(validMetaPost(code));
 assert.doesNotThrow(()=>withoutEmbeddedMetaPost(`\\startMPcode\n${code}\n\\stopMPcode`));
 for(const command of ['tf','tfx','tfxx','tfa','tfb','tfc','tfd']) assert.ok(validMetaPost(`label(textext("\\${command} texto"),origin);`));
 for(const command of ['tfxinput','tfxxinput','tfainput','directlua','input']) assert.equal(validMetaPost(`label(textext("\\${command} x"),origin);`),false);
});

test('accepts ConTeXt unit labels inside MetaPost while keeping external input blocked', () => {
  const code = String.raw`u := 1cm;
  drawarrow (0,0)*u -- (4.2,0)*u;
  label.urt(textext("V \unit{meter per second}"), (0,2.0)*u);`;
  assert.ok(validMetaPost(code));
  assert.equal(withoutEmbeddedMetaPost(`\\startMPcode\n${code}\n\\stopMPcode`), '');
  assert.equal(validMetaPost(String.raw`label(textext("\input arquivo"), origin);`), false);
});

test('accepts escaped percentages in chart labels, including bold and negative values', () => {
  const chart = String.raw`u := 1.5cm;
  numeric cx[], h[], g[];
  cx1 := 0.90; h1 := 1.80; g1 := 0.60;
  for i=1 upto 1:
    fill unitsquare scaled u withcolor g[i]*white;
    label.bot(textext("M$_" & decimal i & "$"), (cx[i]*u,-0.1u));
  endfor;
  label(textext("20\%"), origin);
  label(textext("$-$20\%"), (u,u));
  label(textext("\bold{25\%}"), (2u,2u));`;
  assert.ok(validMetaPost(chart));
  assert.doesNotThrow(()=>withoutEmbeddedMetaPost(`\\startMPcode\n${chart}\n\\stopMPcode`));
  for (const command of ['input arquivo','directlua{os.exit()}','csname input\\endcsname'])
    assert.equal(validMetaPost(String.raw`label(textext("20\%"), origin);` + `\nlabel(textext("\\${command}"),origin);`),false);
});
