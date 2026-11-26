'use client';

import { useState } from 'react';
import {
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FileInput,
  FilePen,
  FileText,
  FolderOpen,
  FileOutput,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Library,
  ListTree,
  PenLine,
  ScanLine,
  School,
  Send,
  Settings,
  Sprout,
  Users,
  type LucideIcon,
} from 'lucide-react';

const preparation: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['Questões', LibraryBig],
  ['Avaliações', FileOutput],
  ['Planejamento', ListTree],
  ['Importar provas', FileInput],
];
const essay: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['Banco de Temas', Library],
  ['Cadastrar Tema', FilePen],
  ['Gerar Folha', FileText],
  ['Minhas Propostas', FolderOpen],
  ['Aplicar Redação', Send],
  ['Histórico', Clock],
  ['Corrigir Redações', ClipboardCheck],
  ['Painel de Redação', BarChart3],
];
const workflow: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['Corrigir', ScanLine],
  ['Diagnosticar', BarChart3],
  ['Recuperar', Sprout],
];

// Nomes exibidos no menu. As chaves continuam sendo os nomes internos das
// telas (usados por portal-screen e essay-manager); só o rótulo muda.
const displayLabel: Readonly<Record<string, string>> = {
  'Banco de Temas': 'Banco de temas',
  'Cadastrar Tema': 'Cadastrar tema',
  'Gerar Folha': 'Gerar folha',
  'Minhas Propostas': 'Minhas propostas',
  'Aplicar Redação': 'Aplicar redação',
  'Corrigir Redações': 'Corrigir redações',
  'Painel de Redação': 'Painel de redação',
};

