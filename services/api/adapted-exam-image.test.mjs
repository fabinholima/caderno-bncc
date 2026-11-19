import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gerarImagemComGemini,
  promptDaImagem,
  tipoDeImagem,
} from './adapted-exam-image.mjs';

const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

test('reconhece PNG e JPEG pelos bytes e recusa o resto', () => {
  assert.equal(tipoDeImagem(Buffer.from(PNG_1x1, 'base64')), 'image/png');
  assert.equal(
    tipoDeImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    'image/jpeg',
  );
  assert.equal(tipoDeImagem(Buffer.from('GIF89a', 'utf8')), null);
  assert.equal(tipoDeImagem(Buffer.alloc(0)), null);
});

test('o prompt da ilustração proíbe texto dentro da imagem', () => {
  const texto = promptDaImagem('uma pizza dividida em 8 fatias');
  assert.match(texto, /sem legendas, números ou letras/);
  assert.match(texto, /uma pizza dividida em 8 fatias/);
});

test('gera imagem pelo Gemini e devolve dataUrl PNG', async () => {
  let enviado;
  const fetchImpl = async (url, options) => {
    enviado = {
      url,
      body: JSON.parse(options.body),
      chave: options.headers['x-goog-api-key'],
      signal: options.signal,
    };
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: PNG_1x1 } }],
            },
          },
        ],
      }),
    };
  };
  const imagem = await gerarImagemComGemini({
    descricao: 'um triângulo',
    fetchImpl,
    env: { GEMINI_API_KEY: 'k' },
  });
  assert.equal(imagem.dataUrl, `data:image/png;base64,${PNG_1x1}`);
  assert.match(enviado.url, /models\/gemini-2\.5-flash-image:generateContent$/);
  assert.deepEqual(enviado.body.generationConfig.responseModalities, ['IMAGE']);
  assert.equal(enviado.chave, 'k');
  assert.ok(enviado.signal instanceof AbortSignal);
});

test('erros de imagem viram exceções com motivo', async () => {
  await assert.rejects(
    gerarImagemComGemini({ descricao: 'x', env: {} }),
    /GEMINI_API_KEY/,
  );
  await assert.rejects(
    gerarImagemComGemini({
      descricao: 'x',
      env: { GEMINI_API_KEY: 'k' },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'não é imagem' }] } }],
        }),
      }),
    }),
    /não devolveu imagem/,
  );
  await assert.rejects(
    gerarImagemComGemini({
      descricao: 'x',
      env: { GEMINI_API_KEY: 'k' },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from('GIF89a').toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        }),
      }),
    }),
    /não é PNG nem JPEG/,
  );
  await assert.rejects(
    gerarImagemComGemini({
      descricao: 'x',
      env: { GEMINI_API_KEY: 'k', ADAPTED_EXAM_IMAGE_MODEL: 'x/../y' },
      fetchImpl: async () => {
        throw new Error('não deveria chamar');
      },
    }),
    /Modelo de imagem inválido/,
  );
});
