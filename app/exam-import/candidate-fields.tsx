import { resolveImportClassification } from '@/lib/import-classification.mjs';
import { Button } from '@/components/ui/button';
import {
  fieldLabel,
  orderedHighSchoolDisciplines,
  candidateReadiness,
  type ExamImport,
  type ExamImportCandidate,
  type BulkSettings,
  type PedagogicalDiscipline,
  type PedagogicalTopic,
} from './model';

export function SelectField({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Array<[string, string]>;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className={fieldLabel}>
      {label}
      <select
        name={name}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CandidateClassificationFields({
  candidate,
  item,
  settings,
  disciplines,
  topics,
  onChange,
}: {
  candidate: ExamImportCandidate;
  item: ExamImport;
  settings: BulkSettings;
  disciplines: PedagogicalDiscipline[];
  topics: PedagogicalTopic[];
  onChange: (changes: Partial<ExamImportCandidate>) => void;
}) {
  const batchDiscipline = resolveImportClassification({
    settings,
    item,
    disciplines,
    topics,
  }).discipline;
  const { discipline, grade } = resolveImportClassification({
    candidate,
    settings,
    item,
    disciplines,
    topics,
  });
  const selected = topics.find(
    (topic) =>
      topic.id === candidate.pedagogicalTopicId &&
      topic.discipline_id === discipline?.id &&
      topic.grade_range === grade,
  );
  const selectedDetail = selected?.depth === 2 ? selected : undefined;
  const selectedSubtopic =
    selected?.depth === 1
      ? selected
      : selectedDetail
        ? topics.find((topic) => topic.id === selectedDetail.parent_id)
        : undefined;
  const selectedObject =
    selected?.depth === 0
      ? selected
      : topics.find(
          (topic) =>
            topic.id === (selectedSubtopic?.parent_id || selected?.parent_id),
        );
  const objects = topics.filter(
    (topic) =>
      !topic.parent_id &&
      topic.discipline_id === discipline?.id &&
      topic.grade_range === grade,
  );
  const subtopics = topics.filter(
    (topic) => topic.parent_id === selectedObject?.id,
  );
  const details = topics.filter(
    (topic) => topic.parent_id === selectedSubtopic?.id,
  );
  const availableSkills = selected?.skills?.length
    ? selected.skills
    : discipline?.skills || [];

  return (
    <section className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-900">
        Classificação desta questão
      </p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <SelectField
          name={`candidate-discipline-${candidate.id}`}
          label={`Disciplina da questão ${candidate.sourceNumber}`}
          value={candidate.pedagogicalDisciplineId || ''}
          onChange={(pedagogicalDisciplineId) =>
            onChange({
              pedagogicalDisciplineId,
              pedagogicalTopicId: '',
              skill: disciplines
                .find((d) => d.id === pedagogicalDisciplineId)
                ?.skills?.some((s) => s.code === candidate.skill)
                ? candidate.skill
                : '',
            })
          }
          options={[
            [
              '',
              `Disciplina: usar padrão do lote${batchDiscipline ? ` (${batchDiscipline.name})` : ''}`,
            ],
            ...orderedHighSchoolDisciplines(disciplines).map(
              (d) => [d.id, d.name] as [string, string],
            ),
          ]}
        />
        <SelectField
          name={`candidate-grade-${candidate.id}`}
          label={`Série da questão ${candidate.sourceNumber}`}
          value={candidate.grade || ''}
          onChange={(grade) =>
            onChange({
              grade,
              pedagogicalDisciplineId: discipline?.id || '',
              pedagogicalTopicId: '',
              skill: '',
            })
          }
          options={[
            ['', 'Série: usar padrão do lote'],
            ['1ª série', '1ª série do Ensino Médio'],
            ['2ª série', '2ª série do Ensino Médio'],
            ['3ª série', '3ª série do Ensino Médio'],
          ]}
        />
        <SelectField
          name={`candidate-object-${candidate.id}`}
          label={`Objeto da questão ${candidate.sourceNumber}`}
          value={selectedObject?.id || ''}
          onChange={(pedagogicalTopicId) =>
            onChange({
              pedagogicalDisciplineId: discipline?.id || '',
              pedagogicalTopicId,
              skill: '',
            })
          }
          options={[
            ['', 'Objeto: usar padrão do lote'],
            ...objects.map(
              (topic) => [topic.id, topic.name] as [string, string],
            ),
          ]}
        />
        {selectedObject && subtopics.length > 0 && (
          <SelectField
            name={`candidate-subtopic-${candidate.id}`}
            label={`Subtópico da questão ${candidate.sourceNumber}`}
            value={selectedSubtopic?.id || ''}
            onChange={(value) =>
              onChange({
                pedagogicalTopicId: value || selectedObject.id,
                skill: '',
              })
            }
            options={[
              ['', 'Sem subtópico específico'],
              ...subtopics.map(
                (topic) => [topic.id, topic.name] as [string, string],
              ),
            ]}
          />
        )}
        {selectedSubtopic && details.length > 0 && (
          <SelectField
            name={`candidate-detail-${candidate.id}`}
            label={`Detalhamento da questão ${candidate.sourceNumber}`}
            value={selectedDetail?.id || ''}
            onChange={(value) =>
              onChange({
                pedagogicalTopicId: value || selectedSubtopic.id,
                skill: '',
              })
            }
            options={[
              ['', 'Sem detalhamento específico'],
              ...details.map(
                (topic) => [topic.id, topic.name] as [string, string],
              ),
            ]}
          />
        )}
        <SelectField
          name={`candidate-difficulty-${candidate.id}`}
          label={`Dificuldade da questão ${candidate.sourceNumber}`}
          value={candidate.difficulty || ''}
          onChange={(difficulty) =>
            onChange({
              difficulty:
                (difficulty as BulkSettings['difficulty']) || undefined,
            })
          }
          options={[
            ['', 'Dificuldade: usar padrão do lote'],
            ['Fácil', 'Fácil'],
            ['Média', 'Média'],
            ['Difícil', 'Difícil'],
          ]}
        />
        <SelectField
          name={`candidate-skill-${candidate.id}`}
          label={`Habilidade BNCC da questão ${candidate.sourceNumber}`}
          value={candidate.skill || ''}
          onChange={(skill) => onChange({ skill })}
          options={[
            ['', 'Selecione a habilidade BNCC'],
            ...(candidate.skill &&
            !availableSkills.some((s) => s.code === candidate.skill)
              ? [
                  [
                    candidate.skill,
                    `${candidate.skill} · informada na importação`,
                  ] as [string, string],
                ]
              : []),
            ...availableSkills.map(
              (skill) =>
                [skill.code, `${skill.code} · ${skill.description}`] as [
                  string,
                  string,
                ],
            ),
          ]}
        />
      </div>
    </section>
  );
}

export function BulkRegistrationPanel({
  item,
  settings,
  disciplines,
  topics,
  registering,
  onSettingChange,
  onRegister,
}: {
  item: ExamImport;
  settings: BulkSettings;
  disciplines: PedagogicalDiscipline[];
  topics: PedagogicalTopic[];
  registering: boolean;
  onSettingChange: <K extends keyof BulkSettings>(
    field: K,
    value: BulkSettings[K],
  ) => void;
  onRegister: () => void;
}) {
  const selected = item.candidates.filter(
    (candidate) => candidate.selected && candidate.status !== 'completed',
  );
  const ready = selected.filter(
    (candidate) => candidateReadiness(candidate).ready,
  );
  const { discipline } = resolveImportClassification({
    settings,
    item,
    disciplines,
    topics,
  });
  const objects = topics.filter(
    (topic) =>
      !topic.parent_id &&
      topic.discipline_id === discipline?.id &&
      topic.grade_range === settings.grade,
  );
  const subtopics = topics.filter(
    (topic) =>
      topic.parent_id === settings.objectId &&
      topic.discipline_id === discipline?.id,
  );
  const details = topics.filter(
    (topic) =>
      topic.parent_id === settings.topicId &&
      topic.discipline_id === discipline?.id,
  );
  const defaultTopicId =
    settings.detailId || settings.topicId || settings.objectId;
  const defaultTopic = topics.find((topic) => topic.id === defaultTopicId);
  const availableSkills = defaultTopic?.skills?.length
    ? defaultTopic.skills
    : discipline?.skills || [];
  const classifiable = ready.every(
    (candidate) =>
      Boolean((candidate.grade || settings.grade).trim()) &&
      Boolean(
        resolveImportClassification({
          candidate,
          settings,
          item,
          disciplines,
          topics,
        }).topicId,
      ),
  );
  return (
    <section className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="font-semibold text-blue-950">Cadastro em lote</h5>
          <p className="mt-1 text-xs text-slate-600">
            Estes dados são padrões. A classificação preenchida diretamente em
            uma questão tem prioridade.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1 text-slate-700">
            {selected.length} selecionada(s)
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
            {ready.length} pronta(s)
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
            {selected.length - ready.length} pendente(s)
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SelectField
          name={`bulk-discipline-${item.id}`}
          label="Disciplina padrão do lote"
          value={discipline?.id || ''}
          onChange={(value) => {
            onSettingChange('pedagogicalDisciplineId', value);
            onSettingChange('objectId', '');
            onSettingChange('topicId', '');
            onSettingChange('detailId', '');
            onSettingChange('skill', '');
          }}
          options={[
            ['', 'Selecione a disciplina'],
            ...orderedHighSchoolDisciplines(disciplines).map(
              (d) => [d.id, d.name] as [string, string],
            ),
          ]}
        />
        <SelectField
          name={`bulk-grade-${item.id}`}
          label="Série do Ensino Médio"
          value={settings.grade}
          onChange={(value) => {
            onSettingChange('grade', value);
            onSettingChange('pedagogicalDisciplineId', discipline?.id || '');
            onSettingChange('objectId', '');
            onSettingChange('topicId', '');
            onSettingChange('detailId', '');
            onSettingChange('skill', '');
          }}
          options={[
            ['', 'Selecione a série'],
            ['1ª série', '1ª série do Ensino Médio'],
            ['2ª série', '2ª série do Ensino Médio'],
            ['3ª série', '3ª série do Ensino Médio'],
          ]}
        />
        <SelectField
          name={`bulk-object-${item.id}`}
          label="Objeto de conhecimento"
          value={settings.objectId}
          onChange={(value) => {
            onSettingChange('objectId', value);
            onSettingChange('pedagogicalDisciplineId', discipline?.id || '');
            onSettingChange('topicId', '');
            onSettingChange('detailId', '');
            onSettingChange('skill', '');
          }}
          options={[
            ['', 'Selecione o objeto de conhecimento'],
            ...objects.map(
              (topic) => [topic.id, topic.name] as [string, string],
            ),
          ]}
        />
        <SelectField
          name={`bulk-topic-${item.id}`}
          label="Subtópico"
          value={settings.topicId}
          onChange={(value) => {
            onSettingChange('topicId', value);
            onSettingChange('detailId', '');
            onSettingChange('skill', '');
          }}
          options={[
            ['', subtopics.length ? 'Selecione o subtópico' : 'Sem subtópicos'],
            ...subtopics.map(
              (topic) => [topic.id, topic.name] as [string, string],
            ),
          ]}
        />
        {details.length > 0 && (
          <SelectField
            name={`bulk-detail-${item.id}`}
            label="Detalhamento"
            value={settings.detailId}
            onChange={(value) => {
              onSettingChange('detailId', value);
              onSettingChange('skill', '');
            }}
            options={[
              ['', 'Selecione o detalhamento'],
              ...details.map(
                (topic) => [topic.id, topic.name] as [string, string],
              ),
            ]}
          />
        )}
        <SelectField
          name={`bulk-difficulty-${item.id}`}
          label="Dificuldade do lote"
          value={settings.difficulty}
          onChange={(value) =>
            onSettingChange('difficulty', value as BulkSettings['difficulty'])
          }
          options={[
            ['Fácil', 'Fácil'],
            ['Média', 'Média'],
            ['Difícil', 'Difícil'],
          ]}
        />
        <SelectField
          name={`bulk-skill-${item.id}`}
          label="Habilidade BNCC do lote"
          value={settings.skill}
          onChange={(value) => onSettingChange('skill', value)}
          options={[
            ['', 'Selecione a habilidade BNCC'],
            ...availableSkills.map(
              (skill) =>
                [skill.code, `${skill.code} · ${skill.description}`] as [
                  string,
                  string,
                ],
            ),
          ]}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-slate-600">
          Para entrar no lote, a questão objetiva precisa ter A–E e gabarito
          confirmado. Discursivas continuam no botão “Revisar e cadastrar”.
        </p>
        <Button
          type="button"
          disabled={registering || !ready.length || !classifiable}
          onClick={onRegister}
        >
          {registering
            ? 'Cadastrando...'
            : `Cadastrar ${ready.length} pronta(s)`}
        </Button>
      </div>
    </section>
  );
}
