// Foto do cadastro do aluno: o portal mostra no máximo 96 px. Recorta um quadrado
// em torno do rosto (centro, um pouco acima do meio) e salva JPEG de 320 px.
const SIDE = 320;
const TARGET_BYTES = 60_000;
const MAX_BYTES = 100_000;

const dataUrlBytes = (value: string) => Math.floor((value.length - value.indexOf(',') - 1) * 3 / 4);

export async function shrinkStudentPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível ler a foto. Use PNG, JPEG ou WebP.');
  });
  try {
    const crop = Math.round(Math.min(bitmap.width, bitmap.height) * 0.85);
    const x = Math.max(0, Math.min(Math.round(bitmap.width / 2 - crop / 2), bitmap.width - crop));
    const y = Math.max(0, Math.min(Math.round(bitmap.height * 0.475 - crop / 2), bitmap.height - crop));
    for (const [side, quality, limit] of [[SIDE, 0.7, TARGET_BYTES], [SIDE, 0.5, TARGET_BYTES], [240, 0.5, MAX_BYTES]] as const) {
      const size = Math.min(side, crop);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) break;
      context.drawImage(bitmap, x, y, crop, crop, 0, 0, size, size);
      const value = canvas.toDataURL('image/jpeg', quality);
      if (value.startsWith('data:image/jpeg;base64,') && dataUrlBytes(value) <= limit) return value;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('Não foi possível reduzir a foto. Tente outra imagem.');
}
