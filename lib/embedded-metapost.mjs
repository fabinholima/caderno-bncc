// Permit only these native TeX label commands; all other backslashes stay blocked.
export function validMetaPost(code) {
  const checked = code.replace(/\\(?:ss\b|,)/g, '');
  return Boolean(code.trim()) && !/(?:\\|\^\^|runscript|scantokens|readfrom|write\s|closefrom|closeout|input\s|loadmodule|verbatimtex)/i.test(checked);
}

// Validate embedded drawings before checking the surrounding ConTeXt.
export function withoutEmbeddedMetaPost(source) {
  const remaining = source.replace(/\\startMPcode\b([\s\S]*?)\\stopMPcode\b/g, (_, code) => {
    if (!validMetaPost(code))
      throw new Error('Bloco MetaPost inválido ou não permitido.');
    return '';
  });
  if (/\\(?:startMPcode|stopMPcode)\b/i.test(remaining))
    throw new Error('Feche cada bloco MetaPost com \\stopMPcode.');
  return remaining;
}
