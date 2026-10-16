export function questionBankSummary(value = '') {
  return (
    String(value)
      .replace(
        /\\startMPcode\b[\s\S]*?(?:\\stopMPcode\b|$)/gi,
        ' [Ilustração] ',
      )
      .replace(
        /\\start(?:luacode|typing)\b[\s\S]*?(?:\\stop(?:luacode|typing)\b|$)/gi,
        ' ',
      )
      .replace(/^\s*%[^\n]*/gm, ' ')
      .replace(/\\(?:start|stop)[a-zA-Z]+(?:\[[^\]]*\])?/g, ' ')
      .replace(
        /\\(?:externalfigure|useexternalfigure)\s*\[[^\]]*\](?:\[[^\]]*\])?/g,
        ' [Ilustração] ',
      )
      .replace(
        /\\(?:chemical|unit|m|math|bold|italic|high|low)\s*\{([^{}]*)\}/g,
        '$1',
      )
      .replace(/\\[A-Za-z]+\b/g, ' ')
      .replace(/[{}$]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240) ||
    'Questão com conteúdo estruturado. Abra para visualizar.'
  );
}
