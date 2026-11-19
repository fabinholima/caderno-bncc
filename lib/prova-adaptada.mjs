// Adaptação de prova para estudantes com laudo.
//
// Recebe um snapshot de avaliação (o mesmo contrato de `renderAssessment`) e
// devolve outro snapshot, pronto para o renderizador existente:
//   - só questões de resposta única, simples, sem texto-base e com enunciado curto;
//   - cada questão fica com três alternativas (a correta e duas incorretas),
//     reletradas em A, B e C;
//   - texto em CAIXA ALTA (enunciados, alternativas e instruções);
//   - imagens e fórmulas são mantidas.
//
// A escolha dos distratores é determinística pela semente informada, então a
// mesma prova gera sempre a mesma adaptação.

export const ADAPTACAO_PADRAO = Object.freeze({
  dificuldades: ['easy'],
  alternativas: 3,
  caracteresMaximos: 400,
  tamanhoMinimoFonte: 13,
  seed: 0,
});

const TIPOS_SIMPLES = new Set([
  'paragraph',
  'image',
  'math',
  'chemical',
  'contextInline',
  'contextFormula',
]);

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Comandos cujo argumento é um nome próprio, fórmula ou unidade: não podem ir para caixa alta.
const ARGUMENTO_PRESERVADO = /\\(?:chemical|unit|m)\{(?:[^{}]|\{[^{}]*\})*\}/;

/** Converte um texto para caixa alta preservando comandos TeX e argumentos protegidos. */
export function caixaAltaTexto(texto = '') {
  const padrao = new RegExp(
    `(${ARGUMENTO_PRESERVADO.source})|(\\\\[a-zA-Z]+)|([^\\\\]+|\\\\)`,
    'g',
  );
  return String(texto).replace(
    padrao,
    (trecho, protegido, comando, resto) =>
      protegido ?? comando ?? resto.toLocaleUpperCase('pt-BR'),
  );
}

/** Aplica a caixa alta aos nós de texto; fórmulas, imagens e MetaPost ficam como estão. */
export function caixaAltaNos(nos = []) {
  return nos.map((no) => {
    if (no.type === 'paragraph')
      return { ...no, text: caixaAltaTexto(no.text) };
    if (no.type === 'romanList')
      return { ...no, items: (no.items ?? []).map(caixaAltaTexto) };
    if (no.type === 'image' && no.caption)
      return { ...no, caption: caixaAltaTexto(no.caption) };
    return no;
  });
}

function comprimentoTexto(nos = []) {
  return nos.reduce((total, no) => {
    if (no.type === 'paragraph') return total + String(no.text ?? '').length;
    if (no.type === 'romanList')
      return total + (no.items ?? []).join(' ').length;
    return total;
  }, 0);
}

function nosSimples(nos = []) {
  return nos.every((no) => TIPOS_SIMPLES.has(no.type));
}

