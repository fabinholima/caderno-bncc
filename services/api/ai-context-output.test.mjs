import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAiContext} from '../../lib/ai-context-output.mjs';
test('converts common LaTeX notation without changing mathematical expressions',()=>{
 assert.equal(normalizeAiContext(String.raw`Velocidade \(v=\frac{d}{t}\) e $x^2$.`),String.raw`Velocidade \m{v=\frac{d}{t}} e \m{x^2}.`);
 assert.equal(normalizeAiContext(String.raw`\[E=mc^2\]`),'\\startformula\nE=mc^2\n\\stopformula');
 assert.equal(normalizeAiContext(String.raw`\textbf{Texto} \textit{ênfase}`),String.raw`\bold{Texto} \italic{ênfase}`);
});
test('preserves native ConTeXt and MetaPost labels and rejects unsupported LaTeX',()=>{
 const native=String.raw`CO\low{2}. \startMPcode label(btex $B$ etex, origin); \stopMPcode`;
 assert.equal(normalizeAiContext(native),native);
 assert.throws(()=>normalizeAiContext(String.raw`\begin{tabular}{cc}a&b\end{tabular}`),/LaTeX/);
 assert.throws(()=>normalizeAiContext('```latex\nx\n```'),/LaTeX/);
 assert.equal(normalizeAiContext(String.raw`Custo: \$ 10.`),String.raw`Custo: \$ 10.`);
});
