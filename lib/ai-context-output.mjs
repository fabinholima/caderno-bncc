export const AI_CONTEXT_RULES = String.raw`
A saída deve usar SOMENTE sintaxe nativa de ConTeXt, nunca um documento LaTeX.
Exemplos obrigatórios: matemática inline \m{v=\frac{d}{t}}; destacada \startformula E=mc^2 \stopformula; subscrito no texto CO\low{2}; sobrescrito m\high{2}; negrito \bold{texto}.
Não use \documentclass, \usepackage, \begin, \end, \textbf, \textit, \ce, \(...\), \[...\], delimitadores $ ou cercas Markdown. Comandos matemáticos compartilhados, como \frac, \sqrt, \alpha, são válidos dentro de matemática ConTeXt. Não modifique o conteúdo nem os valores para ajustar a formatação.`;

export function normalizeAiContext(value) {
  const text=String(value || '');
  // Native MetaPost labels may legitimately contain btex $...$ etex.
  const normalized=text.split(/(\\startMPcode\b[\s\S]*?\\stopMPcode\b)/g).map(part=>{
    if(part.startsWith('\\startMPcode')) return part;
    return part
      .replace(/\\\[([\s\S]*?)\\\]/g,(_,math)=>`\\startformula\n${math.trim()}\n\\stopformula`)
      .replace(/\\\(([\s\S]*?)\\\)/g,(_,math)=>`\\m{${math.trim()}}`)
      .replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g,(_,math)=>`\\startformula\n${math.trim()}\n\\stopformula`)
      .replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g,(_,math)=>`\\m{${math.trim()}}`)
      .replace(/\\textbf\b/g,'\\bold').replace(/\\textit\b/g,'\\italic')
      .replace(/\\(?:dfrac|tfrac)\b/g,'\\frac')
      .replace(/\\begin\{equation\*?\}/g,'\\startformula')
      .replace(/\\end\{equation\*?\}/g,'\\stopformula');
  }).join('');
  if(/```|\\(?:begin|end|documentclass|usepackage|ce)\b/.test(normalized))
    throw new Error('A IA retornou uma estrutura LaTeX sem conversão segura para ConTeXt. Revise ou refaça a conversão.');
  return normalized;
}
