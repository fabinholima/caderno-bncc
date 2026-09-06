import initRDKitModule from '@rdkit/rdkit';
import { z } from 'zod';

export const chemicalStructureInputSchema = z.object({
  smiles: z
    .string()
    .trim()
    .min(1, 'Informe a estrutura em SMILES.')
    .max(500)
    .regex(
      /^[A-Za-z0-9@+\-[\]()=#\\/.:%*]+$/,
      'SMILES contém caracteres inválidos.',
    ),
});

let rdkitPromise;
const getRdkit = () => {
  rdkitPromise ??= initRDKitModule();
  return rdkitPromise;
};

const safeSvg = (svg) => {
  const value = String(svg)
    .replace(/^<\?xml[^>]*>\s*/i, '')
    .replace(/<!DOCTYPE[^>]*>\s*/i, '')
    .trim();
  if (
    !value.startsWith('<svg ') ||
    !value.endsWith('</svg>') ||
    /<(?:script|foreignObject|iframe|image)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/i.test(
      value,
    )
  )
    throw new Error('O desenho químico gerado não passou pela validação SVG.');
  return value;
};

export async function renderChemicalStructure(input) {
  const { smiles } = chemicalStructureInputSchema.parse(input);
  const rdkit = await getRdkit();
  let molecule;
  try {
    molecule = rdkit.get_mol(smiles);
    if (!molecule?.is_valid())
      throw new Error('A estrutura SMILES não pôde ser interpretada.');
    const canonicalSmiles = molecule.get_smiles();
    const svg = safeSvg(molecule.get_svg(520, 300));
    return {
      smiles,
      canonicalSmiles,
      svg,
      svgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  } catch (error) {
    if (error?.message?.includes('não passou')) throw error;
    throw Object.assign(
      new Error('A estrutura SMILES não pôde ser interpretada.'),
      { statusCode: 422 },
    );
  } finally {
    molecule?.delete();
  }
}

export async function prepareChemicalStructureBlocks(blocks = []) {
  return Promise.all(
    blocks.map(async (block) => {
      if (block.type !== 'chemicalStructure' || !block.smiles) return block;
      const rendered = await renderChemicalStructure({ smiles: block.smiles });
      return {
        ...block,
        smiles: rendered.canonicalSmiles,
        svgDataUrl: rendered.svgDataUrl,
      };
    }),
  );
}
