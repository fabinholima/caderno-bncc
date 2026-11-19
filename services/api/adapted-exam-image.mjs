// Geração de imagens para as questões da prova adaptada (Gemini, modelo de imagem).
// A imagem volta como dataUrl PNG/JPEG, o mesmo formato que o PDF do pdf-lib já incorpora.

export const MAX_IMAGE_BYTES = 1_500_000;
export const IMAGE_TIMEOUT_MS = 60_000;

const ASSINATURAS = [
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

/** Identifica PNG/JPEG pelos primeiros bytes; qualquer outra coisa é recusada. */
export function tipoDeImagem(buffer) {
  const achado = ASSINATURAS.find(({ bytes }) =>
    bytes.every((byte, i) => buffer[i] === byte),
  );
  return achado?.tipo ?? null;
}

/** Pedido de ilustração simples, sem texto escrito na imagem (texto fica no enunciado). */
export function promptDaImagem(descricao) {
  return [
    'Ilustração simples e didática para uma questão de prova escolar.',
    'Fundo branco, traços limpos e contrastados, sem legendas, números ou letras na imagem.',
    `Conteúdo: ${String(descricao ?? '').trim()}`,
  ].join(' ');
}

/**
 * @returns {Promise<{ dataUrl: string, tipo: string, model: string }>}
 */
export async function gerarImagemComGemini({
  descricao,
  fetchImpl = fetch,
  env = process.env,
}) {
  if (!env.GEMINI_API_KEY)
    throw new Error('GEMINI_API_KEY não configurada para gerar imagens.');
  const model = env.ADAPTED_EXAM_IMAGE_MODEL || 'gemini-2.5-flash-image';
  if (!/^[a-zA-Z0-9._-]+$/.test(model))
    throw new Error('Modelo de imagem inválido.');
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': env.GEMINI_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: promptDaImagem(descricao) }] },
        ],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error?.message || `A API de imagem respondeu ${response.status}.`,
    );
  const partes = (body?.candidates?.[0]?.content?.parts ?? []).filter(
    (p) => p.inlineData?.data,
  );
  const dados = partes[0]?.inlineData?.data;
  if (!dados) throw new Error('A API de imagem não devolveu imagem.');
  const buffer = Buffer.from(dados, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES)
    throw new Error('Imagem gerada grande demais.');
  const tipo = tipoDeImagem(buffer);
  if (!tipo) throw new Error('A imagem gerada não é PNG nem JPEG.');
  return { dataUrl: `data:${tipo};base64,${dados}`, tipo, model };
}
