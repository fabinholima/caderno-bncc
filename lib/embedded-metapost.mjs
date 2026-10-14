// Validate embedded drawings before checking the surrounding ConTeXt.
export function withoutEmbeddedMetaPost(source) {
  const remaining = source.replace(/\\startMPcode\b([\s\S]*?)\\stopMPcode\b/g, (_, code) => {
    if (!code.trim() || /(?:\\|\^\^|runscript|scantokens|readfrom|write\s|closefrom|closeout|input\s|loadmodule|verbatimtex)/i.test(code))
      throw new Error('Bloco MetaPost inválido ou não permitido.');
    return '';
  });
  if (/\\(?:startMPcode|stopMPcode)\b/i.test(remaining))
    throw new Error('Feche cada bloco MetaPost com \\stopMPcode.');
  return remaining;
}
