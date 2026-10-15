export async function requestGeminiAnalysis({
  candidates,
  catalog,
  instructions,
  schema,
  fetchImpl = fetch,
  env = process.env,
}) {
  if (!env.GEMINI_API_KEY)
    throw new Error('GEMINI_API_KEY não configurada no worker de importação.');
  const model = env.GEMINI_EXAM_MODEL || 'gemini-3.5-flash-lite';
  if (!/^[a-zA-Z0-9._-]+$/.test(model))
    throw new Error('Modelo Gemini inválido.');
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': env.GEMINI_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  catalog,
                  questions: candidates.map((c) => ({
                    candidateId: c.id,
                    sourceNumber: c.sourceNumber,
                    rawText: c.rawText.slice(0, 30000),
                    pageNumber: c.pageNumber,
                    confirmedAnswers:
                      c.answerStatus === 'confirmed' ? c.correctAnswers : [],
                  })),
                }),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          maxOutputTokens: 16384,
        },
      }),
    },
  );
  if (response.status === 429 || response.status === 503) {
    const seconds = Number(response.headers?.get('retry-after'));
    throw Object.assign(
      new Error(
        'Cota ou capacidade Gemini atingida. A análise aguardará para tentar novamente.',
      ),
      {
        code: 'AI_QUOTA_EXHAUSTED',
        retryAfterSeconds:
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(86400, Math.max(60, seconds))
            : 3600,
      },
    );
  }
  if (!response.ok)
    throw new Error(
      `Gemini respondeu HTTP ${response.status}. Confira a chave, o modelo e as permissões no AI Studio.`,
    );
  const body = await response.json();
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason !== 'STOP')
    throw new Error(
      'Gemini não concluiu a conversão. Reduza o lote ou revise o conteúdo.',
    );
  const parsed = JSON.parse(
    (candidate.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join(''),
  );
  if (!Array.isArray(parsed.questions))
    throw new Error('Resposta Gemini sem questões estruturadas.');
  return {
    questions: parsed.questions,
    provider: 'gemini',
    model: body.modelVersion || model,
    responseId: body.responseId || null,
    usage: {
      input_tokens: body.usageMetadata?.promptTokenCount || 0,
      output_tokens:
        (body.usageMetadata?.candidatesTokenCount || 0) +
        (body.usageMetadata?.thoughtsTokenCount || 0),
      total_tokens: body.usageMetadata?.totalTokenCount || 0,
    },
  };
}
