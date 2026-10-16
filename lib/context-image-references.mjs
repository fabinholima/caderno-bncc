export const imageReferencePattern = /^imagem(?:[1-9][0-9]*|-[a-f0-9-]{36})$/;

// Alias scope is one rich-content field (statement, alternative, or resolution).
export function resolveContextImageReferences(nodes = []) {
  const images = new Map();
  let number = 0;
  for (const node of nodes) {
    if (node.type !== 'image') continue;
    const reference = node.referenceId || `imagem${++number}`;
    if (node.referenceId) number++;
    if (!imageReferencePattern.test(reference) || images.has(reference))
      throw new Error('Referência de imagem inválida ou repetida.');
    images.set(reference, node);
  }
  const used = new Set();
  const resolved = nodes.map((node) => {
    if (node.type !== 'contextRaw') return node;
    const code = node.code.replace(
      /\\externalfigure\s*\[([^\]\r\n]+)\]/g,
      (match, reference) => {
        if (!images.has(reference)) {
          if (imageReferencePattern.test(reference))
            throw new Error(
              `A imagem ${reference} não está anexada neste campo.`,
            );
          return match;
        }
        const image = images.get(reference);
        if (!/^question-image-[0-9]+\.(?:png|jpg)$/.test(image.fileName || ''))
          throw new Error('Imagem referenciada não materializada.');
        used.add(image);
        return `\\externalfigure[${image.fileName}]`;
      },
    );
    return { ...node, code };
  });
  return resolved.map((node, index) =>
    nodes[index].type === 'image' && used.has(nodes[index])
      ? { ...node, inlineReference: true }
      : node,
  );
}

export function nextImageReference(blocks) {
  const used = new Set(
    blocks
      .filter((block) => block.type === 'image')
      .map((block, index) => block.referenceId || `imagem${index + 1}`),
  );
  for (const block of blocks)
    if (block.type === 'contextRaw')
      for (const match of String(block.code).matchAll(
        /\\externalfigure\s*\[(imagem[1-9][0-9]*)\]/g,
      ))
        used.add(match[1]);
  let number = 1;
  while (used.has(`imagem${number}`)) number++;
  return `imagem${number}`;
}

export function assignImageReferences(blocks) {
  const used = new Set(
    blocks
      .filter((block) => block.type === 'image' && block.referenceId)
      .map((block) => block.referenceId),
  );
  let number = 0;
  return blocks.map((block) => {
    if (block.type !== 'image') return block;
    number++;
    if (block.referenceId) return block;
    while (used.has(`imagem${number}`)) number++;
    const referenceId = `imagem${number}`;
    used.add(referenceId);
    return { ...block, referenceId };
  });
}
