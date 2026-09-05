'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpenCheck,
  CircleHelp,
  FileOutput,
  Eye,
  GraduationCap,
  Info,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AssessmentBuilder } from './assessment-builder';
import { CurriculumManager, type CurriculumOption } from './curriculum-manager';
import { RichContentEditor } from './rich-content-editor';
import { AcademicManager } from './academic-manager';
import { apiFetch } from '@/lib/api-client';
import { AuthScreen, type AuthIdentity } from './auth-screen';
import { SettingsManager } from './settings-manager';
import {
  QuestionPasteImporter,
  type ParsedQuestion,
} from './question-paste-importer';

type Question = {
  id: string;
  code: string;
  statement: string;
  type: 'single_choice' | 'multiple_choice' | 'essay';
  subject: string;
  grade: string;
  stage: 'Ensino Fundamental' | 'Ensino Médio';
  sourceInstitution: string;
  sourceYear: number;
  skill: string;
  knowledgeObjectId?: string;
  knowledgeObject?: string;
  knowledgeTopic?: string;
  competencyId?: string;
  competencyNumber?: number;
  difficulty: 'Fácil' | 'Média' | 'Difícil';
  status: 'Aprovada' | 'Em revisão' | 'Rascunho' | 'Arquivada';
  alternatives: number;
  updatedAt: string;
};

