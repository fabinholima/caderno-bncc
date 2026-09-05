import {
  DEFAULT_RENDER_TEMPLATE,
  renderTemplateCatalog,
} from '../../lib/render-templates.mjs';
import { basicExamV1 } from './templates/basicexam-v1.mjs';
import { simulatedExamV1 } from './templates/simulado-v1.mjs';

const templates = new Map([
  [basicExamV1.id, basicExamV1],
  [simulatedExamV1.id, simulatedExamV1],
]);

export function getRenderTemplate(id = DEFAULT_RENDER_TEMPLATE) {
  const template = templates.get(id);
  if (!template) throw new Error(`Layout de impressão não permitido: ${id}`);
  return template;
}

export function listRenderTemplates() {
  return renderTemplateCatalog.map((template) => ({ ...template }));
}
