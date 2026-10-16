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