type QuestionFilterOptions = {
  sourceInstitutions: string[];
  sourceYears: number[];
  difficulties: Array<{ id: 'easy' | 'medium' | 'hard'; label: string }>;
};
type HighSchoolCurriculumItem = {
  area_source_key: string;
  competency_id: string;
  competency_number: number;
  competency_description: string;
  skill_id: string;
  skill_code: string;
  skill_description: string;
  grade_range: string;
};
type PedagogicalDiscipline = {
  id: string;
  discipline_id?: string;
  name: string;
  area_source_key?: string;
  skills: Array<{ id: string; code: string }>;
};
type PedagogicalTopic = {
  id: string;
  name: string;
  discipline_id: string;
  discipline: string;
  parent_id: string | null;
  parent_name: string | null;
};
const curriculumDemo: CurriculumOption[] = [
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

const chemistryKnowledgeTopics = {
  Termoquímica: ['Lei de Hess', 'Entalpia de Formação', 'Entalpia de Ligação'],
  Eletroquímica: ['NOX', 'Lei de Faraday'],
} as const;

const initialQuestions: Question[] = [
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

const nav = [
  ['Visão geral', LayoutDashboard],
  ['Questões', LibraryBig],
  ['Planejamento', BookOpenCheck],
  ['Avaliações', FileOutput],
  ['Turmas e alunos', Users],
  ['Resultados', BarChart3],
] as const;
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || '';

function difficultyClass(value: Question['difficulty']) {
  if (value === 'Fácil')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'Difícil') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function Home() {
  const [apiUrl, setApiUrl] = useState('');
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [questions, setQuestions] = useState(initialQuestions);
  const [query, setQuery] = useState('');
  const [educationStage, setEducationStage] = useState<
    'Ensino Fundamental' | 'Ensino Médio'
  >('Ensino Fundamental');
  const [subject, setSubject] = useState('Todas');
  const [knowledgeObjectFilter, setKnowledgeObjectFilter] = useState('');
  const [competencyFilter, setCompetencyFilter] = useState('');
  const [topicGroupFilter, setTopicGroupFilter] = useState('');
  const [subtopicFilter, setSubtopicFilter] = useState('');
  const [sourceInstitutionFilter, setSourceInstitutionFilter] = useState('');
  const [sourceYearFilter, setSourceYearFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [filterOptions, setFilterOptions] = useState<QuestionFilterOptions>({
    sourceInstitutions: [],
    sourceYears: [],
    difficulties: [
      { id: 'easy', label: 'Fácil' },
      { id: 'medium', label: 'Média' },
      { id: 'hard', label: 'Difícil' },
    ],
  });
  const [open, setOpen] = useState(false);
  const [importedQuestion, setImportedQuestion] =
    useState<ParsedQuestion | null>(null);
  const [importRevision, setImportRevision] = useState(0);
  const [editingQuestionId, setEditingQuestionId] = useState('');
  const [importedCorrect, setImportedCorrect] = useState<string[]>([]);
  const [importedAnswerBlocks, setImportedAnswerBlocks] = useState<any[]>([]);
  const [importedDetails, setImportedDetails] = useState({
    grade: '',
    skill: '',
    knowledgeTopic: '',
    difficulty: 'Média',
  });
  const [questionType, setQuestionType] =
    useState<Question['type']>('single_choice');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [questionPreviewUrl, setQuestionPreviewUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [active, setActive] = useState('Questões');
  const [curriculum, setCurriculum] = useState(curriculumDemo);
  const [highSchoolCurriculum, setHighSchoolCurriculum] = useState<
    HighSchoolCurriculumItem[]
  >([]);
  const [pedagogicalDisciplines, setPedagogicalDisciplines] = useState<
    PedagogicalDiscipline[]
  >([]);
  const [pedagogicalTopics, setPedagogicalTopics] = useState<
    PedagogicalTopic[]
  >([]);
  const [discipline, setDiscipline] = useState('Química');
  const [knowledgeObjectId, setKnowledgeObjectId] = useState(
    curriculumDemo[0].knowledge_object_id || '',
  );
  const [competencyId, setCompetencyId] = useState('');
  const [competencyInfoOpen, setCompetencyInfoOpen] = useState(false);
  const [selectedSkillCode, setSelectedSkillCode] = useState('');
  const [skillInfoOpen, setSkillInfoOpen] = useState(false);
  const [knowledgeTopicGroup, setKnowledgeTopicGroup] =
    useState<keyof typeof chemistryKnowledgeTopics>('Termoquímica');
  const [knowledgeSubtopic, setKnowledgeSubtopic] =
    useState<string>('Lei de Hess');
  const pedagogicalDiscipline = pedagogicalDisciplines.find(
    (item) => item.name === discipline,
  );
  const availableCompetencies = [
    ...new Map(
      highSchoolCurriculum
        .filter(
          (item) =>
            !pedagogicalDiscipline?.area_source_key ||
            item.area_source_key === pedagogicalDiscipline.area_source_key,
        )
        .map((item) => [item.competency_id, item]),
    ).values(),
  ];
  const selectedCompetencyInfo = availableCompetencies.find(
    (item) => item.competency_id === competencyId,
  );
  const availableSkills = pedagogicalDiscipline
    ? highSchoolCurriculum.filter(
        (item) =>
          item.competency_id === competencyId &&
          pedagogicalDiscipline.skills.some(
            (skill) => skill.id === item.skill_id,
          ),
      )
    : curriculum.filter(
        (item) =>
          item.knowledge_object_id === knowledgeObjectId &&
          Boolean(item.skill_code),
      );
  const selectedSkillInfo =
    availableSkills.find((item) => item.skill_code === selectedSkillCode) ||
    availableSkills[0];

  useEffect(() => {
    if (
      availableSkills.length &&
      !availableSkills.some((item) => item.skill_code === selectedSkillCode)
    )
      setSelectedSkillCode(availableSkills[0].skill_code || '');
  }, [availableSkills, selectedSkillCode]);
  const visible = useMemo(
    () =>
      questions.filter(
        (q) =>
          `${q.statement} ${q.code} ${q.skill} ${q.sourceInstitution} ${q.sourceYear}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          q.stage === educationStage &&
          (subject === 'Todas' || q.subject === subject) &&
          (!knowledgeObjectFilter ||
            q.knowledgeObjectId === knowledgeObjectFilter) &&
          (!competencyFilter || q.competencyId === competencyFilter) &&
          (!topicGroupFilter ||
            q.knowledgeTopic?.startsWith(topicGroupFilter)) &&
          (!subtopicFilter ||
            q.knowledgeTopic === `${topicGroupFilter} > ${subtopicFilter}`) &&
          (!sourceInstitutionFilter ||
            q.sourceInstitution === sourceInstitutionFilter) &&
          (!sourceYearFilter || q.sourceYear === Number(sourceYearFilter)) &&
          (!difficultyFilter || q.difficulty === difficultyFilter),
      ),
    [
      questions,
      query,
      educationStage,
      subject,
      knowledgeObjectFilter,
      competencyFilter,
      topicGroupFilter,
      subtopicFilter,
      sourceInstitutionFilter,
      sourceYearFilter,
      difficultyFilter,
    ],
  );

  useEffect(() => {
    const fallback = `${window.location.protocol}//${window.location.hostname}:8788`;
    try {
      const target = new URL(configuredApiUrl || fallback);
      // Usa o mesmo host aberto pelo usuário. Assim o cookie funciona tanto em
      // localhost quanto no celular pela rede local.
      target.hostname = window.location.hostname;
      setApiUrl(target.origin);
    } catch {
      setApiUrl(fallback);
    }
  }, []);

  useEffect(() => {
    if (!apiUrl) return;
    apiFetch(`${apiUrl}/api/auth/me`)
      .then(async (response) => {
        if (!response.ok) return null;
        return ((await response.json()) as { data: AuthIdentity }).data;
      })
      .then(setIdentity)
      .finally(() => setAuthReady(true));
  }, [apiUrl]);

  useEffect(() => {
    if (!apiUrl || !identity) return;
    apiFetch(`${apiUrl}/api/questions`)
      .then((response) => {
        if (!response.ok) throw new Error('API indisponível');
        return response.json() as Promise<{ data: Question[] }>;
      })
      .then((body) => setQuestions(body.data))
      .catch(() =>
        setNotice('API local indisponível; exibindo dados de demonstração.'),
      );
  }, [apiUrl, identity]);

  useEffect(() => {
    if (!apiUrl || !identity) return;
    Promise.all([
      apiFetch(`${apiUrl}/api/curriculum/high-school`).then(
        (response) =>
          response.json() as Promise<{ data: HighSchoolCurriculumItem[] }>,
      ),
      apiFetch(`${apiUrl}/api/curriculum/pedagogical-disciplines`).then(
        (response) =>
          response.json() as Promise<{ data: PedagogicalDiscipline[] }>,
      ),
      apiFetch(`${apiUrl}/api/curriculum/pedagogical-topics`).then(
        (response) => response.json() as Promise<{ data: PedagogicalTopic[] }>,
      ),
    ])
      .then(([official, pedagogical, topics]) => {
        setHighSchoolCurriculum(official.data || []);
        setPedagogicalDisciplines(
          (pedagogical.data || []).map((item) => ({
            ...item,
            id: item.id || item.discipline_id || '',
          })),
        );
        setPedagogicalTopics(topics.data || []);
        if (pedagogical.data?.some((item) => item.name === 'Química')) {
          setKnowledgeObjectId('');
          setCompetencyId(
            official.data?.find(
              (item) => item.area_source_key === 'em-area-cnt',
            )?.competency_id || '',
          );
        }
      })
      .catch(() => undefined);
  }, [apiUrl, identity]);

  useEffect(() => {
    if (!apiUrl || !identity) return;
    apiFetch(`${apiUrl}/api/curriculum`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ data: CurriculumOption[] }>)
          : Promise.reject(),
      )
      .then((body) => body.data?.length && setCurriculum(body.data))
      .catch(() => undefined);
  }, [apiUrl, identity]);

  useEffect(() => {
    if (!apiUrl || !identity) return;
    apiFetch(`${apiUrl}/api/question-filters`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ data: QuestionFilterOptions }>)
          : Promise.reject(),
      )
      .then((body) => setFilterOptions(body.data))
      .catch(() => undefined);
  }, [apiUrl, identity]);

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = questionInputFromForm(data);
    setSaving(true);
    setNotice('');
    try {
      if (apiUrl) {
        const response = await apiFetch(
          editingQuestionId
            ? `${apiUrl}/api/questions/${editingQuestionId}/revisions`
            : `${apiUrl}/api/questions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          },
        );
        const body = (await response.json()) as {
          data: Question;
          error?: string;
          issues?: Array<{ path?: Array<string | number>; message: string }>;
        };
        if (!response.ok) {
          const details = body.issues
            ?.map((issue) => {
              const field = issue.path?.length
                ? ` (${issue.path.join(' → ')})`
                : '';
              return `${issue.message}${field}`;
            })
            .join(' ');
          throw new Error(
            details || body.error || 'Não foi possível salvar a questão.',
          );
        }
        const refreshed = await apiFetch(`${apiUrl}/api/questions`);
        if (refreshed.ok)
          setQuestions(((await refreshed.json()) as { data: Question[] }).data);
        setNotice(
          editingQuestionId
            ? 'Nova revisão da questão salva.'
            : 'Questão salva no PostgreSQL.',
        );
      } else {
        setNotice('A API precisa estar ativa para salvar a questão.');
      }
      setOpen(false);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Erro ao salvar a questão.',
      );
    } finally {
      setSaving(false);
    }
  }

  function questionInputFromForm(data: FormData) {
    const formString = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const correct = new Set(data.getAll('correct').map(String));
    const parseBlocks = (name: string) => {
      const blocks = (
        JSON.parse(String(data.get(name) || '[]')) as Array<{
          type: string;
          text?: string;
          items?: string[];
        }>
      ).map((block) =>
        block.type === 'romanList'
          ? {
              ...block,
              items: (block.items || [])
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : block,
      );
      return blocks
        .filter(
          (block) => block.type !== 'paragraph' || Boolean(block.text?.trim()),
        )
        .filter(
          (block) => block.type !== 'romanList' || Boolean(block.items?.length),
        );
    };
    const statementBlocks = parseBlocks('statementBlocks');
    const answerBlocks = parseBlocks('answerBlocks');
    const plainText = (
      blocks: Array<{ type: string; text?: string }>,
      fallback: string,
    ) => blocks.find((block) => block.type === 'paragraph')?.text || fallback;
    return {
      type: questionType,
      statement: plainText(statementBlocks, 'Conteúdo científico estruturado.'),
      statementBlocks,
      metapostCode: formString('metapostCode'),
      answerGuide: plainText(answerBlocks, ''),
      answerBlocks:
        answerBlocks.some((block) => block.text) ||
        answerBlocks.some((block) => block.type !== 'paragraph')
          ? answerBlocks
          : undefined,
      subject: formString('subject'),
      grade: formString('grade'),
      sourceInstitution: formString('sourceInstitution'),
      sourceYear: Number(data.get('sourceYear')),
      knowledgeObjectId: formString('knowledgeObjectId'),
      competencyId: formString('competencyId'),
      pedagogicalDisciplineId: formString('pedagogicalDisciplineId'),
      pedagogicalTopicId: formString('pedagogicalTopicId'),
      knowledgeTopic: formString('knowledgeTopic'),
      skill: formString('skill'),
      difficulty: formString('difficulty'),
      alternatives:
        questionType === 'essay'
          ? []
          : ['A', 'B', 'C', 'D', 'E'].map((letter, index) => {
              const contentBlocks = parseBlocks(`alternative_${letter}`);
              return {
                stableKey: `alt-${letter.toLowerCase()}`,
                content: plainText(
                  contentBlocks,
                  'Alternativa com conteúdo científico.',
                ),
                contentBlocks,
                isCorrect: correct.has(letter),
                position: index + 1,
              };
            }),
    };
  }

  async function previewQuestion(form: HTMLFormElement) {
    setPreviewing(true);
    setNotice('');
    try {
      const response = await apiFetch(`${apiUrl}/api/questions/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(questionInputFromForm(new FormData(form))),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || 'Não foi possível gerar a prévia.');
      }
      const nextUrl = URL.createObjectURL(await response.blob());
      setQuestionPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Erro ao gerar a prévia.',
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function editQuestion(questionId: string) {
    setNotice('Carregando questão...');
    try {
      const response = await apiFetch(`${apiUrl}/api/questions/${questionId}`);
      const body = (await response.json()) as { data?: any; error?: string };
      if (!response.ok || !body.data)
        throw new Error(body.error || 'Questão não encontrada.');
      const question = body.data;
      const skillCode = question.skills?.[0]?.code || '';
      const [topicGroup, subtopic] = String(
        question.knowledgeTopic || '',
      ).split(/\s*>\s*/, 2);
      const competency = highSchoolCurriculum.find(
        (item) => item.skill_code === skillCode,
      );
      setEditingQuestionId(question.id);
      setQuestionType(question.type);
      setDiscipline(question.subject);
      setKnowledgeObjectId(question.skills?.[0]?.knowledgeObjectId || '');
      setCompetencyId(competency?.competency_id || '');
      setCompetencyInfoOpen(false);
      setSelectedSkillCode(skillCode);
      if (topicGroup in chemistryKnowledgeTopics) {
        setKnowledgeTopicGroup(
          topicGroup as keyof typeof chemistryKnowledgeTopics,
        );
        setKnowledgeSubtopic(
          subtopic ||
            chemistryKnowledgeTopics[
              topicGroup as keyof typeof chemistryKnowledgeTopics
            ][0],
        );
      }
      setImportedCorrect(
        question.alternatives
          .filter((item: any) => item.isCorrect)
          .map((item: any) => item.stableKey.slice(-1).toUpperCase()),
      );
      setImportedAnswerBlocks(question.explanation || []);
      setImportedDetails({
        grade: question.grade,
        skill: skillCode,
        knowledgeTopic: question.knowledgeTopic || '',
        difficulty:
          (
            { easy: 'Fácil', medium: 'Média', hard: 'Difícil' } as Record<
              string,
              string
            >
          )[question.difficulty] || question.difficulty,
      });
      setImportedQuestion({
        sourceInstitution: question.sourceInstitution,
        sourceYear: String(question.sourceYear),
        statementBlocks: question.statement,
        alternatives: Object.fromEntries(
          question.alternatives.map((item: any) => [
            item.stableKey.slice(-1).toUpperCase(),
            item.content,
          ]),
        ),
        warnings: [],
      });
      setImportRevision((value) => value + 1);
      setQuestionPreviewUrl('');
      setOpen(true);
      setNotice('');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Erro ao carregar a questão.',
      );
    }
  }

  async function removeQuestion(question: Question) {
    if (
      !window.confirm(
        `Excluir ${question.code}? Ela sairá do acervo, mas o histórico de provas será preservado.`,
      )
    )
      return;
    try {
      const response = await apiFetch(
        `${apiUrl}/api/questions/${question.id}`,
        { method: 'DELETE' },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível excluir a questão.');
      setQuestions((current) =>
        current.filter((item) => item.id !== question.id),
      );
      setNotice(`${question.code} foi excluída do acervo.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Erro ao excluir a questão.',
      );
    }
  }

  function openNewQuestion() {
    setEditingQuestionId('');
    setImportedQuestion(null);
    setImportedCorrect([]);
    setImportedAnswerBlocks([]);
    setImportedDetails({
      grade: '',
      skill: '',
      knowledgeTopic: '',
      difficulty: 'Média',
    });
    setQuestionType('single_choice');
    setQuestionPreviewUrl('');
    setSelectedSkillCode('');
    setSkillInfoOpen(false);
    setCompetencyInfoOpen(false);
    setKnowledgeTopicGroup('Termoquímica');
    setKnowledgeSubtopic('Lei de Hess');
    setImportRevision((value) => value + 1);
    setOpen(true);
  }

  if (!authReady)
    return (
      <main className="grid min-h-screen place-items-center">
        Carregando...
      </main>
    );
  if (!identity) return <AuthScreen apiUrl={apiUrl} />;

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] border-r border-slate-200 bg-[var(--navy)] text-white lg:flex lg:flex-col">
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
          <span className="grid size-10 place-items-center rounded-xl bg-[var(--lime)] text-[var(--navy)]">
            <GraduationCap className="size-5" />
          </span>
          <div>
            <p className="font-display text-[17px] font-bold leading-tight">
              Caderno
            </p>
            <p className="text-[11px] font-medium tracking-[.12em] text-slate-400">
              AVALIAÇÕES BNCC
            </p>
          </div>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 px-3 py-6">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">
            Espaço de trabalho
          </p>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              onClick={() =>
                (label === 'Questões' ||
                  label === 'Planejamento' ||
                  label === 'Avaliações' ||
                  label === 'Turmas e alunos') &&
                setActive(label)
              }
              className={`mb-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${active === label ? 'bg-white/12 text-white' : 'text-slate-300 hover:bg-white/7 hover:text-white'}`}
            >
              <Icon className="size-[18px]" />
              {label}
              {label === 'Questões' && (
                <span className="ml-auto rounded-full bg-[var(--lime)] px-2 py-0.5 text-[10px] font-bold text-[var(--navy)]">
                  248
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => setActive('Configurações')}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/7"
          >
            <Settings className="size-[18px]" />
            Configurações
          </button>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-white/6 p-3">
            <span className="grid size-9 place-items-center rounded-full bg-cyan-200 text-xs font-bold text-cyan-950">
              {identity.user.displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((name) => name[0])
                .join('')
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {identity.user.displayName}
              </p>
              <p className="truncate text-xs text-slate-400">
                {identity.role === 'admin'
                  ? 'Administrador'
                  : identity.role === 'coordinator'
                    ? 'Coordenador'
                    : 'Professor'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Sair"
              className="ml-auto text-slate-400 hover:text-white"
              onClick={() =>
                apiFetch(`${apiUrl}/api/auth/logout`, { method: 'POST' }).then(
                  () => window.location.reload(),
                )
              }
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <section className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center border-b border-slate-200 bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--navy)] text-white">
              <GraduationCap className="size-5" />
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Ajuda">
              <CircleHelp />
            </Button>
            <div className="ml-2 hidden border-l border-slate-200 pl-4 sm:block">
              <p className="text-xs font-semibold">
                {identity.institution.name}
              </p>
              <p className="text-[11px] text-slate-500">Ano letivo 2026</p>
            </div>
          </div>
        </header>
        {active === 'Avaliações' ? (
          <AssessmentBuilder
            questions={questions.filter(
              (question) => question.status !== 'Arquivada',
            )}
            apiUrl={apiUrl}
          />
        ) : active === 'Turmas e alunos' ? (
          <AcademicManager apiUrl={apiUrl} />
        ) : active === 'Configurações' ? (
          <SettingsManager apiUrl={apiUrl} role={identity.role} />
        ) : active === 'Planejamento' ? (
          <CurriculumManager
            items={curriculum}
            apiUrl={apiUrl}
            onChange={setCurriculum}
          />
        ) : (
          <div className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[.15em] text-[var(--blue)]">
                  Banco institucional
                </p>
                <h1 className="font-display text-3xl font-bold tracking-[-.03em] text-[var(--navy)] sm:text-[38px]">
                  Banco de questões
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Cadastre unidades reutilizáveis, relacione habilidades da BNCC
                  e prepare questões para qualquer formato de avaliação.
                </p>
              </div>
              <Button
                onClick={openNewQuestion}
                size="lg"
                className="h-11 bg-[var(--blue)] px-4 text-white shadow-sm hover:bg-blue-700"
              >
                <Plus />
                Nova questão
              </Button>
            </div>
            {notice && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"
              >
                {notice}
              </div>
            )}
            <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(['Ensino Fundamental', 'Ensino Médio'] as const).map(
                (stage) => (
                  <Button
                    key={stage}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEducationStage(stage);
                      setSubject('Todas');
                      setKnowledgeObjectFilter('');
                      setCompetencyFilter('');
                      setTopicGroupFilter('');
                      setSubtopicFilter('');
                    }}
                    className={
                      educationStage === stage
                        ? 'bg-[var(--navy)] text-white hover:bg-[var(--navy)] hover:text-white'
                        : 'text-slate-600'
                    }
                  >
                    {stage}
                  </Button>
                ),
              )}
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['248', 'questões no acervo', '+12 este mês'],
                ['196', 'aprovadas', '79% do acervo'],
                ['37', 'habilidades cobertas', '8 componentes'],
              ].map(([value, label, note], index) => (
                <article
                  key={label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/4%)]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display text-3xl font-bold tracking-tight text-[var(--navy)]">
                        {value}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {label}
                      </p>
                    </div>
                    <span
                      className={`grid size-9 place-items-center rounded-xl ${index === 1 ? 'bg-emerald-50 text-emerald-600' : index === 2 ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}
                    >
                      {index === 0 ? (
                        <LibraryBig className="size-4" />
                      ) : index === 1 ? (
                        <BookOpenCheck className="size-4" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                    </span>
                  </div>
                  <p className="mt-4 text-xs text-slate-400">{note}</p>
                </article>
              ))}
            </div>
            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgb(15_23_42/4%)]">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-10 border-slate-200 bg-slate-50 pl-9"
                    placeholder="Buscar por enunciado, código ou habilidade..."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="subject">
                    Componente
                  </label>
                  <select
                    id="subject"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      setKnowledgeObjectFilter('');
                      setCompetencyFilter('');
                      setTopicGroupFilter('');
                      setSubtopicFilter('');
                    }}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="Todas">Todas as disciplinas</option>
                    {Array.from(
                      new Set(
                        curriculum
                          .filter((item) => item.stage === educationStage)
                          .map((item) => item.subject),
                      ),
                    ).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {subject === 'Química' ? (
                    <>
                      <select
                        aria-label="Competência específica"
                        value={competencyFilter}
                        onChange={(event) =>
                          setCompetencyFilter(event.target.value)
                        }
                        className="h-10 max-w-60 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="">Todas as competências</option>
                        {Array.from(
                          new Map(
                            highSchoolCurriculum.map((item) => [
                              item.competency_id,
                              item,
                            ]),
                          ).values(),
                        ).map((item) => (
                          <option
                            key={item.competency_id}
                            value={item.competency_id}
                          >
                            Competência {item.competency_number}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Objeto de conhecimento de Química"
                        value={topicGroupFilter}
                        onChange={(event) => {
                          setTopicGroupFilter(event.target.value);
                          setSubtopicFilter('');
                        }}
                        className="h-10 max-w-60 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="">Todos os objetos</option>
                        {Object.keys(chemistryKnowledgeTopics).map((topic) => (
                          <option key={topic}>{topic}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Subtópico de Química"
                        value={subtopicFilter}
                        disabled={!topicGroupFilter}
                        onChange={(event) =>
                          setSubtopicFilter(event.target.value)
                        }
                        className="h-10 max-w-60 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">Todos os subtópicos</option>
                        {topicGroupFilter &&
                          chemistryKnowledgeTopics[
                            topicGroupFilter as keyof typeof chemistryKnowledgeTopics
                          ].map((topic) => (
                            <option key={topic}>{topic}</option>
                          ))}
                      </select>
                    </>
                  ) : (
                    <select
                      aria-label="Objeto de conhecimento"
                      value={knowledgeObjectFilter}
                      onChange={(event) =>
                        setKnowledgeObjectFilter(event.target.value)
                      }
                      disabled={subject === 'Todas'}
                      className="h-10 max-w-60 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">Todos os objetos</option>
                      {Array.from(
                        new Map(
                          curriculum
                            .filter(
                              (item) =>
                                item.subject === subject &&
                                item.knowledge_object_id,
                            )
                            .map((item) => [item.knowledge_object_id, item]),
                        ).values(),
                      ).map((item) => (
                        <option
                          key={item.knowledge_object_id}
                          value={item.knowledge_object_id || ''}
                        >
                          {item.knowledge_object}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    aria-label="Instituição ou banca de origem"
                    value={sourceInstitutionFilter}
                    onChange={(event) =>
                      setSourceInstitutionFilter(event.target.value)
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="">Todas as instituições</option>
                    {(filterOptions.sourceInstitutions.length
                      ? filterOptions.sourceInstitutions
                      : Array.from(
                          new Set(
                            questions.map(
                              (question) => question.sourceInstitution,
                            ),
                          ),
                        )
                    ).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Ano da prova"
                    value={sourceYearFilter}
                    onChange={(event) =>
                      setSourceYearFilter(event.target.value)
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="">Todos os anos</option>
                    {(filterOptions.sourceYears.length
                      ? filterOptions.sourceYears
                      : Array.from(
                          new Set(
                            questions.map((question) => question.sourceYear),
                          ),
                        ).sort((a, b) => b - a)
                    ).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Nível de dificuldade"
                    value={difficultyFilter}
                    onChange={(event) =>
                      setDifficultyFilter(event.target.value)
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="">Todos os níveis</option>
                    {filterOptions.difficulties.map((item) => (
                      <option key={item.id} value={item.label}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {(subject !== 'Todas' ||
                    knowledgeObjectFilter ||
                    topicGroupFilter ||
                    subtopicFilter ||
                    sourceInstitutionFilter ||
                    sourceYearFilter ||
                    difficultyFilter) && (
                    <Button
                      variant="outline"
                      className="h-10 px-3"
                      onClick={() => {
                        setSubject('Todas');
                        setKnowledgeObjectFilter('');
                        setTopicGroupFilter('');
                        setSubtopicFilter('');
                        setSourceInstitutionFilter('');
                        setSourceYearFilter('');
                        setDifficultyFilter('');
                      }}
                    >
                      <X />
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-[.08em] text-slate-500">
                      <th className="w-[47%] px-5 py-3">Questão</th>
                      <th className="px-4 py-3">BNCC</th>
                      <th className="px-4 py-3">Dificuldade</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Atualização</th>
                      <th className="w-12 px-3 py-3">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((q) => (
                      <tr
                        key={q.id}
                        className="group border-b border-slate-100 last:border-0 hover:bg-blue-50/30"
                      >
                        <td className="px-5 py-4">
                          <div className="flex gap-3">
                            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 font-mono text-[10px] font-bold text-slate-500">
                              {q.type === 'essay'
                                ? 'DIS'
                                : `${q.alternatives}A`}
                            </span>
                            <div>
                              <div className="mb-1 flex items-center gap-2">
                                <span className="font-mono text-[11px] font-semibold text-[var(--blue)]">
                                  {q.code}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {q.subject} · {q.grade} ·{' '}
                                  {q.sourceInstitution} {q.sourceYear}
                                </span>
                              </div>
                              <p className="max-w-2xl text-sm font-medium leading-5 text-slate-800">
                                {q.statement}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            variant="outline"
                            className="border-violet-200 bg-violet-50 font-mono text-violet-700"
                          >
                            {q.skill}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            variant="outline"
                            className={difficultyClass(q.difficulty)}
                          >
                            {q.difficulty}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                            <span
                              className={`size-1.5 rounded-full ${q.status === 'Aprovada' ? 'bg-emerald-500' : q.status === 'Em revisão' ? 'bg-amber-500' : 'bg-slate-400'}`}
                            />
                            {q.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                          {q.updatedAt}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar ${q.code}`}
                              onClick={() => editQuestion(q.id)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              aria-label={`Excluir ${q.code}`}
                              onClick={() => removeQuestion(q)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visible.length && (
                  <div className="grid place-items-center px-6 py-16 text-center">
                    <Search className="mb-3 size-7 text-slate-300" />
                    <p className="font-semibold text-slate-700">
                      Nenhuma questão encontrada
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      Tente remover um filtro ou pesquisar outro termo.
                    </p>
                  </div>
                )}
              </div>
              <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-5 py-3 text-xs text-slate-500">
                <span>
                  Exibindo {visible.length} de {questions.length} questões desta
                  demonstração
                </span>
                <Button variant="ghost" size="sm">
                  Ver acervo completo
                </Button>
              </footer>
            </section>
          </div>
        )}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="h-full w-full max-w-[980px] overflow-y-auto bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.13em] text-[var(--blue)]">
                  Cadastro estruturado
                </p>
                <h2
                  id="dialog-title"
                  className="font-display mt-1 text-2xl font-bold text-[var(--navy)]"
                >
                  {editingQuestionId ? 'Editar questão' : 'Nova questão'}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
              >
                <X />
              </Button>
            </header>
            <form onSubmit={createQuestion} className="space-y-6 p-6">
              <QuestionPasteImporter
                onConfirm={(parsed) => {
                  setImportedQuestion(parsed);
                  setImportRevision((value) => value + 1);
                  setNotice(
                    'Análise aplicada. Revise os campos e selecione a resposta correta antes de salvar.',
                  );
                }}
              />
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                <strong>Unidade reutilizável.</strong> Classificação curricular,
                conteúdo e gabarito são gravados juntos na revisão da questão,
                sem decisões de layout.
              </div>
              <section>
                <div className="mb-3">
                  <p className="text-sm font-semibold">Tipo de questão</p>
                  <p className="mt-1 text-xs text-slate-500">
                    O tipo define as alternativas e a forma de correção; o
                    t-basicexam cuida apenas da apresentação.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['single_choice', 'Resposta única'],
                    ['multiple_choice', 'Múltiplas'],
                    ['essay', 'Discursiva'],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={questionType === value ? 'default' : 'outline'}
                      onClick={() => setQuestionType(value as Question['type'])}
                      className={
                        questionType === value
                          ? 'bg-[var(--blue)] text-white'
                          : ''
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </section>
              <section>
                <div className="mb-3">
                  <p className="text-sm font-semibold">
                    Classificação curricular
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {pedagogicalDiscipline
                      ? 'Disciplina pedagógica → Competência específica → Habilidade BNCC'
                      : 'Disciplina → Objeto de conhecimento → Habilidade BNCC'}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Disciplina
                    </span>
                    <select
                      required
                      name="subject"
                      value={discipline}
                      onChange={(event) => {
                        const next = event.target.value;
                        setDiscipline(next);
                        const pedagogical = pedagogicalDisciplines.find(
                          (item) => item.name === next,
                        );
                        setKnowledgeObjectId(
                          pedagogical
                            ? ''
                            : curriculum.find((item) => item.subject === next)
                                ?.knowledge_object_id || '',
                        );
                        setCompetencyId(
                          pedagogical
                            ? highSchoolCurriculum[0]?.competency_id || ''
                            : '',
                        );
                        setCompetencyInfoOpen(false);
                        setSelectedSkillCode('');
                        if (next === 'Química') {
                          setKnowledgeTopicGroup('Termoquímica');
                          setKnowledgeSubtopic('Lei de Hess');
                        }
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {[
                        ...new Set([
                          ...curriculum.map((item) => item.subject),
                          ...pedagogicalDisciplines.map((item) => item.name),
                        ]),
                      ].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Ano/Série
                    </span>
                    <select
                      name="grade"
                      key={`grade-${importRevision}`}
                      defaultValue={importedDetails.grade || undefined}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {(pedagogicalDiscipline
                        ? ['Ensino Médio (sem seriação)']
                        : [
                            ...new Set(
                              curriculum
                                .filter(
                                  (item) =>
                                    item.subject === discipline &&
                                    item.grade_range,
                                )
                                .map((item) => item.grade_range as string),
                            ),
                          ]
                      ).map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  {pedagogicalDiscipline ? (
                    <div className="space-y-4 sm:col-span-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold">
                          Competência específica da área
                        </span>
                        <input
                          type="hidden"
                          name="pedagogicalDisciplineId"
                          value={pedagogicalDiscipline.id}
                        />
                        <select
                          required
                          name="competencyId"
                          value={competencyId}
                          onChange={(event) => {
                            setCompetencyId(event.target.value);
                            setSelectedSkillCode('');
                            setSkillInfoOpen(false);
                            setCompetencyInfoOpen(false);
                          }}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                        >
                          {availableCompetencies.map((item) => (
                            <option
                              key={item.competency_id}
                              value={item.competency_id}
                            >
                              Competência {item.competency_number}
                            </option>
                          ))}
                        </select>
                        {selectedCompetencyInfo && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setCompetencyInfoOpen((open) => !open)
                              }
                              aria-expanded={competencyInfoOpen}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              <Info className="size-3.5" /> Informação da
                              competência
                            </button>
                            {competencyInfoOpen && (
                              <div
                                role="note"
                                className="mt-1 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950"
                              >
                                <strong>
                                  Competência{' '}
                                  {selectedCompetencyInfo.competency_number}
                                </strong>
                                <p className="mt-1">
                                  {
                                    selectedCompetencyInfo.competency_description
                                  }
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </label>
                      {discipline === 'Química' ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold">
                              Objeto de conhecimento
                            </span>
                            <select
                              value={knowledgeTopicGroup}
                              onChange={(event) => {
                                const group = event.target
                                  .value as keyof typeof chemistryKnowledgeTopics;
                                setKnowledgeTopicGroup(group);
                                setKnowledgeSubtopic(
                                  chemistryKnowledgeTopics[group][0],
                                );
                              }}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                            >
                              {Object.keys(chemistryKnowledgeTopics).map(
                                (topic) => (
                                  <option key={topic}>{topic}</option>
                                ),
                              )}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold">
                              Subtópico
                            </span>
                            <select
                              value={knowledgeSubtopic}
                              onChange={(event) =>
                                setKnowledgeSubtopic(event.target.value)
                              }
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                            >
                              {chemistryKnowledgeTopics[
                                knowledgeTopicGroup
                              ].map((topic) => (
                                <option key={topic}>{topic}</option>
                              ))}
                            </select>
                          </label>
                          <input
                            type="hidden"
                            name="knowledgeTopic"
                            value={`${knowledgeTopicGroup} > ${knowledgeSubtopic}`}
                          />
                          <input
                            type="hidden"
                            name="pedagogicalTopicId"
                            value={
                              pedagogicalTopics.find(
                                (topic) =>
                                  topic.discipline_id ===
                                    pedagogicalDiscipline.id &&
                                  topic.parent_name === knowledgeTopicGroup &&
                                  topic.name === knowledgeSubtopic,
                              )?.id || ''
                            }
                          />
                          <span className="text-xs text-slate-400 sm:col-span-2">
                            Classificação pedagógica: objeto de conhecimento →
                            subtópico.
                          </span>
                        </div>
                      ) : (
                        <label className="block">
                          <span className="mb-2 block text-sm font-semibold">
                            Tema ou objeto pedagógico
                          </span>
                          <Input
                            required
                            name="knowledgeTopic"
                            key={`topic-${importRevision}`}
                            defaultValue={importedDetails.knowledgeTopic}
                            placeholder="Ex.: Mecânica"
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <label className="block sm:col-span-2">
                      <span className="mb-2 block text-sm font-semibold">
                        Objeto de conhecimento
                      </span>
                      <select
                        required
                        name="knowledgeObjectId"
                        value={knowledgeObjectId}
                        onChange={(event) =>
                          setKnowledgeObjectId(event.target.value)
                        }
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        {curriculum
                          .filter(
                            (item, index, list) =>
                              item.subject === discipline &&
                              Boolean(item.knowledge_object_id) &&
                              list.findIndex(
                                (candidate) =>
                                  candidate.knowledge_object_id ===
                                  item.knowledge_object_id,
                              ) === index,
                          )
                          .map((item) => (
                            <option
                              key={item.knowledge_object_id || item.subject}
                              value={item.knowledge_object_id || ''}
                            >
                              {item.knowledge_object || 'Objeto sem nome'}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-semibold">
                      Habilidade BNCC
                    </span>
                    <select
                      required
                      name="skill"
                      value={selectedSkillCode}
                      onChange={(event) => {
                        setSelectedSkillCode(event.target.value);
                        setSkillInfoOpen(false);
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      {availableSkills.map((item) => (
                        <option
                          key={item.skill_code || 'skill'}
                          value={item.skill_code || ''}
                        >
                          {item.skill_code}
                        </option>
                      ))}
                    </select>
                    {selectedSkillInfo && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setSkillInfoOpen((open) => !open)}
                          aria-expanded={skillInfoOpen}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Info className="size-3.5" /> Informação da habilidade
                        </button>
                        {skillInfoOpen && (
                          <div
                            role="note"
                            className="mt-1 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950"
                          >
                            <strong className="font-mono">
                              {selectedSkillInfo.skill_code}
                            </strong>
                            <p className="mt-1">
                              {selectedSkillInfo.skill_description}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Dificuldade
                    </span>
                    <select
                      name="difficulty"
                      key={`difficulty-${importRevision}`}
                      defaultValue={importedDetails.difficulty}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option>Fácil</option>
                      <option>Média</option>
                      <option>Difícil</option>
                    </select>
                  </label>
                </div>
              </section>
              <section>
                <div className="mb-3">
                  <p className="text-sm font-semibold">Origem da questão</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Identificação da instituição proprietária e da prova
                    anterior
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-semibold">
                      Instituição proprietária
                    </span>
                    <Input
                      readOnly
                      value="Colégio Horizonte"
                      className="bg-slate-50 text-slate-600"
                    />
                    <span className="mt-1.5 block text-xs text-slate-400">
                      Definida pela conta autenticada e aplicada
                      automaticamente.
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Instituição/Banca de origem
                    </span>
                    <Input
                      required
                      name="sourceInstitution"
                      key={`source-${importRevision}`}
                      defaultValue={importedQuestion?.sourceInstitution || ''}
                      list="source-institutions"
                      placeholder="Ex.: ENEM"
                    />
                    <datalist id="source-institutions">
                      <option value="ENEM" />
                      <option value="FUVEST" />
                      <option value="UEMS" />
                      <option value="UFMS" />
                    </datalist>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      Ano da prova
                    </span>
                    <Input
                      required
                      name="sourceYear"
                      type="number"
                      min="1900"
                      max="2100"
                      key={`year-${importRevision}`}
                      defaultValue={importedQuestion?.sourceYear || '2024'}
                    />
                  </label>
                </div>
              </section>
              <RichContentEditor
                name="statementBlocks"
                label="Enunciado"
                required
                initialBlocks={importedQuestion?.statementBlocks}
                resetKey={importRevision}
              />
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">
                  Ilustração MetaPost (opcional)
                </span>
                <textarea
                  name="metapostCode"
                  rows={5}
                  spellCheck={false}
                  className="w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-6 text-cyan-100 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder={
                    'draw fullcircle scaled 2cm;\nlabel("A", origin);'
                  }
                />
                <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                  O worker insere este bloco em startMPcode. Comandos de acesso
                  externo, leitura de arquivos e execução de scripts são
                  bloqueados.
                </span>
              </label>
              {questionType !== 'essay' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Alternativas e gabarito
                    </span>
                    <Badge variant="secondary">
                      {questionType === 'single_choice'
                        ? 'Alternativas A–E · uma correta'
                        : 'Duas ou mais corretas'}
                    </Badge>
                  </div>
                  {['A', 'B', 'C', 'D', 'E'].map((letter) => (
                    <label
                      key={letter}
                      className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                    >
                      <input
                        required={
                          questionType === 'single_choice' && letter === 'A'
                        }
                        type={
                          questionType === 'single_choice'
                            ? 'radio'
                            : 'checkbox'
                        }
                        name="correct"
                        value={letter}
                        key={`correct-${letter}-${importRevision}`}
                        defaultChecked={importedCorrect.includes(letter)}
                        className="size-4 accent-blue-600"
                      />
                      <span className="grid size-7 place-items-center rounded-md bg-slate-100 text-xs font-bold">
                        {letter}
                      </span>
                      <div className="flex-1">
                        <RichContentEditor
                          name={`alternative_${letter}`}
                          compact
                          required
                          initialBlocks={importedQuestion?.alternatives[letter]}
                          resetKey={importRevision}
                        />
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <RichContentEditor
                name="answerBlocks"
                label={
                  questionType === 'essay'
                    ? 'Resposta esperada e critérios de correção'
                    : 'Resolução comentada (opcional)'
                }
                required={questionType === 'essay'}
                initialBlocks={importedAnswerBlocks}
                resetKey={importRevision}
              />
              <footer className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={previewing || !apiUrl}
                  onClick={(event) =>
                    previewQuestion(event.currentTarget.form!)
                  }
                >
                  <Eye className="size-4" />
                  {previewing ? 'Compilando...' : 'Prévia real em PDF'}
                </Button>
                <Button
                  disabled={saving}
                  type="submit"
                  className="bg-[var(--blue)] text-white hover:bg-blue-700"
                >
                  {saving ? 'Salvando...' : 'Salvar rascunho'}
                </Button>
              </footer>
              {questionPreviewUrl && (
                <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">
                      PDF compilado pelo ConTeXt
                    </strong>
                    <a
                      href={questionPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-blue-700 hover:underline"
                    >
                      Abrir em tela cheia
                    </a>
                  </div>
                  <iframe
                    title="Prévia real da questão em PDF"
                    src={questionPreviewUrl}
                    className="h-[620px] w-full rounded-lg border bg-white"
                  />
                </section>
              )}
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
