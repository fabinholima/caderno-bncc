// The dedicated figure field accepts either a body or one complete ConTeXt block.
export function normalizeMetaPost(code) {
  const source = String(code ?? '').trim();
  const wrapped = source.match(/^\\startMPcode\b([\s\S]*?)\\stopMPcode$/);
  return wrapped ? wrapped[1].trim() : source;
}

// Permit native fonts, spacing, Portuguese accents and Greek math in TeX labels.
// Match complete names so unknown commands cannot bypass validation.
export function validMetaPost(code) {
  const body = normalizeMetaPost(code);
  if (body.includes('^^')) return false;
  const checked = body.replace(/\\(?:(?:c|ss|bf|rm|it|sl|tt|tf(?:xx|x|[a-d])?|bold|italic|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)\b|[,'`~^"=.])/g, '');
  return Boolean(body) && !/(?:\\|\^\^|runscript|scantokens|readfrom|write\s|closefrom|closeout|input\s|loadmodule|verbatimtex)/i.test(checked);
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