function semente(texto) {
  let hash = 2166136261;
  for (const char of String(texto)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function gerador(valor) {
  let estado = valor >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Escolhe as alternativas mantidas: a correta e (n-1) distratores sorteados pela semente. */
function escolherAlternativas(questao, quantidade, seed) {
  const corretas = new Set(questao.answer?.correctStableKeys ?? []);
  const alternativas = questao.alternatives ?? [];
  const correta = alternativas.findIndex((alt) => corretas.has(alt.stableKey));
  if (corretas.size !== 1 || correta < 0) return null;
  const distratores = alternativas
    .map((_, indice) => indice)
    .filter((indice) => indice !== correta);
  const sortear = gerador(semente(`${seed}:${questao.id}`));
  for (let i = distratores.length - 1; i > 0; i -= 1) {
    const j = Math.floor(sortear() * (i + 1));
    [distratores[i], distratores[j]] = [distratores[j], distratores[i]];
  }
  const mantidos = [correta, ...distratores.slice(0, quantidade - 1)].sort(
    (a, b) => a - b,
  );
  return mantidos.map((indice) => alternativas[indice]);
}

/**
 * Motivo para excluir a questão, ou null quando ela é simples o bastante.
 * @returns {string|null}
 */
export function motivoExclusao(questao, opcoes) {
  if (questao.type !== 'single_choice') return 'não é de resposta única';
  if (!opcoes.dificuldades.includes(questao.difficulty))
    return 'dificuldade acima do pedido';
  if (questao.sharedTextId) return 'depende de texto-base';
  if (!nosSimples(questao.statement ?? []))
    return 'enunciado com recurso complexo';
  if (comprimentoTexto(questao.statement ?? []) > opcoes.caracteresMaximos)
    return 'enunciado longo';
  if (
    (questao.alternatives ?? []).some((alt) => !nosSimples(alt.content ?? []))
  )
    return 'alternativa com recurso complexo';
  if ((questao.alternatives ?? []).length < opcoes.alternativas)
    return 'alternativas insuficientes';
  return null;
}

/**
 * Adapta um snapshot de prova.
 * @returns {{ snapshot: object, relatorio: object }}
 */
export function adaptarProva(snapshot, opcoesUsuario = {}) {
  if (snapshot?.schemaVersion !== '1.0' || !Array.isArray(snapshot.questions))
    throw new Error('Snapshot de avaliação inválido ou incompatível.');
  const opcoes = { ...ADAPTACAO_PADRAO, ...opcoesUsuario };
  if (
    !Number.isInteger(opcoes.alternativas) ||
    opcoes.alternativas < 2 ||
    opcoes.alternativas > LETRAS.length
  )
    throw new Error('A quantidade de alternativas deve ser de 2 a 8.');
  if (!Array.isArray(opcoes.dificuldades) || !opcoes.dificuldades.length)
    throw new Error('Informe ao menos uma dificuldade.');

  const origem =
    Array.isArray(snapshot.sections) && snapshot.sections.length
      ? snapshot.sections
      : [{ ...snapshot, questions: snapshot.questions }];

  const removidas = [];
  let numero = 0;
  let alternativasRemovidas = 0;
  const questoesAdaptadas = [];
  const secoes = origem
    .map((secao) => {
      const mantidas = [];
      for (const questao of secao.questions ?? []) {
        const motivo = motivoExclusao(questao, opcoes);
        if (motivo) {
          removidas.push({ numero: questao.number, motivo });
          continue;
        }
        const escolhidas = escolherAlternativas(
          questao,
          opcoes.alternativas,
          opcoes.seed,
        );
        if (!escolhidas) {
          removidas.push({
            numero: questao.number,
            motivo: 'gabarito ausente ou ambíguo',
          });
          continue;
        }
        alternativasRemovidas +=
          questao.alternatives.length - escolhidas.length;
        numero += 1;
        const adaptada = {
          ...questao,
          number: numero,
          statement: caixaAltaNos(questao.statement ?? []),
          alternatives: escolhidas.map((alt, indice) => ({
            ...alt,
            label: LETRAS[indice],
            content: caixaAltaNos(alt.content ?? []),
          })),
        };
        mantidas.push(adaptada);
        questoesAdaptadas.push(adaptada);
      }
      return { ...secao, questions: mantidas };
    })
    .filter((secao) => secao.questions.length > 0);

  const pontos = questoesAdaptadas.reduce(
    (total, questao) => total + (Number(questao.points) || 0),
    0,
  );
  const { sharedTexts: _descartados, ...base } = snapshot;
  const adaptado = {
    ...base,
    assessment: {
      ...snapshot.assessment,
      instructions: [
        ...(snapshot.assessment?.instructions ?? []).map(caixaAltaTexto),
        'MARQUE APENAS UMA ALTERNATIVA POR QUESTÃO.',
      ],
    },
    render: {
      ...snapshot.render,
      fontSize: Math.max(
        Number(snapshot.render?.fontSize) || 11,
        opcoes.tamanhoMinimoFonte,
      ),
    },
    sections:
      Array.isArray(snapshot.sections) && snapshot.sections.length
        ? secoes
        : undefined,
    questions: questoesAdaptadas,
    totals: { points: pontos, questions: questoesAdaptadas.length },
  };
  if (!adaptado.sections) delete adaptado.sections;

  return {
    snapshot: adaptado,
    relatorio: {
      questoesOriginais: snapshot.questions.length,
      questoesMantidas: questoesAdaptadas.length,
      alternativasRemovidas,
      removidas,
      opcoes: {
        dificuldades: opcoes.dificuldades,
        alternativas: opcoes.alternativas,
        caracteresMaximos: opcoes.caracteresMaximos,
        seed: opcoes.seed,
      },
    },
  };
}
