'use client';

import { useState } from 'react';
import {
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  FileInput,
  FileOutput,
  LayoutDashboard,
  LibraryBig,
  ScanLine,
  Settings,
  Sprout,
  Users,
  type LucideIcon,
} from 'lucide-react';

const preparation: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['Questões', LibraryBig],
  ['Avaliações', FileOutput],
  ['Planejamento', BookOpenCheck],
  ['Importar provas', FileInput],
];
const workflow: ReadonlyArray<readonly [string, LucideIcon]> = [
  ['Corrigir', ScanLine],
  ['Diagnosticar', BarChart3],
  ['Recuperar', Sprout],
];

export function WorkspaceNavigation({
  active,
  onNavigate,
  canEditCatalog,
  portalAdmin,
  questionCount,
  showQuestionCount = true,
  mobile = false,
}: {
  active: string;
  onNavigate: (view: string) => void;
  canEditCatalog: boolean;
  portalAdmin: boolean;
  questionCount: number;
  showQuestionCount?: boolean;
  mobile?: boolean;
}) {
  const [preparationOverride, setPreparationOverride] = useState<
    boolean | null
  >(null);
  const current = active === 'Resultados' ? 'Diagnosticar' : active;
  const inPreparation =
    current === 'Preparar' || preparation.some(([label]) => label === current);
  const preparationOpen = preparationOverride ?? inPreparation;
  const preparationItems = preparation.filter(
    ([label]) => label !== 'Importar provas' || canEditCatalog,
  );
  function navigate(label: string) {
    setPreparationOverride(null);
    onNavigate(label);
  }
  const muted = mobile ? 'text-slate-600' : 'text-slate-300';
  const selected = mobile
    ? 'bg-blue-50 text-blue-800'
    : 'bg-white/12 text-white';
  const hover = mobile
    ? 'hover:bg-slate-100'
    : 'hover:bg-white/7 hover:text-white';
  function item(label: string, Icon: LucideIcon, nested = false) {
    return (
      <button
        key={label}
        type="button"
        onClick={() => navigate(label)}
        aria-current={current === label ? 'page' : undefined}
        className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${current === label ? selected : `${muted} ${hover}`} ${nested ? 'pl-4' : ''}`}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{label}</span>
        {label === 'Questões' && showQuestionCount && (
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${mobile ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-300'}`}
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
        className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] ${mobile ? 'text-slate-500' : 'text-slate-400'}`}
      >
        {label}
      </p>
    );
  }
  return (
    <div>
      {heading('Espaço de trabalho')}
      {item('Início', LayoutDashboard)}
      <div
        className={`mt-4 border-t pt-4 ${mobile ? 'border-slate-200' : 'border-white/10'}`}
      >
        {heading('Fluxo de avaliação')}
        <div
          className={`mb-1 flex rounded-lg ${inPreparation ? selected : ''}`}
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
            <ChevronDown
              className={`size-4 transition-transform ${preparationOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
        <div
          id={mobile ? 'preparation-mobile' : 'preparation-desktop'}
          hidden={!preparationOpen}
          className={`mb-3 ml-5 border-l pl-2 ${mobile ? 'border-slate-200' : 'border-white/15'}`}
        >
          {preparationItems.map(([label, Icon]) => item(label, Icon, true))}
        </div>
        {workflow.map(([label, Icon]) => item(label, Icon))}
      </div>
      <div
        className={`mt-4 border-t pt-4 ${mobile ? 'border-slate-200' : 'border-white/10'}`}
      >
        {heading('Gestão escolar')}
        {item('Turmas e alunos', Users)}
        {item('Minhas escolas', BookOpenCheck)}
      </div>
      {portalAdmin && (
        <div
          className={`mt-4 border-t pt-4 ${mobile ? 'border-slate-200' : 'border-white/10'}`}
        >
          {heading('Administração')}
          {item('Assinantes', Users)}
          {item('Receitas', BarChart3)}
        </div>
      )}
      {mobile && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          {heading('Conta')}
          {/* oxlint-disable-next-line next/no-html-link-for-pages -- Full page navigation avoids the broken client-side route transition on the deployed app. */}
          <a href="/configuracoes/perfil" className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium ${muted} ${hover}`}>
            <Settings className="size-[18px] shrink-0" aria-hidden="true" />
            <span>Configurações</span>
          </a>
        </div>
      )}
    </div>
  );
}
