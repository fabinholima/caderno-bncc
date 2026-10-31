// Converte a notação matemática mais comum (TeX/ConTeXt) em texto legível,
// para a listagem do banco: \frac{1}{2} → 1/2, x^{2} → x², H_2O → H₂O, \sqrt{x} → √x.
const superscripts = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '(': '⁽', ')': '⁾', n: 'ⁿ', x: 'ˣ', i: 'ⁱ' };
const subscripts = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '(': '₍', ')': '₎' };
const symbols = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', infty: '∞', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔',
  rightleftharpoons: '⇌', degree: '°', circ: '°', angle: '∠', perp: '⊥', parallel: '∥', in: '∈', notin: '∉',
  subset: '⊂', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', sum: '∑', int: '∫', partial: '∂',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', Delta: 'Δ', Gamma: 'Γ', Theta: 'Θ',
  Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω', ldots: '…', dots: '…', cdots: '⋯', percent: '%',
};
const group = String.raw`\{([^{}]*)\}`;

function script(text, table, mark) {
  const chars = [...text];
  return chars.every((char) => table[char]) ? chars.map((char) => table[char]).join('') : `${mark}(${text})`;
}

export function readableMath(value = '') {
  let text = String(value)
    .replace(/\^\s*(?:\{\s*\\circ\s*\}|\\circ\b)/g, '°')
    .replace(/\\(?:left|right)\s*([()[\]|.])/g, (_, bracket) => (bracket === '.' ? '' : bracket))
    .replace(new RegExp(String.raw`\\(?:text|mathrm|mathbf|textbf|operatorname)\s*` + group, 'g'), '$1');
  // Frações e raízes podem estar aninhadas: repete até estabilizar.
  for (let round = 0; round < 4; round += 1) {
    const before = text;
    text = text
      .replace(new RegExp(String.raw`\\[dt]?frac\s*` + group + String.raw`\s*` + group, 'g'), (_, top, bottom) => {
        const wrap = (part) => (/^[\w.,√²³]+$/u.test(part.trim()) ? part.trim() : `(${part.trim()})`);
        return `${wrap(top)}/${wrap(bottom)}`;
      })
      .replace(new RegExp(String.raw`\\sqrt\s*\[([^\]]*)\]\s*` + group, 'g'), (_, index, radicand) => `${script(index, superscripts, '^')}√(${radicand})`)
      .replace(new RegExp(String.raw`\\sqrt\s*` + group, 'g'), (_, radicand) => (/^\w+$/.test(radicand) ? `√${radicand}` : `√(${radicand})`));
    if (text === before) break;
  }
  return text
    .replace(new RegExp(String.raw`\^\s*` + group, 'g'), (_, sup) => script(sup.trim(), superscripts, '^'))
    .replace(/\^\s*([\w+\-−])/g, (_, sup) => script(sup, superscripts, '^'))
    .replace(new RegExp(String.raw`_\s*` + group, 'g'), (_, sub) => script(sub.trim(), subscripts, '_'))
    .replace(/_\s*(\d+)/g, (_, sub) => script(sub, subscripts, '_'))
    .replace(/\\%/g, '%')
    // Como no TeX, o espaço depois de uma letra grega é absorvido (\Delta S → ΔS).
    .replace(/\\([A-Za-z]+)\b( (?=\w))?/g, (match, name, space = '') =>
      symbols[name] ? symbols[name] + (/^[α-ωΑ-Ω]$/.test(symbols[name]) ? '' : space) : match);
}

export function questionBankSummary(value = '') {
  return (
    readableMath(String(value)
      .replace(
        /\\startMPcode\b[\s\S]*?(?:\\stopMPcode\b|$)/gi,
        ' [Ilustração] ',
      ))
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
      // Remove delimitadores de fórmula, mas preserva valores em R$ e US$.
      .replace(/[{}]|(?<!\b(?:R|US))\$|\$(?!\s?\d)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240) ||
    'Questão com conteúdo estruturado. Abra para visualizar.'
  );
}
