// Confere se o conteúdo de uma data URL bate com o tipo declarado, pelos bytes
// iniciais do arquivo ("magic numbers"). O prefixo data:image/png sozinho é
// escolhido por quem envia; sem esta checagem, qualquer arquivo chegaria ao
// Poppler, ao OpenCV ou ao ConTeXt com o rótulo de imagem ou PDF.
const signatures = {
  'image/png': (head) =>
    head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/jpeg': (head) =>
    head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  'application/pdf': (head) =>
    head.subarray(0, 5).toString('latin1') === '%PDF-',
};

/** true quando os bytes iniciais correspondem ao tipo da data URL (PNG, JPEG ou PDF). */
export function dataUrlMatchesSignature(value) {
  const match =
    /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]{0,32}={0,2})/.exec(
      String(value ?? ''),
    );
  const check = match && signatures[match[1]];
  if (!check) return false;
  // Até 32 caracteres base64 (24 bytes), mais do que qualquer assinatura acima.
  const encoded = match[2];
  const head = Buffer.from(
    encoded.slice(0, encoded.length - (encoded.length % 4)),
    'base64',
  );
  return check(head);
}

export const signatureMessage =
  'O conteúdo do arquivo não corresponde ao tipo informado (PNG, JPEG ou PDF).';
