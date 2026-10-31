// SÓ PARA EXIBIÇÃO: gera o resumo em texto das listagens do portal (Início,
// banco de questões, painel lateral). O enunciado salvo continua em ConTeXt
// puro e é ele que o renderizador usa no PDF; nada aqui é gravado no banco.
//
// Converte a notação mais comum do ConTeXt em texto legível:
// \frac{1}{2} → 1/2, x^{2} → x², \chemical{{C\ell_{2}}} → Cℓ₂,
// \chemical{GIVES} → →, \unit{10 kilo joule inverse mol} → 10 kJ/mol.
const superscripts = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '(': '⁽', ')': '⁾', n: 'ⁿ', x: 'ˣ', i: 'ⁱ' };
const subscripts = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '(': '₍', ')': '₎' };
const symbols = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', infty: '∞', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔',
  rightleftharpoons: '⇌', degree: '°', circ: '°', angle: '∠', perp: '⊥', parallel: '∥', in: '∈', notin: '∉',
  subset: '⊂', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', sum: '∑', int: '∫', partial: '∂',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', Delta: 'Δ', Gamma: 'Γ', Theta: 'Θ',
  Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω', ldots: '…', dots: '…', cdots: '⋯', percent: '%', ell: 'ℓ', quad: ' ', qquad: ' ',
};
const group = String.raw`\{([^{}]*)\}`;

// Unidades no formato do ConTeXt: \unit{10 kilo joule inverse mol} → 10 kJ/mol.
const unitPrefixes = { tera: 'T', giga: 'G', mega: 'M', kilo: 'k', hecto: 'h', deca: 'da', deci: 'd', centi: 'c', milli: 'm', micro: 'μ', nano: 'n', pico: 'p' };
const unitNames = {
  meter: 'm', metre: 'm', gram: 'g', second: 's', minute: 'min', hour: 'h', liter: 'L', litre: 'L', mole: 'mol', mol: 'mol',
  joule: 'J', calorie: 'cal', newton: 'N', watt: 'W', pascal: 'Pa', atmosphere: 'atm', volt: 'V', ampere: 'A', ohm: 'Ω',
  coulomb: 'C', kelvin: 'K', hertz: 'Hz', percent: '%', celsius: '°C', degree: '°', degrees: '°', bar: 'bar', tesla: 'T',
};
function contextUnit(content) {
  const words = content.trim().split(/\s+/);
  const parts = [];
  let pending = '';
  let power = '';
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower === 'inverse' || lower === 'per') pending = '/';
    else if (lower === 'square') power = '²';
    else if (lower === 'cubic') power = '³';
    else if (unitPrefixes[lower] !== undefined) {
      // Prefixo (kilo, milli...) se junta à unidade seguinte: kilo joule → kJ.
      parts.push({ text: unitPrefixes[lower], join: pending, glue: true });
      pending = '';
    } else {
      const symbol = unitNames[lower];
      // Palavra desconhecida fica como está; notação 2e-5 vira 2×10⁻⁵.
      const text = symbol === undefined
        ? word.replace(/^(-?\d+(?:[.,]\d+)?)e(-?\d+)$/i, (_, base, exp) => `${base}×10${script(exp, superscripts, '^')}`)
        : symbol + power;
      const previous = parts.at(-1);
      if (previous?.glue && symbol !== undefined) {
        previous.text += text;
        previous.glue = false;
      } else parts.push({ text, join: pending, glue: false });
      pending = '';
      power = '';
    }
  }
  // "inverse"/"per" viram barra; o resto é separado por espaço (10 g, 25 °C).
  return parts.reduce((out, part, index) => {
    if (index === 0) return part.text;
    if (part.join) return `${out}/${part.text}`;
    return part.text === '°C' && out.endsWith('°') ? out.slice(0, -1) + part.text : `${out} ${part.text}`;
  }, '');
}
const chemicalWords = { GIVES: '→', PLUS: '+', EQUILIBRIUM: '⇌', MESOMERIC: '↔' };

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
  text = text
    .replace(new RegExp(String.raw`\\high\s*` + group, 'g'), (_, sup) => script(sup.trim(), superscripts, '^'))
    .replace(new RegExp(String.raw`\\low\s*` + group, 'g'), (_, sub) => script(sub.trim(), subscripts, '_'))
    .replace(new RegExp(String.raw`\^\s*` + group, 'g'), (_, sup) => script(sup.trim(), superscripts, '^'))
    .replace(/\^\s*([\w+\-−])/g, (_, sup) => script(sup, superscripts, '^'))
    .replace(new RegExp(String.raw`_\s*` + group, 'g'), (_, sub) => script(sub.trim(), subscripts, '_'))
    .replace(/_\s*(\d+)/g, (_, sub) => script(sub, subscripts, '_'))
    .replace(/\\%/g, '%')
    // Como no TeX, o espaço depois de uma letra grega é absorvido (\Delta S → ΔS).
    .replace(/\\([A-Za-z]+)\b( (?=\w))?/g, (match, name, space = '') =>
      symbols[name] ? symbols[name] + (/^[α-ωΑ-Ωℓ]$/.test(symbols[name]) ? '' : space) : match);
  // Comandos próprios do ConTeXt: \chemical{{Cℓ₂}}, \chemical{GIVES}, \unit{...}.
  return text
    .replace(/\\chemical\s*\{\s*\{?([^{}]*?)\}?\s*\}/g, (_, formula) => chemicalWords[formula.trim()] ?? formula.trim())
    .replace(/\\unit\s*\{([^{}]*)\}/g, (_, content) => contextUnit(content));
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
