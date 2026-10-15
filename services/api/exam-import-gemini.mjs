// Keep provider schemas small; detailed size/range validation happens locally.
export function geminiResponseSchema(value) {
  if (Array.isArray(value)) return value.map(geminiResponseSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum'].includes(key))
    .map(([key, child]) => [key, geminiResponseSchema(child)]));
}

export async function requestGeminiAnalysis({
  candidates,
  catalog,
  instructions,
  schema,
  fetchImpl = fetch,
  env = process.env,
  pdfContents,
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
      signal: AbortSignal.timeout(pdfContents ? 180_000 : 120_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [
          {
            role: 'user',
            parts: [
              ...(pdfContents
                ? [
                    {
                      inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfContents.toString('base64'),
                      },
                    },
                  ]
                : []),
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
          responseJsonSchema: geminiResponseSchema(schema),
          maxOutputTokens: pdfContents ? 65536 : 16384,
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
  if (!response.ok) {
    const failure = await Promise.resolve().then(() => response.json()).catch(() => ({}));
    const message = String(failure?.error?.message || '');
    const category = /api.?key|credential/i.test(message) ? 'Chave de API inválida ou sem autorização.'
      : /schema|constraint|state|complex/i.test(message) ? 'O Gemini rejeitou o formato estruturado da resposta.'
      : /max.?output|output.?token/i.test(message) ? 'O limite de saída solicitado não é aceito pelo modelo.'
      : /location|country|region/i.test(message) ? 'O projeto ou a região não está habilitado para este serviço.'
      : /pdf|document|mime|page/i.test(message) ? 'O Gemini rejeitou o PDF; confira se está legível e sem senha.'
      : /model|not found/i.test(message) ? 'O modelo configurado não está disponível para esta chave.'
      : 'A requisição foi rejeitada pelo provedor.';
    // Log only predefined diagnostics, never the raw provider body or credentials.
    const status = /^[A-Z_]{1,80}$/.test(failure?.error?.status || '') ? failure.error.status : 'UNKNOWN';
    console.error('Gemini request rejected', {httpStatus:response.status,status,model,category});
    throw new Error(`Gemini HTTP ${response.status} (${status}): ${category}`);
  }
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
