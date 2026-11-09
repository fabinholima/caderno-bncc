// Barreira única para o ConTeXt enviado por usuários (questões, prévias,
// importação com IA). O ConTeXt executa Lua com acesso ao sistema, então tudo o
// que leva a Lua, a arquivos ou ao shell é recusado, e também o que monta nomes
// de comando durante a compilação (\csname, \catcode, ^^5c, releitura de
// tokens): sem isso, \csname directlua\endcsname contornaria a lista.
const forbiddenCommand = new RegExp(
  `\\\\(?:${[
    // Lua: \directlua, \latelua, \luaexpr, \startluacode, \ctxlua, \cldcontext...
    '[a-z@_]*lua[a-z@_]*',
    'ctx[a-z@_]*',
    'cld[a-z@_]*',
    'clf_[a-z@_]*',
    // Nomes de comando montados durante a compilação.
    '[a-z@_]*csname',
    'lastnamedcs',
    '[a-z@_]*catcode[a-z@_]*',
    '[a-z@_]*charcat[a-z@_]*',
    '[a-z@_]*scan[a-z@_]*tokens',
    '(?:re)?tokenized',
    // Arquivos, buffers gravados e módulos externos.
    'input[a-z@_]*',
    'endinput',
    'include[a-z@_]*',
    'read[a-z@_]*',
    'write[a-z@_]*',
    'open[a-z@_]*',
    'close[a-z@_]*',
    'immediate',
    '[a-z@_]*file[a-z@_]*',
    '[a-z@_]*buffer[a-z@_]*',
    'use[a-z@_]*module[a-z@_]*',
    'environment',
    'component',
    'product',
    'project',
    'xml[a-z@_]*',
    'setupexternalfigures?',
    // Sistema e diretivas que alteram o comportamento do motor.
    '[a-z@_]*system[a-z@_]*',
    '[a-z@_]*directives?',
    'enable[a-z@_]*',
    'disable[a-z@_]*',
    '[a-z@_]*metafun[a-z@_]*',
    '[a-z@_]*metapost[a-z@_]*',
  ].join('|')})(?![a-z@_])`,
  'i',
);

// Ambientes MetaPost fora de \startMPcode escapariam da validação do desenho
// (runscript executa Lua). Maiúsculas importam: \emph não é MetaPost.
const forbiddenMetaPostEnvironment = /\\[A-Za-z]*MP[A-Za-z]*/;
const forbiddenTextWrapper = /\\(?:starttext|stoptext)(?![A-Za-z])/i;
const externalFigure =
  /\\(?:use)?externalfigure(?![A-Za-z])\s*(\[[^\]\r\n]*\])?/gi;
const localFigureName = /^\[[A-Za-z0-9_-][A-Za-z0-9._-]*\]$/;

/** Notação ^^ do TeX: ^^5c vira uma barra invertida e forma qualquer comando. */
export function hasCaretEscape(value) {
  if (typeof value === 'string') return value.includes('^^');
  if (Array.isArray(value)) return value.some(hasCaretEscape);
  if (value && typeof value === 'object')
    return Object.values(value).some(hasCaretEscape);
  return false;
}

/** Recebe o código já sem os blocos \startMPcode validados. */
export function unsafeContextCode(code, { allowTextWrapper = false } = {}) {
  const source = String(code ?? '');
  if (
    hasCaretEscape(source) ||
    forbiddenCommand.test(source) ||
    forbiddenMetaPostEnvironment.test(source) ||
    (!allowTextWrapper && forbiddenTextWrapper.test(source))
  )
    return true;
  // Figuras só por nome local (imagens anexadas à questão), nunca por caminho.
  for (const match of source.matchAll(externalFigure))
    if (!match[1] || !localFigureName.test(match[1]) || match[1].includes('..'))
      return true;
  return false;
}
