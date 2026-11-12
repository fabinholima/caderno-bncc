import { renderTemplateCatalog } from '@/lib/render-templates.mjs';

export type AssessmentSection = {
  id: string;
  subject: string;
  columns: 1 | 2;
  startOnNewPage: boolean;
  selected: Set<string>;
  fullWidth: Set<string>;
  /** Textos-base em largura total só nesta prova. */
  fullWidthTexts?: Set<string>;
};

export type GeneratedVersion = {
  code: string;
  renderJobId?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  downloads?: {
    prova: string;
    gabarito: string;
    provaTex: string;
    gabaritoTex: string;
  } | null;
};

export type RenderTemplate = {
  id: string;
  label: string;
  description: string;
  engine: string;
  version: number;
};

export type RenderFont = { id: string; label: string };

export type AssessmentPreset = {
  id: string;
  name: string;
  configuration: {
    header: {
      institutionName: string;
      teacherName: string;
      className: string;
      term: string;
      date: string;
      transcriptionPhrase?: string;
      logoDataUrl?: string;
    };
    paper: 'A4' | 'A5';
    template: string;
    font: string;
    fontSize: number;
  };
};

export const fallbackTemplates: RenderTemplate[] = renderTemplateCatalog.map(
  (item) => ({ ...item }),
);

export const fallbackFonts: RenderFont[] = [
  { id: 'plex', label: 'IBM Plex' },
  { id: 'heros', label: 'TeX Gyre Heros (Helvetica)' },
  { id: 'bonum', label: 'TeX Gyre Bonum (Bookman)' },
  { id: 'schola', label: 'TeX Gyre Schola (Schoolbook)' },
  { id: 'libertinus', label: 'Libertinus' },
];

export const previewFontFamilies: Record<string, string> = {
  plex: '"IBM Plex Serif", Georgia, serif',
  heros: 'Helvetica, Arial, sans-serif',
  bonum: 'Bookman, "URW Bookman", Georgia, serif',
  schola: '"Century Schoolbook", Georgia, serif',
  libertinus: 'Libertinus Serif, "Times New Roman", serif',
};
