'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Check,
  ChevronRight,
  Layers3,
  Plus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

export type CurriculumOption = {
  subject_id: string;
  subject: string;
  stage: string;
  grade_range: string | null;
  knowledge_object_id: string | null;
  knowledge_object: string | null;
  skill_id?: string | null;
  skill_code: string | null;
  skill_description: string | null;
};

type Mode = 'subject' | 'object' | 'skill';

type HighSchoolItem = {
  area_source_key: string;
  area_id: string;
  area: string;
  stage: string;
  competency_id: string;
  competency_number: number;
  competency_description: string;
  skill_id: string;
  skill_code: string;
  skill_description: string;
};

type PedagogicalDiscipline = {
  id: string;
  name: string;
  area_source_key: string;
  skills: Array<{ id: string; code: string }>;
};

type EducationStage = 'Ensino Fundamental' | 'Ensino Médio';

type SaebMatrix = {
  id: string;
  name: string;
  subject: string;
  grade_range: string;
  version: string;
  source_url: string;
  topic_count: number;
  descriptor_count: number;
};

type SaebDescriptor = {
  id: string;
  code: string;
  description: string;
  topic_code: string;
  topic_id: string;
  topic: string;
  matrix_id: string;
};

export function CurriculumManager({
  items,
  apiUrl,
  onChange,
}: {
  items: CurriculumOption[];
  apiUrl: string;
  onChange: (items: CurriculumOption[]) => void;
}) {
  const [mode, setMode] = useState<Mode>('skill');
  const [educationStage, setEducationStage] =
    useState<EducationStage>('Ensino Fundamental');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [highSchool, setHighSchool] = useState<HighSchoolItem[]>([]);
  const [saebMatrices, setSaebMatrices] = useState<SaebMatrix[]>([]);
  const [saebDescriptors, setSaebDescriptors] = useState<SaebDescriptor[]>([]);
  const [selectedSaebMatrix, setSelectedSaebMatrix] = useState('');
  const [pedagogicalDisciplines, setPedagogicalDisciplines] = useState<
    PedagogicalDiscipline[]
  >([]);
  const [selectedChemistrySkills, setSelectedChemistrySkills] = useState<
    Set<string>
  >(new Set());
  const [chemistrySaving, setChemistrySaving] = useState(false);
  const chemistry = pedagogicalDisciplines.find(
    (item) => item.name === 'Química',
  );
  const natureHighSchool = highSchool.filter(
    (item) => item.area_source_key === 'em-area-cnt',
  );

  const refreshPedagogicalDisciplines = async () => {
    if (!apiUrl) return;
    const body = (await apiFetch(
      `${apiUrl}/api/curriculum/pedagogical-disciplines`,
    ).then((response) => response.json())) as {
      data: PedagogicalDiscipline[];
    };
    setPedagogicalDisciplines(body.data || []);
    const saved = body.data?.find((item) => item.name === 'Química');
    setSelectedChemistrySkills(
      new Set(saved?.skills.map((skill) => skill.id) || []),
    );
  };
  useEffect(() => {
    if (!apiUrl) return;
    apiFetch(`${apiUrl}/api/curriculum/high-school`)
      .then(
        (response) => response.json() as Promise<{ data: HighSchoolItem[] }>,
      )
      .then((body) => setHighSchool(body.data || []))
      .catch(() => undefined);
  }, [apiUrl]);
  useEffect(() => {
    if (!apiUrl) return;
    apiFetch(`${apiUrl}/api/curriculum/saeb/matrices`)
      .then((response) => response.json() as Promise<{ data: SaebMatrix[] }>)
      .then((body) => {
        setSaebMatrices(body.data || []);
        setSelectedSaebMatrix((current) => current || body.data?.[0]?.id || '');
      })
      .catch(() => undefined);
  }, [apiUrl]);
  useEffect(() => {
    if (!apiUrl || !selectedSaebMatrix) return;
    apiFetch(
      `${apiUrl}/api/curriculum/saeb/descriptors?matrixId=${encodeURIComponent(selectedSaebMatrix)}`,
    )
      .then(
        (response) => response.json() as Promise<{ data: SaebDescriptor[] }>,
      )
      .then((body) => setSaebDescriptors(body.data || []))
      .catch(() => undefined);
  }, [apiUrl, selectedSaebMatrix]);
  useEffect(() => {
    refreshPedagogicalDisciplines().catch(() => undefined);
  }, [apiUrl]);

  async function activateChemistry() {
    setChemistrySaving(true);
    setMessage('');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/curriculum/pedagogical-disciplines`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Química',
            areaSourceKey: 'em-area-cnt',
          }),
        },
      );
      if (!response.ok) throw new Error('Não foi possível ativar Química.');
      await refreshPedagogicalDisciplines();
      setMessage('Módulo pedagógico de Química ativado.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao ativar Química.',
      );
    } finally {
      setChemistrySaving(false);
    }
  }

  async function saveChemistrySkills() {
    if (!chemistry) return;
    setChemistrySaving(true);
    setMessage('');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/curriculum/pedagogical-disciplines/${chemistry.id}/skills`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ skillIds: [...selectedChemistrySkills] }),
        },
      );
      if (!response.ok)
        throw new Error('Não foi possível salvar as habilidades.');
      await refreshPedagogicalDisciplines();
      setMessage('Habilidades pedagógicas de Química atualizadas.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Erro ao salvar habilidades.',
      );
    } finally {
      setChemistrySaving(false);
    }
  }
  const stageItems = useMemo(
    () => items.filter((item) => item.stage === educationStage),
    [items, educationStage],
  );
  const subjects = useMemo(
    () => [
      ...new Map(stageItems.map((item) => [item.subject_id, item])).values(),
    ],
    [stageItems],
  );
  const objects = useMemo(
    () => [
      ...new Map(
        stageItems
          .filter((item) => item.knowledge_object_id)
          .map((item) => [item.knowledge_object_id, item]),
      ).values(),
    ],
    [stageItems],
  );
  const skillCount = stageItems.filter((item) => item.skill_code).length;
  const metrics: Array<{ value: number; label: string; icon: LucideIcon }> = [
    { value: subjects.length, label: 'disciplinas', icon: BookMarked },
    { value: objects.length, label: 'objetos de conhecimento', icon: Layers3 },
    { value: skillCount, label: 'habilidades cadastradas', icon: Sparkles },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const endpoint =
      mode === 'subject'
        ? 'subjects'
        : mode === 'object'
          ? 'knowledge-objects'
          : 'skills';
    const payload =
      mode === 'subject'
        ? { name: String(data.get('name')), stage: String(data.get('stage')) }
        : mode === 'object'
          ? {
              subjectId: String(data.get('subjectId')),
              name: String(data.get('name')),
              gradeRange: String(data.get('gradeRange')),
              description: String(data.get('description')),
            }
          : {
              knowledgeObjectId: String(data.get('knowledgeObjectId')),
              code: String(data.get('code')).toUpperCase(),
              description: String(data.get('description')),
            };
    setSaving(true);
    setMessage('');
    try {
      if (apiUrl) {
        const response = await apiFetch(
          `${apiUrl}/api/curriculum/${endpoint}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
        const body = (await response.json()) as {
          data?: unknown;
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            body.error || 'Não foi possível salvar a classificação.',
          );
        const refreshed = (await apiFetch(`${apiUrl}/api/curriculum`).then(
          (result) => result.json(),
        )) as { data: CurriculumOption[] };
        onChange(refreshed.data);
        setMessage('Classificação salva no PostgreSQL.');
      } else {
        const id = crypto.randomUUID();
        if (mode === 'subject')
          onChange([
            ...items,
            {
              subject_id: id,
              subject: payload.name,
              stage: payload.stage,
              grade_range: null,
              knowledge_object_id: null,
              knowledge_object: null,
              skill_code: null,
              skill_description: null,
            } as CurriculumOption,
          ]);
        if (mode === 'object') {
          const subject = subjects.find(
            (item) => item.subject_id === payload.subjectId,
          )!;
          onChange([
            ...items,
            {
              subject_id: subject.subject_id,
              subject: subject.subject,
              stage: subject.stage,
              grade_range: payload.gradeRange,
              knowledge_object_id: id,
              knowledge_object: payload.name,
              skill_code: null,
              skill_description: null,
            } as CurriculumOption,
          ]);
        }
        if (mode === 'skill') {
          const object = objects.find(
            (item) => item.knowledge_object_id === payload.knowledgeObjectId,
          )!;
          onChange([
            ...items,
            {
              ...object,
              skill_id: id,
              skill_code: payload.code,
              skill_description: payload.description,
            } as CurriculumOption,
          ]);
        }
        setMessage(
          'Classificação adicionada à demonstração. A API persistirá o mesmo cadastro no PostgreSQL.',
        );
      }
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao salvar a classificação.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[.15em] text-[var(--blue)]">
            Planejamento curricular
          </p>
          <h1 className="font-display text-3xl font-bold tracking-[-.03em] text-[var(--navy)] sm:text-[38px]">
            Estrutura BNCC
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Organize a taxonomia usada no banco de questões. Uma habilidade
            pertence a um objeto, e o objeto pertence a uma disciplina.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"
        >
          <Check className="mr-1 size-3" />
          Hierarquia normalizada
        </Badge>
      </div>
      <div className="mt-7 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {(['Ensino Fundamental', 'Ensino Médio'] as const).map((stage) => (
          <Button
            key={stage}
            type="button"
            variant="ghost"
            onClick={() => setEducationStage(stage)}
            className={
              educationStage === stage
                ? 'bg-[var(--navy)] text-white hover:bg-[var(--navy)] hover:text-white'
                : 'text-slate-600'
            }
          >
            {stage}
          </Button>
        ))}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {metrics.map(({ value, label, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-3xl font-bold text-[var(--navy)]">
                  {value}
                </p>
                <p className="mt-1 text-sm text-slate-500">{label}</p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="size-4" />
              </span>
            </div>
          </article>
        ))}
      </div>
      {educationStage === 'Ensino Médio' && highSchool.length > 0 && (
        <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--navy)]">
                Ensino Médio — áreas oficiais da BNCC
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Estrutura oficial da BNCC, sem seriação e sem objetos de
                conhecimento artificiais.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-violet-200 bg-white text-violet-700"
            >
              {new Set(highSchool.map((item) => item.skill_code)).size}{' '}
              habilidades
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {[
              ...new Map(
                highSchool.map((item) => [item.competency_id, item]),
              ).values(),
            ].map((competency) => (
              <article
                key={competency.competency_id}
                className="rounded-xl border border-violet-100 bg-white p-4"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-violet-700">
                  {competency.area} · Competência {competency.competency_number}
                </p>
                <p
                  className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600"
                  title={competency.competency_description}
                >
                  {competency.competency_description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {highSchool
                    .filter(
                      (item) => item.competency_id === competency.competency_id,
                    )
                    .map((item) => (
                      <Badge
                        key={item.skill_code}
                        variant="outline"
                        title={item.skill_description}
                        className="font-mono text-violet-700"
                      >
                        {item.skill_code}
                      </Badge>
                    ))}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            “Química” será uma etiqueta pedagógica local aplicada às habilidades
            pertinentes; ela não altera a autoria oficial da área.
          </p>
          <div className="mt-5 border-t border-violet-200 pt-5">
            {!chemistry ? (
              <Button
                type="button"
                disabled={!apiUrl || chemistrySaving}
                onClick={activateChemistry}
                className="bg-violet-700 text-white hover:bg-violet-800"
              >
                <Plus /> Ativar módulo de Química
              </Button>
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--navy)]">
                      Curadoria de Química
                    </h3>
                    <p className="text-xs text-slate-500">
                      Marque somente as habilidades que a instituição trabalhará
                      em Química.
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={chemistrySaving}
                    onClick={saveChemistrySkills}
                  >
                    {chemistrySaving ? 'Salvando...' : 'Salvar seleção'}
                  </Button>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ...new Map(
                      natureHighSchool.map((item) => [item.skill_id, item]),
                    ).values(),
                  ].map((skill) => (
                    <label
                      key={skill.skill_id}
                      className="flex gap-2 rounded-lg border border-violet-100 bg-white p-3 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChemistrySkills.has(skill.skill_id)}
                        onChange={(event) =>
                          setSelectedChemistrySkills((current) => {
                            const next = new Set(current);
                            event.target.checked
                              ? next.add(skill.skill_id)
                              : next.delete(skill.skill_id);
                            return next;
                          })
                        }
                        className="mt-0.5 size-4 accent-violet-700"
                      />
                      <span>
                        <strong className="font-mono text-violet-700">
                          {skill.skill_code}
                        </strong>
                        <span className="mt-1 line-clamp-3 block leading-5 text-slate-600">
                          {skill.skill_description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      {educationStage === 'Ensino Fundamental' && (
        <section className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--navy)]">
                Indicadores/descritores do SAEB
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Referência de avaliação externa para o Ensino Fundamental,
                apresentada separadamente das habilidades curriculares da BNCC.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-cyan-200 bg-white text-cyan-800"
            >
              Fonte oficial: Inep
            </Badge>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
            <div>
              <label
                htmlFor="saeb-matrix"
                className="text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                Matriz e ano escolar
              </label>
              <select
                id="saeb-matrix"
                value={selectedSaebMatrix}
                onChange={(event) => setSelectedSaebMatrix(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm"
              >
                {saebMatrices.map((matrix) => (
                  <option key={matrix.id} value={matrix.id}>
                    {matrix.subject} · {matrix.grade_range}
                  </option>
                ))}
              </select>
              {saebMatrices.find((item) => item.id === selectedSaebMatrix) && (
                <div className="mt-3 rounded-xl border border-cyan-100 bg-white p-3 text-xs leading-5 text-slate-600">
                  <p>
                    <strong>{saebDescriptors.length}</strong> descritores
                    carregados
                  </p>
                  <p>
                    {new Set(saebDescriptors.map((item) => item.topic_id))
                      .size ||
                      saebMatrices.find(
                        (item) => item.id === selectedSaebMatrix,
                      )?.topic_count}{' '}
                    temas
                  </p>
                  <a
                    href={
                      saebMatrices.find(
                        (item) => item.id === selectedSaebMatrix,
                      )?.source_url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-semibold text-cyan-800 underline"
                  >
                    Consultar documento do Inep
                  </a>
                </div>
              )}
            </div>
            <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {saebDescriptors.map((descriptor) => (
                <article
                  key={descriptor.id}
                  className="rounded-xl border border-cyan-100 bg-white p-3"
                >
                  <div className="flex items-start gap-3">
                    <Badge className="shrink-0 bg-cyan-800 font-mono text-white">
                      {descriptor.code}
                    </Badge>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-cyan-800">
                        {descriptor.topic}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-700">
                        {descriptor.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
              {!saebDescriptors.length && (
                <p className="rounded-xl border border-dashed border-cyan-200 bg-white p-5 text-sm text-slate-500">
                  Importe as matrizes oficiais para visualizar os descritores.
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_430px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <header className="border-b border-slate-200 p-5">
            <h2 className="font-display text-xl font-bold text-[var(--navy)]">
              Mapa curricular
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Relações disponíveis para classificar novas questões
            </p>
          </header>
          <div className="divide-y divide-slate-100">
            {subjects.map((subject) => (
              <div key={subject.subject_id} className="p-5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--navy)]">
                    {subject.subject}
                  </span>
                  <Badge variant="secondary">{subject.stage}</Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {objects
                    .filter((item) => item.subject_id === subject.subject_id)
                    .map((object) => (
                      <div
                        key={object.knowledge_object_id}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                      >
                        <div className="flex gap-2">
                          <ChevronRight className="mt-0.5 size-4 shrink-0 text-blue-500" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {object.knowledge_object}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {object.grade_range}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {stageItems
                            .filter(
                              (item) =>
                                item.knowledge_object_id ===
                                  object.knowledge_object_id && item.skill_code,
                            )
                            .map((skill) => (
                              <Badge
                                key={skill.skill_code}
                                variant="outline"
                                title={skill.skill_description || ''}
                                className="border-violet-200 bg-white font-mono text-violet-700"
                              >
                                {skill.skill_code}
                              </Badge>
                            ))}
                          {!stageItems.some(
                            (item) =>
                              item.knowledge_object_id ===
                                object.knowledge_object_id && item.skill_code,
                          ) && (
                            <span className="text-xs text-slate-400">
                              Nenhuma habilidade vinculada
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  {!objects.some(
                    (item) => item.subject_id === subject.subject_id,
                  ) && (
                    <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                      Cadastre o primeiro objeto de conhecimento.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--navy)]">
              Adicionar classificação
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Cadastre um nível por vez.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {(
              [
                ['subject', 'Disciplina'],
                ['object', 'Objeto'],
                ['skill', 'Habilidade'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={mode === value ? 'default' : 'outline'}
                onClick={() => {
                  setMode(value);
                  setMessage('');
                }}
                className={mode === value ? 'bg-[var(--blue)] text-white' : ''}
              >
                {label}
              </Button>
            ))}
          </div>
          <form key={mode} onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'subject' && (
              <>
                <Field label="Nome">
                  <Input required name="name" placeholder="Ex.: Química" />
                </Field>
                <Field label="Etapa">
                  <select
                    required
                    name="stage"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option>{educationStage}</option>
                  </select>
                </Field>
              </>
            )}
            {mode === 'object' && (
              <>
                <Field label="Disciplina">
                  <select
                    required
                    name="subjectId"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {subjects.map((item) => (
                      <option key={item.subject_id} value={item.subject_id}>
                        {item.subject} — {item.stage}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Objeto de conhecimento">
                  <Input
                    required
                    name="name"
                    placeholder="Ex.: Transformações químicas"
                  />
                </Field>
                <Field label="Ano/Série">
                  <Input
                    required
                    name="gradeRange"
                    placeholder="Ex.: 1ª série"
                  />
                </Field>
                <Field label="Descrição (opcional)">
                  <textarea
                    name="description"
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                  />
                </Field>
              </>
            )}
            {mode === 'skill' && (
              <>
                <Field label="Objeto de conhecimento">
                  <select
                    required
                    name="knowledgeObjectId"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {objects.map((item) => (
                      <option
                        key={item.knowledge_object_id}
                        value={item.knowledge_object_id!}
                      >
                        {item.subject} · {item.knowledge_object}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Código BNCC">
                  <Input
                    required
                    name="code"
                    placeholder="Ex.: EM13CNT101"
                    className="font-mono uppercase"
                  />
                </Field>
                <Field label="Descrição da habilidade">
                  <textarea
                    required
                    minLength={10}
                    name="description"
                    rows={5}
                    className="w-full rounded-lg border border-slate-200 p-3 text-sm leading-6"
                  />
                </Field>
              </>
            )}
            <Button
              disabled={
                saving ||
                (mode === 'object' && !subjects.length) ||
                (mode === 'skill' && !objects.length)
              }
              className="w-full bg-[var(--blue)] text-white hover:bg-blue-700"
            >
              <Plus />
              {saving ? 'Salvando...' : 'Adicionar'}
            </Button>
            {message && (
              <p
                role="status"
                className="rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800"
              >
                {message}
              </p>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
