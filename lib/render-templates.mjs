export const DEFAULT_RENDER_TEMPLATE = 'basicexam-v1';
export const DEFAULT_RENDER_FONT = 'plex';

export const renderFontCatalog = Object.freeze([
  Object.freeze({ id: 'plex', label: 'IBM Plex' }),
  Object.freeze({ id: 'heros', label: 'TeX Gyre Heros (Helvetica)' }),
  Object.freeze({ id: 'bonum', label: 'TeX Gyre Bonum (Bookman)' }),
  Object.freeze({ id: 'schola', label: 'TeX Gyre Schola (Schoolbook)' }),
  Object.freeze({ id: 'libertinus', label: 'Libertinus' }),
]);

export const renderFontIds = Object.freeze(
  renderFontCatalog.map((font) => font.id),
);

export function isRenderFontId(value) {
  return renderFontIds.includes(value);
}

export const renderTemplateCatalog = Object.freeze([
  Object.freeze({
    id: DEFAULT_RENDER_TEMPLATE,
    label: 'Caderno clássico',
    description:
      'Layout escolar limpo, com t-basicexam, cabeçalho institucional e gabarito separado.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  }),
  Object.freeze({
    id: 'simulado-v1',
    label: 'Simulado (cartão compacto)',
    description:
      'Layout exclusivo para simulados, com identificação, instruções, QR e grade A–E de até 90 questões.',
    engine: 'ConTeXt / LuaMetaTeX',
    version: 1,
  }),
]);

export const renderTemplateIds = Object.freeze(
  renderTemplateCatalog.map((template) => template.id),
);

export function isRenderTemplateId(value) {
  return renderTemplateIds.includes(value);
}
