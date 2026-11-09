import { type CurriculumOption } from './curriculum-manager';
import { type RichContentBlock } from './rich-content-editor';

export type Question = {
  recommendSingleColumn?: boolean;
  hasResolution?: boolean;
  id: string;
  code: string;
  statement: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'essay';
  subject: string;
  grade: string;
  stage: 'Ensino Fundamental' | 'Ensino Médio';
  sourceInstitution: string;
  sourceYear: number;
  skill: string;
  knowledgeObjectId?: string;
  knowledgeObject?: string;
  knowledgeTopic?: string;
  pedagogicalTopicId?: string;
  competencyId?: string;
  competencyNumber?: number;
  saebDescriptorId?: string;
  saebDescriptorCode?: string;
  saebDescriptorDescription?: string;
  difficulty: 'Fácil' | 'Média' | 'Difícil';
  status:
    | 'Aprovada'
    | 'Em revisão'
    | 'Precisa de ajustes'
    | 'Rascunho'
    | 'Arquivada';
  createdBy?: string;
  revision?: number;
  alternatives: number;
  updatedAt: string;
};

export type QuestionDraftInput = {
  recommendSingleColumn?: boolean;
  type?: Question['type'];
  subject?: string;
  grade?: string;
  sourceInstitution?: string;
  sourceYear?: number | string;
  knowledgeObjectId?: string;
  competencyId?: string;
  saebDescriptorId?: string;
  pedagogicalDisciplineId?: string;
  pedagogicalTopicId?: string;
  knowledgeTopic?: string;
  skill?: string;
  difficulty?: string;
  metapostCode?: string;
  answerBlocks?: RichContentBlock[];
  statementBlocks?: RichContentBlock[];
  alternatives?: Array<{
    isCorrect: boolean;
    stableKey: string;
    contentBlocks: RichContentBlock[];
  }>;
};

export type QuestionDraftEditor = {
  educationStage?: 'Ensino Fundamental' | 'Ensino Médio';
  knowledgeAreaFilter?: string;
  editingQuestionId?: string;
  importCandidateSource?: { importId: string; candidateId: string } | null;
  pedagogicalGrade?: string;
  fundamentalGrade?: string;
  pedagogicalObjectId?: string;
  pedagogicalSubtopicId?: string;
  pedagogicalDetailId?: string;
  selectedSaebMatrix?: string;
};

export type EditableQuestionData = Question & {
  statement: RichContentBlock[];
  explanation?: RichContentBlock[];
  alternatives: Array<{
    isCorrect: boolean;
    stableKey: string;
    content: string;
    contentBlocks: RichContentBlock[];
  }>;
  saebDescriptors?: Array<{ matrixId: string; id: string }>;
};

export type QuestionFilterOptions = {
  sourceInstitutions: string[];
  sourceYears: number[];
  difficulties: Array<{ id: 'easy' | 'medium' | 'hard'; label: string }>;
};

export type HighSchoolCurriculumItem = {
  area_source_key: string;
  competency_id: string;
  competency_number: number;
  competency_description: string;
  skill_id: string;
  skill_code: string;
  skill_description: string;
  grade_range: string;
};

export type PedagogicalDiscipline = {
  id: string;
  discipline_id?: string;
  name: string;
  area_source_key?: string;
  skills: Array<{ id: string; code: string }>;
  stage?: 'Ensino Fundamental' | 'Ensino Médio';
};

export type PedagogicalTopic = {
  id: string;
  name: string;
  discipline_id: string;
  discipline: string;
  parent_id: string | null;
  parent_name: string | null;
  grade_range: string;
  depth: number;
  path: string;
  skills?: Array<{ id: string; code: string; description: string }>;
};

export function normalizeGradeLabel(value: string | null | undefined) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  const match = text.match(/([123])/);
  return match && /(?:ano|s[ée]rie)/i.test(text)
    ? `${match[1]}ª série`
    : value || '';
}

export type SaebMatrix = {
  id: string;
  stage: 'Ensino Fundamental' | 'Ensino Médio';
  subject: string;
  grade_range: string;
  version: string;
};

export type SaebDescriptor = {
  id: string;
  code: string;
  description: string;
  topic: string;
  matrix_id: string;
};

