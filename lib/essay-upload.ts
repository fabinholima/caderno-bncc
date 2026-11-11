// Prepara fotos e PDFs da redação para envio: fotos são reduzidas e
// regravadas em JPEG no navegador (corrige a rotação da câmera e remove
// metadados como localização); PDFs seguem como estão. O servidor confere
// de novo o tipo, a assinatura e o tamanho.
export const ESSAY_MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 2400;

const dataUrlBytes = (value: string) =>
  Math.floor(((value.length - value.indexOf(',') - 1) * 3) / 4);

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export async function prepareEssayFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    if (file.size > ESSAY_MAX_FILE_BYTES)
      throw new Error('O PDF pode ter no máximo 8 MB.');
    return readAsDataUrl(file);
  }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error('Envie fotos em JPEG, PNG ou WebP, ou um arquivo PDF.');
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(() => {
    throw new Error('Não foi possível abrir a foto. Tente outra imagem.');
  });
  try {
    for (const [side, quality] of [
      [MAX_SIDE, 0.85],
      [MAX_SIDE, 0.7],
      [1800, 0.7],
    ] as const) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      if (!context) break;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const value = canvas.toDataURL('image/jpeg', quality);
      if (
        value.startsWith('data:image/jpeg;base64,') &&
        dataUrlBytes(value) <= ESSAY_MAX_FILE_BYTES
      )
        return value;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('A foto é grande demais. Tente outra imagem.');
}

/** Baixa um arquivo privado (com a sessão) e devolve uma URL local temporária. */
export async function privateFileUrl(
  fetcher: (url: string) => Promise<Response>,
  url: string,
): Promise<{ url: string; type: string }> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error('Não foi possível abrir o arquivo.');
  const blob = await response.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}