export function WorkspaceNavigation({
  active,
  onNavigate,
  onLogout,
  canEditCatalog,
  portalAdmin,
  questionCount,
  showQuestionCount = true,
  mobile = false,
}: {
  active: string;
  onNavigate: (view: string) => void;
  onLogout?: () => void;
  canEditCatalog: boolean;
  portalAdmin: boolean;
  questionCount: number;
  showQuestionCount?: boolean;
  mobile?: boolean;
}) {
  const [preparationOverride, setPreparationOverride] = useState<
    boolean | null
  >(null);
  const [essayOverride, setEssayOverride] = useState<boolean | null>(null);
  const current = active === 'Resultados' ? 'Diagnosticar' : active;
  const inPreparation =
    current === 'Preparar' || preparation.some(([label]) => label === current);
  const inEssay = essay.some(([label]) => label === current);
  const preparationOpen = preparationOverride ?? inPreparation;
  const essayOpen = essayOverride ?? inEssay;
  const preparationItems = preparation.filter(
    ([label]) => label !== 'Importar provas' || canEditCatalog,
  );
  function navigate(label: string) {
    setPreparationOverride(null);
    setEssayOverride(null);
    onNavigate(label);
  }
  const muted = mobile ? 'text-slate-600' : 'text-slate-300';
  // Item atual: fundo leve e um traço de marca-texto à esquerda, para não
  // ser confundido com o realce de passagem do mouse.
  const selected = mobile
    ? 'bg-blue-50 text-blue-800 before:bg-blue-600'
    : 'bg-white/12 text-white before:bg-[var(--lime)]';
  const hover = mobile
    ? 'hover:bg-slate-100'
    : 'hover:bg-white/5 hover:text-white';
  const marker =
    "relative before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:content-['']";
  const row = `mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition`;
  function item(label: string, Icon: LucideIcon, nested = false) {
    return (
      <button
        key={label}
        type="button"
        onClick={() => navigate(label)}
        aria-current={current === label ? 'page' : undefined}
        className={`${row} ${current === label ? `${marker} ${selected}` : `${muted} ${hover}`} ${nested ? 'pl-4' : ''}`}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{displayLabel[label] ?? label}</span>
        {label === 'Questões' && showQuestionCount && (
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${mobile ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-300'}`}
          >
            {questionCount}
          </span>
        )}
      </button>
    );
  }
  function heading(label: string) {
    return (
      <p
        className={`mb-1.5 px-3 text-[13px] font-semibold ${mobile ? 'text-slate-500' : 'text-slate-400'}`}
      >
        {label}
      </p>
    );
  }
  function chevron(open: boolean) {
    return (
      <ChevronDown
        className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    );
  }
  const divider = `mt-4 border-t pt-4 ${mobile ? 'border-slate-200' : 'border-white/10'}`;
  const nestedList = `mb-3 ml-5 border-l pl-2 ${mobile ? 'border-slate-200' : 'border-white/15'}`;
  const essayId = mobile ? 'essay-mobile' : 'essay-desktop';
  return (
    <div>
      {item('Início', LayoutDashboard)}
      <div className={divider}>
        {heading('Fluxo de avaliação')}
        <div
          className={`mb-1 flex rounded-lg ${current === 'Preparar' ? `${marker} ${selected}` : inPreparation ? (mobile ? 'text-blue-800' : 'text-white') : ''}`}
        >
          <button
            type="button"
            onClick={() => navigate('Preparar')}
            aria-current={current === 'Preparar' ? 'page' : undefined}
            className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium ${inPreparation ? '' : `${muted} ${hover}`}`}
          >
            <BookOpenCheck
              className="size-[18px] shrink-0"
              aria-hidden="true"
            />
            Preparar
          </button>
          <button
            type="button"
            aria-label={
              preparationOpen
                ? 'Recolher ferramentas de preparação'
                : 'Expandir ferramentas de preparação'
            }
            aria-expanded={preparationOpen}
            aria-controls={
              mobile ? 'preparation-mobile' : 'preparation-desktop'
            }
            onClick={() => setPreparationOverride(!preparationOpen)}
            className={`grid min-h-11 w-11 shrink-0 place-items-center rounded-lg ${hover} ${inPreparation ? '' : muted}`}
          >
            {chevron(preparationOpen)}
          </button>
        </div>
        <div
          id={mobile ? 'preparation-mobile' : 'preparation-desktop'}
          hidden={!preparationOpen}
          className={nestedList}
        >
          {preparationItems.map(([label, Icon]) => item(label, Icon, true))}
        </div>
        {workflow.map(([label, Icon]) => item(label, Icon))}
      </div>
      <div className={divider}>
        <button
          type="button"
          aria-expanded={essayOpen}
          aria-controls={essayId}
          onClick={() => setEssayOverride(!essayOpen)}
          className={`${row} ${inEssay ? (mobile ? 'text-blue-800' : 'text-white') : `${muted} ${hover}`}`}
        >
          <PenLine className="size-[18px] shrink-0" aria-hidden="true" />
          <span>Redação</span>
          <span className="ml-auto">{chevron(essayOpen)}</span>
        </button>
        <div id={essayId} hidden={!essayOpen} className={nestedList}>
          {essay.map(([label, Icon]) => item(label, Icon, true))}
        </div>
      </div>
      <div className={divider}>
        {heading('Gestão escolar')}
        {item('Turmas e alunos', Users)}
        {item('Minhas escolas', School)}
      </div>
      {portalAdmin && (
        <div className={divider}>
          {heading('Administração')}
          {item('Assinantes', Users)}
          {item('Receitas', BarChart3)}
        </div>
      )}
      {mobile && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          {heading('Conta')}
          {/* oxlint-disable-next-line next/no-html-link-for-pages -- Full page navigation avoids the broken client-side route transition on the deployed app. */}
          <a
            href="/configuracoes/perfil"
            className={`${row} ${muted} ${hover}`}
          >
            <Settings className="size-[18px] shrink-0" aria-hidden="true" />
            <span>Configurações</span>
          </a>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className={`${row} ${muted} hover:bg-rose-50 hover:text-rose-700`}
            >
              <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
              <span>Sair da conta</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
