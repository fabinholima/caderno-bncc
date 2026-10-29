'use client';
import { type SubmitEvent, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { AlertCircle, Building2, Check, ChevronRight, ImagePlus, Info, LoaderCircle, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export type School = {
  id?: string;
  name: string;
  schoolType: string;
  cnpj: string;
  inep: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  logoDataUrl: string;
  isHeaderDefault?: boolean;
};
export type EducatorData = {
  teacherName: string;
  profile: {
    professionalRole: 'teacher' | 'coordinator';
    phone: string;
    subjects: string[];
    grades: string[];
    stages: string[];
  } | null;
  schools: School[];
};
type SchoolSuggestion = Omit<School, 'id' | 'logoDataUrl' | 'isHeaderDefault'> & { addressNumber?: string };
type ApiReply<T> = { data?: T; error?: string; catalogAvailable?: boolean };
type View = 'profile' | 'schools';
type SchoolEditorMode = 'search' | 'source' | 'edit' | 'manual';

const SUBJECTS = ['Arte', 'Biologia', 'Ciências', 'Educação Física', 'Ensino Religioso', 'Filosofia', 'Física', 'Geografia', 'História', 'Língua Inglesa', 'Língua Portuguesa', 'Literatura', 'Matemática', 'Química', 'Sociologia'];
const GRADES = ['1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série do Ensino Médio', '2ª série do Ensino Médio', '3ª série do Ensino Médio'];
const STAGES = ['Educação Infantil', 'Fundamental — Anos Iniciais', 'Fundamental — Anos Finais', 'Ensino Médio', 'EJA', 'Ensino Técnico'];
const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const blank: School = { name: '', schoolType: 'estadual', cnpj: '', inep: '', address: '', city: '', state: 'MS', postalCode: '', phone: '', email: '', logoDataUrl: '' };
const digits = (value: string) => value.replace(/\D/g, '');
const maskPhone = (value: string) => {
  const raw = digits(value).slice(0, 11);
  if (raw.length <= 2) return raw;
  const area = raw.slice(0, 2), body = raw.slice(2);
  return `(${area}) ${body.length > 8 ? `${body.slice(0, 5)}-${body.slice(5)}` : body.length > 4 ? `${body.slice(0, 4)}-${body.slice(4)}` : body}`;
};
const maskCep = (value: string) => {
  const raw = digits(value).slice(0, 8);
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
};
const maskCnpj = (value: string) => digits(value).slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
function validCnpj(value: string) {
  const raw = digits(value);
  if (!raw) return true;
  if (raw.length !== 14 || /^(\d)\1{13}$/.test(raw)) return false;
  const calc = (base: string, weights: number[]) => {
    const remainder = base.split('').reduce((sum, char, i) => sum + Number(char) * weights[i], 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const a = calc(raw.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const b = calc(raw.slice(0, 12) + a, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return raw.endsWith(`${a}${b}`);
}
function legacyList(values: string[] | undefined, options: string[], aliases: Record<string, string[]> = {}) {
  const normalized = (values || []).flatMap((value) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean));
  const result = new Set<string>();
  for (const old of normalized) {
    const match = options.find((option) => option.toLocaleLowerCase('pt-BR') === old.toLocaleLowerCase('pt-BR'));
    if (match) result.add(match);
    else {
      const alias = Object.entries(aliases).find(([, values]) => values.some((value) => value.toLocaleLowerCase('pt-BR') === old.toLocaleLowerCase('pt-BR')))?.[0];
      result.add(alias || old);
    }
  }
  return [...result];
}
const label = 'block text-sm font-medium text-slate-800';
const input = 'mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const outline = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700';

function ChipPicker({ title, options, selected, onChange, helper, legacy = [] }: { title: string; options: string[]; selected: string[]; onChange: (values: string[]) => void; helper: string; legacy?: string[] }) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  const all = [...new Set([...options, ...legacy])];
  return <fieldset><legend className={label}>{title} <span className="text-rose-700">*</span></legend><p className="mb-2 mt-1 text-sm text-slate-600">{helper}</p><div className="flex flex-wrap gap-2">{all.map((item) => {
    const active = selected.includes(item);
    return <button key={item} type="button" aria-pressed={active} onClick={() => toggle(item)} className={`min-h-10 rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${active ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>{active && <Check className="mr-1 inline size-4" aria-hidden="true" />}{item}{legacy.includes(item) && <span className="ml-1 text-xs opacity-80">(anterior)</span>}</button>;
  })}</div></fieldset>;
}

export function EducatorProfile({ apiUrl, onboarding = false, onContinueToClasses, section, onNavigateSection }: { apiUrl: string; onboarding?: boolean; onContinueToClasses?: () => void; section?: View; onNavigateSection?: (view: View) => void }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [role, setRole] = useState<'teacher' | 'coordinator'>('teacher');
  const [personalPhone, setPersonalPhone] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [internalView, setInternalView] = useState<View>('profile');
  const view = section || internalView;
  function setView(next: View) {
    if (section) {
      if (profileDirty && !window.confirm('Há alterações no perfil que ainda não foram salvas. Sair mesmo assim?')) return;
      onNavigateSection?.(next);
    }
    else setInternalView(next);
  }
  const [school, setSchool] = useState<School>({ ...blank });
  const [editorMode, setEditorMode] = useState<SchoolEditorMode>('search');
  const [editorOpen, setEditorOpen] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState('');
  const [searchUf, setSearchUf] = useState('MS');
  const [suggestions, setSuggestions] = useState<SchoolSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [catalogAvailable, setCatalogAvailable] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savedSchoolAction, setSavedSchoolAction] = useState(false);
  const [profileLegacy, setProfileLegacy] = useState({ subjects: [] as string[], grades: [] as string[], stages: [] as string[] });
  const [profileDirty, setProfileDirty] = useState(false);
  const [schoolDirty, setSchoolDirty] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/educator-profile`).then(async (response) => {
      const body = (await response.json()) as ApiReply<EducatorData>;
      if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível carregar seu cadastro.');
      return body.data;
    }).then((data) => {
      if (!active) return;
      const oldSubjects = legacyList(data.profile?.subjects, SUBJECTS);
      const oldGrades = legacyList(data.profile?.grades, GRADES, {
        '1º ano': ['1º ano do Ensino Fundamental'], '2º ano': ['2º ano do Ensino Fundamental'], '3º ano': ['3º ano do Ensino Fundamental'], '4º ano': ['4º ano do Ensino Fundamental'], '5º ano': ['5º ano do Ensino Fundamental'],
        '6º ano': ['6º ano do Ensino Fundamental'], '7º ano': ['7º ano do Ensino Fundamental'], '8º ano': ['8º ano do Ensino Fundamental'], '9º ano': ['9º ano do Ensino Fundamental'],
        '1ª série do Ensino Médio': ['1ª série'], '2ª série do Ensino Médio': ['2ª série'], '3ª série do Ensino Médio': ['3ª série'],
      });
      const oldStages = legacyList(data.profile?.stages, STAGES, { 'Fundamental — Anos Iniciais': ['Ensino Fundamental - Anos Iniciais'], 'Fundamental — Anos Finais': ['Ensino Fundamental - Anos Finais'] });
      setProfileLegacy({ subjects: oldSubjects.filter((v) => !SUBJECTS.includes(v)), grades: oldGrades.filter((v) => !GRADES.includes(v)), stages: oldStages.filter((v) => !STAGES.includes(v)) });
      setRole(data.profile?.professionalRole || 'teacher');
      setPersonalPhone(maskPhone(data.profile?.phone || ''));
      setSubjects(oldSubjects); setGrades(oldGrades); setStages(oldStages);
      setSchools(data.schools || []);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (active) { setError(reason instanceof Error ? reason.message : 'Falha ao carregar os dados.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [apiUrl]);

  useEffect(() => {
    if (!editorOpen || editorMode !== 'search' || schoolQuery.trim().length < 3) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const params = new URLSearchParams({ q: schoolQuery.trim(), uf: searchUf });
        const response = await apiFetch(`${apiUrl}/api/escolas?${params}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
          throw new Error(`O servidor da API respondeu com uma página HTML (HTTP ${response.status}). Confira se o endereço da API está correto e atualizado.`);
        }
        const body = (await response.json()) as ApiReply<SchoolSuggestion[]>;
        if (!response.ok) throw new Error(body.error || 'Não foi possível consultar o catálogo.');
        if (active) { setSuggestions(body.data || []); setCatalogAvailable(body.catalogAvailable ?? true); setSearchError(''); }
      } catch (reason) {
        if (active) {
          setSuggestions([]);
          setCatalogAvailable(null);
          setSearchError(reason instanceof Error ? reason.message : 'Não foi possível consultar o catálogo de escolas.');
        }
      } finally { if (active) setSearching(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [apiUrl, editorOpen, editorMode, schoolQuery, searchUf]);

  const closeEditor = useCallback((force = false) => {
    if (!force && schoolDirty && !window.confirm('Há alterações na escola que ainda não foram salvas. Fechar mesmo assim?')) return;
    setEditorOpen(false); setSuggestions([]); setError(''); setSchoolDirty(false);
  }, [schoolDirty, setEditorOpen, setSuggestions, setError]);
  useEffect(() => {
    if (!profileDirty && !(editorOpen && schoolDirty)) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [profileDirty, editorOpen, schoolDirty]);
  useEffect(() => {
    if (!editorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editorOpen, closeEditor]);
  function startNewSchool() { setSchool({ ...blank }); setSchoolDirty(false); setSchoolQuery(''); setSearchUf('MS'); setSuggestions([]); setSearching(false); setSearchError(''); setCatalogAvailable(null); setEditorMode('search'); setEditorOpen(true); setError(''); }
  function startEditSchool(item: School) { setSchool({ ...item }); setSchoolDirty(false); setSchoolQuery(item.name); setSearchUf(item.state || 'MS'); setSuggestions([]); setSearchError(''); setEditorMode('edit'); setEditorOpen(true); setError(''); }
  function chooseSuggestion(item: SchoolSuggestion) {
    setSchool({ ...blank, name: item.name, schoolType: item.schoolType || 'estadual', cnpj: item.cnpj || '', inep: item.inep || '', address: [item.address, item.addressNumber].filter(Boolean).join(', '), city: item.city || '', state: item.state || searchUf, postalCode: item.postalCode || '', phone: item.phone || '', email: item.email || '' }); setSchoolDirty(true);
    setSchoolQuery(item.name); setSuggestions([]); setSearchError(''); setCatalogAvailable(null); setEditorMode('source'); setError('');
  }
  function chooseManual() {
    const codeSearch = /^\d{8}$/.test(schoolQuery.trim());
    setSchool({ ...blank, name: codeSearch ? '' : schoolQuery.trim(), inep: codeSearch ? schoolQuery.trim() : '', state: searchUf }); setSchoolDirty(true);
    setEditorMode('manual'); setSuggestions([]); setSearchError(''); setCatalogAvailable(null); setError('');
  }

  async function saveProfile(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`${apiUrl}/api/educator-profile/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ professionalRole: role, phone: digits(personalPhone), subjects, grades, stages }) });
      const body = (await response.json()) as ApiReply<{ saved: boolean }>;
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar o perfil.');
      setNotice('Perfil salvo.');
      setProfileDirty(false);
      if (onboarding) setView('schools');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  async function saveSchool(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    if (!validCnpj(school.cnpj)) { setError('Confira os dígitos do CNPJ.'); return; }
    if (school.postalCode && digits(school.postalCode).length !== 8) { setError('O CEP precisa ter 8 dígitos.'); return; }
    if (school.phone && ![10, 11].includes(digits(school.phone).length)) { setError('O telefone precisa ter DDD e 8 ou 9 dígitos.'); return; }
    setBusy(true);
    try {
      const response = await apiFetch(`${apiUrl}/api/educator-profile/schools`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...school, cnpj: digits(school.cnpj), inep: digits(school.inep), postalCode: digits(school.postalCode) }) });
      const body = (await response.json()) as ApiReply<School>;
      if (!response.ok || !body.data) throw new Error(body.error || 'Não foi possível salvar a escola.');
      setSchools((current) => {
        const next = current.some((item) => item.id === body.data?.id) ? current.map((item) => item.id === body.data?.id ? body.data! : item) : [...current, body.data!];
        return body.data?.isHeaderDefault ? next.map((item) => ({ ...item, isHeaderDefault: item.id === body.data?.id })) : next;
      });
      setSchoolDirty(false);
      setSavedSchoolAction(true); setNotice('Escola salva com sucesso.');
      closeEditor(true);
      if (onboarding) window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao salvar a escola.'); }
    finally { setBusy(false); }
  }

  async function makeHeaderDefault(id: string) {
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/educator-profile/schools/${id}/header-default`, { method: 'PATCH' });
      const body = (await response.json()) as ApiReply<{ id: string }>;
      if (!response.ok) throw new Error(body.error || 'Não foi possível definir a escola principal.');
      setSchools((current) => current.map((item) => ({ ...item, isHeaderDefault: item.id === id })));
      setNotice('Escola definida para o cabeçalho das provas.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao atualizar.'); }
  }
  async function removeSchool(item: School) {
    if (!item.id || !window.confirm(`Remover o cadastro de “${item.name}”?`)) return;
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/educator-profile/schools/${item.id}`, { method: 'DELETE' });
      const body = (await response.json()) as ApiReply<{ deleted: boolean }>;
      if (!response.ok) throw new Error(body.error || 'Não foi possível remover a escola.');
      setSchools((current) => {
        const next = current.filter((schoolItem) => schoolItem.id !== item.id);
        if (item.isHeaderDefault && next[0]) next[0] = { ...next[0], isHeaderDefault: true };
        return next;
      });
      setNotice('Escola removida.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao remover.'); }
  }
  function setLogo(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 400000) { setError('Envie PNG ou JPEG de até 400 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') { setSchool((current) => ({ ...current, logoDataUrl: reader.result as string })); setSchoolDirty(true); } };
    reader.onerror = () => setError('Não foi possível ler o logotipo.');
    reader.readAsDataURL(file);
  }

  const formField = (key: Exclude<keyof School, 'id' | 'logoDataUrl' | 'schoolType' | 'state' | 'isHeaderDefault'>, title: string, required = false, hint = '') => {
    const value = school[key];
    const display = key === 'cnpj' ? maskCnpj(value) : key === 'postalCode' ? maskCep(value) : key === 'phone' ? maskPhone(value) : value;
    const validation = key === 'cnpj' && value && !validCnpj(value) ? 'CNPJ incompleto ou inválido.' : key === 'postalCode' && value && digits(value).length !== 8 ? 'CEP deve ter 8 dígitos.' : key === 'phone' && value && ![10, 11].includes(digits(value).length) ? 'Informe o DDD e 8 ou 9 dígitos.' : '';
    return <label className={label} key={key} htmlFor={`school-${key}`}>{title}{required && <span className="ml-1 text-rose-700">*</span>}<input id={`school-${key}`} className={`${input} ${validation ? 'border-rose-700' : ''}`} required={required} readOnly={editorMode === 'source'} type={key === 'email' ? 'email' : 'text'} inputMode={['cnpj','inep','postalCode','phone'].includes(key) ? 'numeric' : undefined} value={display} maxLength={key === 'name' ? 140 : key === 'inep' ? 8 : key === 'phone' ? 16 : 240} onChange={(event) => { setSchool((current) => ({ ...current, [key]: ['cnpj','inep','postalCode'].includes(key) ? digits(event.target.value).slice(0, key === 'cnpj' ? 14 : 8) : key === 'phone' ? maskPhone(event.target.value) : event.target.value })); setSchoolDirty(true); }} aria-invalid={Boolean(validation)} aria-describedby={[hint ? `school-${key}-hint` : '', validation ? `school-${key}-error` : ''].filter(Boolean).join(' ') || undefined} />{hint && <span id={`school-${key}-hint`} className="mt-1 block text-sm font-normal text-slate-600">{hint}</span>}{validation && <span id={`school-${key}-error`} aria-live="polite" className="mt-1 block text-sm font-medium text-rose-800">{validation}</span>}</label>;
  };

  const profileView = <form onSubmit={saveProfile} className="space-y-6" aria-labelledby="profile-heading">
    <header><p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Etapa 1 de 2</p><h2 id="profile-heading" className="mt-1 text-2xl font-bold text-slate-950">Perfil profissional</h2><p className="mt-1 text-slate-600">Seus dados profissionais. Você pode atualizar quando precisar.</p></header>
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950"><div className="flex gap-3"><Info className="mt-0.5 size-5 shrink-0" aria-hidden="true"/><p className="text-sm leading-6"><strong>Sobre o acesso:</strong> seu perfil não libera o banco compartilhado. O acesso depende de convite do administrador da instituição.</p></div></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <label htmlFor="professional-role" className={label}>Perfil profissional <span className="text-rose-700">*</span><select id="professional-role" className={input} value={role} onChange={(event) => { setRole(event.target.value as 'teacher' | 'coordinator'); setProfileDirty(true); }}><option value="teacher">Professor(a)</option><option value="coordinator">Coordenador(a)</option></select></label>
      <label htmlFor="personal-phone" className={label}>Telefone pessoal <span className="font-normal text-slate-600">(opcional)</span><input id="personal-phone" className={input} type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={personalPhone} onChange={(event) => { setPersonalPhone(maskPhone(event.target.value)); setProfileDirty(true); }}/><span className="mt-1 block text-sm font-normal text-slate-600">Com DDD. Ex.: (67) 99999-9999.</span></label>
    </div>
    {role === 'teacher' ? <div className="space-y-6"><ChipPicker title="Disciplinas" options={SUBJECTS} selected={subjects} onChange={(values) => { setSubjects(values); setProfileDirty(true); }} helper="Selecione os componentes curriculares que você leciona." legacy={profileLegacy.subjects}/><ChipPicker title="Séries e anos" options={GRADES} selected={grades} onChange={(values) => { setGrades(values); setProfileDirty(true); }} helper="Selecione as etapas/séries em que leciona." legacy={profileLegacy.grades}/></div> : <ChipPicker title="Etapas sob sua coordenação" options={STAGES} selected={stages} onChange={(values) => { setStages(values); setProfileDirty(true); }} helper="Selecione as etapas pelas quais você responde." legacy={profileLegacy.stages}/>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5"><div className="flex flex-wrap items-center gap-3"><button type="submit" className={button} disabled={busy || loading || (role === 'teacher' && (!subjects.length || !grades.length)) || (role === 'coordinator' && !stages.length)}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Save className="size-4"/>}Salvar perfil</button><button type="button" className={outline} onClick={() => setView('schools')}>Ir para escolas<ChevronRight className="size-4"/></button></div>{profileDirty && <output className="text-sm font-medium text-amber-900" aria-live="polite">Há alterações não salvas.</output>}</div>
  </form>;

  const schoolView = <section className="space-y-6" aria-labelledby="schools-heading">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Etapa 2 de 2</p><h2 id="schools-heading" className="mt-1 text-2xl font-bold text-slate-950">Escolas</h2><p className="mt-1 text-slate-600">Escolha a escola que aparecerá no cabeçalho das provas.</p></div><div className="flex items-center gap-3"><span className="text-sm font-medium text-slate-700">{schools.length} de 6 escolas</span><button type="button" className={button} disabled={schools.length >= 6} title={schools.length >= 6 ? 'Remova uma escola antes de adicionar outra.' : undefined} onClick={startNewSchool}><Plus className="size-4"/>Adicionar escola</button></div></header>
    {schools.length >= 6 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Limite de seis escolas atingido. Remova uma escola para cadastrar outra.</p>}
    {schools.length ? <div className="grid gap-4 md:grid-cols-2">{schools.map((item) => <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${item.isHeaderDefault ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200'}`}><div className="flex gap-4">{item.logoDataUrl ? <Image src={item.logoDataUrl} alt={`Logotipo de ${item.name}`} width={56} height={56} unoptimized className="size-14 rounded-lg border object-contain p-1"/> : <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Building2 className="size-6" aria-hidden="true"/></span>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{item.name}</h3>{item.isHeaderDefault && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-900">Cabeçalho das provas</span>}</div><p className="mt-1 text-sm text-slate-600">{item.city}{item.city && item.state ? '/' : ''}{item.state} · {item.schoolType}</p>{item.inep && <p className="mt-1 text-xs text-slate-500">Código INEP {item.inep}</p>}</div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button type="button" className={outline} onClick={() => startEditSchool(item)}><Pencil className="size-4"/>Editar</button>{!item.isHeaderDefault && <button type="button" className={outline} onClick={() => item.id && void makeHeaderDefault(item.id)}><ShieldCheck className="size-4"/>Usar no cabeçalho</button>}<button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700" onClick={() => void removeSchool(item)}><Trash2 className="size-4"/>Remover</button></div></article>)}</div> : <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"><Building2 className="mx-auto size-9 text-slate-500" aria-hidden="true"/><h3 className="mt-3 font-semibold text-slate-900">Nenhuma escola cadastrada</h3><p className="mt-1 text-sm text-slate-600">Busque no catálogo do INEP ou cadastre os dados manualmente.</p><button type="button" className={`${button} mt-4`} onClick={startNewSchool}><Plus className="size-4"/>Adicionar escola</button></div>}
  </section>;

  return <main className="mx-auto my-6 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
    <header className="mb-6 border-b border-slate-200 pb-5"><p className="text-sm font-semibold uppercase tracking-wide text-blue-800">{onboarding ? 'Cadastro profissional' : 'Configurações da conta'}</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">{onboarding ? 'Vamos preparar seu espaço de trabalho' : section === 'schools' ? 'Escolas' : section === 'profile' ? 'Perfil profissional' : 'Meu perfil e minhas escolas'}</h1><p className="mt-2 text-slate-600">{section === 'schools' ? 'Gerencie as escolas usadas nos cabeçalhos das provas.' : 'Atualize seus dados profissionais quando precisar.'}</p></header>
    {!section && <nav aria-label="Seções do cadastro" className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" aria-current={view === 'profile' ? 'step' : undefined} onClick={() => setView('profile')} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'profile' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-700 hover:bg-white/70'}`}>1. Perfil</button><button type="button" aria-current={view === 'schools' ? 'step' : undefined} onClick={() => setView('schools')} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'schools' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-700 hover:bg-white/70'}`}>2. Escolas</button></nav>}
    {loading ? <p className="py-10 text-center text-slate-600">Carregando cadastro…</p> : <>
      {notice && <output className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-950"><Check className="size-4"/>{notice}</output>}
      {error && <output role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950"><AlertCircle className="size-4 shrink-0"/>{error}</output>}
      {view === 'profile' ? profileView : schoolView}
      {savedSchoolAction && !editorOpen && <aside className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-950">Próximo passo</p><p className="mt-1 text-sm text-emerald-900">A escola está pronta. Você pode organizar as turmas agora ou voltar depois.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => { setSavedSchoolAction(false); onContinueToClasses?.(); }}>{onContinueToClasses ? 'Cadastrar turmas agora' : 'Preparar para cadastrar turmas'}<ChevronRight className="size-4"/></button><button type="button" className={outline} onClick={() => setSavedSchoolAction(false)}>Fazer depois</button></div></aside>}
    </>}

    {editorOpen && <dialog open aria-modal="true" aria-labelledby="school-editor-title" className="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none justify-end overflow-hidden border-0 bg-slate-950/50 p-0"><section className="h-full w-full max-w-2xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-7"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Cadastro de escola</p><h2 id="school-editor-title" className="mt-1 text-xl font-bold text-slate-950">{school.id ? 'Editar escola' : 'Adicionar escola'}</h2><p className="mt-1 text-sm text-slate-600">Dados da escola para identificação nas provas.</p></div><button type="button" className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700" aria-label="Fechar painel" onClick={() => closeEditor()}><X className="size-5"/></button></div>
      {editorMode === 'search' ? <div className="space-y-4"><label className={label} htmlFor="school-search">Buscar pelo nome ou código INEP<input id="school-search" autoFocus className={input} autoComplete="off" value={schoolQuery} onChange={(event) => { setSchoolQuery(event.target.value); setSuggestions([]); setSearchError(''); setCatalogAvailable(null); }} placeholder="Digite 3 caracteres ou 8 dígitos"/><span className="mt-1 block text-sm font-normal text-slate-600">A busca consulta o catálogo local do Censo Escolar.</span></label><label className={label} htmlFor="school-search-uf">Filtrar por UF<select id="school-search-uf" className={input} value={searchUf} onChange={(event) => { setSearchUf(event.target.value); setSuggestions([]); setSearchError(''); setCatalogAvailable(null); }}>{STATES.map((state) => <option key={state}>{state}</option>)}</select></label>{searching && <output className="block text-sm text-slate-600">Buscando no catálogo…</output>}{searchError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert"><strong>Não foi possível fazer a busca.</strong><span className="mt-1 block">{searchError} Você ainda pode cadastrar a escola manualmente.</span></div>}{suggestions.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-200" aria-label="Sugestões de escolas">{suggestions.map((item) => <button type="button" key={item.inep} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left text-sm last:border-0 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700" onClick={() => chooseSuggestion(item)}><span><strong className="block text-slate-950">{item.name}</strong><span className="text-slate-600">{item.city}/{item.state} · INEP {item.inep}</span></span><ChevronRight className="size-4 shrink-0 text-slate-500"/></button>)}</div>}{schoolQuery.trim().length >= 3 && !searching && !searchError && !suggestions.length && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{catalogAvailable === false ? 'O catálogo oficial do INEP ainda não foi carregado. Cadastre a escola manualmente por enquanto.' : 'Escola não encontrada no catálogo. Você pode preencher os dados manualmente.'}</p>}<button type="button" className="text-left text-sm font-semibold text-blue-800 underline decoration-blue-300 underline-offset-4 hover:text-blue-950" onClick={chooseManual}>Não encontrei minha escola: cadastrar manualmente</button></div> : <form onSubmit={saveSchool} className="space-y-6">
        {schoolDirty && <output className="block rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-950" aria-live="polite">Há alterações na escola que ainda não foram salvas.</output>}
        {editorMode === 'source' && <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><p>Dados disponíveis no catálogo do INEP. Os campos sem informação podem ser completados ao editar.</p><button type="button" className="shrink-0 font-semibold underline" onClick={() => setEditorMode('edit')}>Editar</button></div>}
        <fieldset disabled={busy || editorMode === 'source'} className="space-y-5 disabled:opacity-80"><legend className="text-lg font-semibold text-slate-950">Identificação</legend><div className="grid gap-4 sm:grid-cols-2">{formField('name','Nome da escola',true)}<label className={label}>Rede / tipo <span className="text-rose-700">*</span><select className={input} required value={school.schoolType} onChange={(event) => { setSchool((current) => ({ ...current, schoolType: event.target.value })); setSchoolDirty(true); }}><option value="estadual">Estadual</option><option value="municipal">Municipal</option><option value="federal">Federal</option><option value="privada">Privada</option>{school.schoolType === 'outra' && <option value="outra">Outra (cadastro existente)</option>}</select></label>{formField('inep','Código INEP',false,'Opcional. O código INEP tem 8 dígitos.')}{formField('cnpj','CNPJ',false,'Opcional. Informe quando aplicável.')}</div></fieldset>
        <fieldset disabled={busy || editorMode === 'source'} className="space-y-4 disabled:opacity-80"><legend className="text-lg font-semibold text-slate-950">Localização</legend><div className="grid gap-4 sm:grid-cols-2">{formField('address','Endereço e número',true)}{formField('postalCode','CEP',false,'8 dígitos.')}{formField('city','Município',true)}<label className={label}>UF <span className="text-rose-700">*</span><select className={input} required value={school.state} onChange={(event) => { setSchool((current) => ({ ...current, state: event.target.value })); setSchoolDirty(true); }}>{STATES.map((state) => <option key={state}>{state}</option>)}</select></label></div></fieldset>
        <fieldset disabled={busy || editorMode === 'source'} className="space-y-4 disabled:opacity-80"><legend className="text-lg font-semibold text-slate-950">Contato</legend><div className="grid gap-4 sm:grid-cols-2">{formField('phone','Telefone da escola',false,'Inclua DDD.')}{formField('email','E-mail da escola')}</div></fieldset>
        <fieldset disabled={busy || editorMode === 'source'}><legend className="text-lg font-semibold text-slate-950">Logotipo</legend><p className="mt-1 text-sm text-slate-600">PNG ou JPEG, no máximo 400 KB. O logotipo não vem do catálogo do INEP.</p><button type="button" aria-label="Adicionar logotipo PNG ou JPEG de até 400 KB" className="mt-3 flex min-h-32 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700" onClick={() => document.getElementById('school-logo')?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setLogo(event.dataTransfer.files[0]); }}><ImagePlus className="size-7 text-slate-600"/><span className="mt-2 font-medium text-slate-800">Arraste o arquivo ou escolha no dispositivo</span><span className="mt-1 text-sm text-slate-600">PNG/JPEG · até 400 KB</span></button><input id="school-logo" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(event) => setLogo(event.target.files?.[0])}/>{school.logoDataUrl && <div className="mt-3 flex items-center gap-3 rounded-lg border p-3"><Image src={school.logoDataUrl} alt="Pré-visualização do logotipo" width={56} height={56} unoptimized className="size-14 rounded-lg object-contain"/><span className="text-sm text-slate-700">Pré-visualização</span><button type="button" className="ml-auto text-sm font-semibold text-rose-800 underline" onClick={() => { setSchool((current) => ({ ...current, logoDataUrl: '' })); setSchoolDirty(true); }}>Remover</button></div>}</fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" className={outline} onClick={() => closeEditor()}>Cancelar</button>{editorMode !== 'source' && <button type="submit" className={button} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin"/> : <Save className="size-4"/>}Salvar escola</button>}</div>
      </form>}
    </section></dialog>}
  </main>;
}
