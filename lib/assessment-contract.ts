export type RichTextNode =
  | { type: 'paragraph'; text: string }
  | { type: 'math'; tex: string }
  | { type: 'image'; assetId: string; alt: string };

export type AssessmentQuestionSnapshot = {
  id: string;
  sourceQuestionId: string;
  sourceRevision: number;
  number: number;
  type: 'single_choice' | 'multiple_choice' | 'short_answer' | 'essay';
  statement: RichTextNode[];
  alternatives: Array<{ stableKey: string; label: string; content: RichTextNode[] }>;
  answer: { correctStableKeys: string[]; explanation?: RichTextNode[] };
  points: number;
  skills: Array<{ code: string; primary: boolean }>;
};

export type AssessmentRenderContract = {
  schemaVersion: '1.0';
  assessment: { id: string; title: string; subject: string; grade: string; instructions: string[] };
  institution: { id: string; name: string; logoAssetId?: string };
  version: { id: string; code: string; seed: number; generatedAt: string };
  candidateFields: Array<'name' | 'class' | 'number' | 'date'>;
  questions: AssessmentQuestionSnapshot[];
  totals: { points: number; questions: number };
  render: { locale: 'pt-BR'; paper: 'A4'; mode: 'student' | 'teacher' | 'answer-sheet'; template: string };
};