export const curriculumDemo: CurriculumOption[] = [
  {
    subject_id: '30000000-0000-4000-8000-000000000001',
    subject: 'Química',
    stage: 'Ensino Médio',
    grade_range: '1ª série',
    knowledge_object_id: '40000000-0000-4000-8000-000000000001',
    knowledge_object: 'Transformações químicas e conservação da matéria',
    skill_code: 'EM13CNT101',
    skill_description:
      'Analisar transformações e conservações em sistemas que envolvem matéria e energia.',
  },
  {
    subject_id: '30000000-0000-4000-8000-000000000001',
    subject: 'Química',
    stage: 'Ensino Médio',
    grade_range: '1ª série',
    knowledge_object_id: '40000000-0000-4000-8000-000000000002',
    knowledge_object: 'Estrutura da matéria e propriedades dos materiais',
    skill_code: 'EM13CNT104',
    skill_description:
      'Avaliar propriedades de materiais com base em modelos explicativos.',
  },
  {
    subject_id: '30000000-0000-4000-8000-000000000002',
    subject: 'Matemática',
    stage: 'Ensino Fundamental',
    grade_range: '7º ano',
    knowledge_object_id: '40000000-0000-4000-8000-000000000003',
    knowledge_object: 'Números inteiros',
    skill_code: 'EF07MA02',
    skill_description: 'Resolver e elaborar problemas com números inteiros.',
  },
];

export const initialQuestions: Question[] = [
  {
    id: '1',
    code: 'MAT-0018',
    subject: 'Matemática',
    grade: '7º ano',
    stage: 'Ensino Fundamental',
    sourceInstitution: 'ENEM',
    sourceYear: 2023,
    statement:
      'Uma escola organizou 240 livros em 8 estantes com a mesma quantidade. Quantos livros ficaram em cada estante?',
    type: 'single_choice',
    skill: 'EF07MA02',
    knowledgeObjectId: '40000000-0000-4000-8000-000000000003',
    knowledgeObject: 'Números inteiros',
    difficulty: 'Fácil',
    status: 'Aprovada',
    alternatives: 4,
    updatedAt: 'Hoje, 09:42',
  },
  {
    id: '2',
    code: 'LP-0041',
    subject: 'Língua Portuguesa',
    grade: '8º ano',
    stage: 'Ensino Fundamental',
    sourceInstitution: 'FUVEST',
    sourceYear: 2024,
    statement:
      'No trecho apresentado, qual recurso produz o efeito de humor no último parágrafo?',
    type: 'single_choice',
    skill: 'EF89LP05',
    difficulty: 'Média',
    status: 'Em revisão',
    alternatives: 5,
    updatedAt: 'Ontem, 16:20',
  },
  {
    id: '3',
    code: 'CIE-0027',
    subject: 'Ciências',
    grade: '6º ano',
    stage: 'Ensino Fundamental',
    sourceInstitution: 'UEMS',
    sourceYear: 2022,
    statement:
      'Qual transformação de energia ocorre principalmente durante o funcionamento de uma lâmpada?',
    type: 'multiple_choice',
    skill: 'EF06CI04',
    difficulty: 'Média',
    status: 'Aprovada',
    alternatives: 4,
    updatedAt: '30 ago, 11:08',
  },
  {
    id: '4',
    code: 'HIS-0012',
    subject: 'História',
    grade: '9º ano',
    stage: 'Ensino Fundamental',
    sourceInstitution: 'UFMS',
    sourceYear: 2021,
    statement:
      'A partir da fonte histórica, identifique uma característica do processo de industrialização brasileiro.',
    type: 'essay',
    skill: 'EF09HI05',
    difficulty: 'Difícil',
    status: 'Rascunho',
    alternatives: 0,
    updatedAt: '28 ago, 14:31',
  },
];

export const highSchoolSubjectAreas: Record<string, string[]> = {
  'Linguagens e suas Tecnologias': [
    'Língua Portuguesa',
    'Arte',
    'Educação Física',
    'Língua Inglesa',
  ],
  'Matemática e suas Tecnologias': ['Matemática'],
  'Ciências da Natureza e suas Tecnologias': ['Biologia', 'Física', 'Química'],
  'Ciências Humanas e Sociais Aplicadas': [
    'História',
    'Geografia',
    'Sociologia',
    'Filosofia',
  ],
};

export const elementarySubjectAreas: Record<string, string[]> = {
  Linguagens: [
    'Língua Portuguesa',
    'Arte',
    'Educação Física',
    'Língua Inglesa',
  ],
  Matemática: ['Matemática'],
  'Ciências da Natureza': ['Ciências'],
  'Ciências Humanas': ['História', 'Geografia'],
  'Ensino Religioso': ['Ensino Religioso'],
};

export function difficultyClass(value: Question['difficulty']) {
  if (value === 'Fácil')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'Difícil') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}
