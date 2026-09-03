export const DEFAULT_RENDER_TEMPLATE = 'basicexam-v1';

export const renderTemplateCatalog = Object.freeze([
  Object.freeze({
    id: DEFAULT_RENDER_TEMPLATE,
    label: 'Caderno clássico',
    description:
      'Layout escolar limpo, com t-basicexam, cabeçalho institucional e gabarito separado.',
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
