'use client';
import { type SubmitEvent, useEffect, useState } from 'react';
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
const blank: School = {
  name: '',
  schoolType: 'estadual',
  cnpj: '',
  inep: '',
  address: '',
  city: '',
  state: 'MS',
  postalCode: '',
  phone: '',
  email: '',
  logoDataUrl: '',
};
const split = (text: string) =>
  text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function EducatorProfile({
  apiUrl,
  onboarding = false,
}: {
  apiUrl: string;
  onboarding?: boolean;
}) {
  const [schools, setSchools] = useState<School[]>([]);
  const [school, setSchool] = useState<School>({ ...blank });
  const [role, setRole] = useState<'teacher' | 'coordinator'>('teacher');
  const [phone, setPhone] = useState('');
  const [subjects, setSubjects] = useState('');
  const [grades, setGrades] = useState('');
  const [stages, setStages] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/educator-profile`)
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: EducatorData;
          error?: string;
        };
        if (!response.ok || !body.data)
          throw new Error(
            body.error || 'Não foi possível carregar seu cadastro.',
          );
        return body.data;
      })
      .then((data) => {
        if (!active) return;
        setSchools(data.schools);
        if (data.schools[0]) setSchool(data.schools[0]);
        if (data.profile) {
          setRole(data.profile.professionalRole);
          setPhone(data.profile.phone);
          setSubjects(data.profile.subjects.join(', '));
          setGrades(data.profile.grades.join(', '));
          setStages(data.profile.stages.join(', '));
        }
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'Falha de conexão.',
          );
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school.id && schools.length >= (role === 'teacher' ? 6 : 30)) {
      setMessage('Limite de escolas atingido. Você pode editar as escolas cadastradas.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(`${apiUrl}/api/educator-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalRole: role,
          phone,
          subjects: split(subjects),
          grades: split(grades),
          stages: split(stages),
          school,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível salvar.');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha de conexão.');
    } finally {
      setBusy(false);
    }
  }
  async function logo(file?: File) {
    if (!file) return;
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size > 400000
    ) {
      setMessage('Use PNG ou JPEG de até 400 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string')
        setSchool((current) => ({
          ...current,
          logoDataUrl: reader.result as string,
        }));
    };
    reader.onerror = () => setMessage('Falha ao ler o logotipo.');
    reader.readAsDataURL(file);
  }
  const field = (
    key: Exclude<keyof School, 'id' | 'logoDataUrl' | 'schoolType' | 'state'>,
    label: string,
    required = false,
  ) => (
    <label className="block text-sm" key={key}>
      {label}
      <input
        required={required}
        value={school[key]}
        maxLength={key === 'name' ? 140 : key === 'city' ? 100 : 240}
        type={key === 'email' ? 'email' : 'text'}
        onChange={(e) =>
          setSchool({
            ...school,
            [key]: ['cnpj', 'inep', 'postalCode'].includes(key)
              ? e.target.value.replace(/\D/g, '')
              : e.target.value,
          })
        }
        className="mt-1 w-full rounded-lg border p-2"
      />
    </label>
  );
  return (
    <section className="mx-auto my-6 w-full max-w-3xl rounded-2xl border bg-white p-6">
      <h1 className="text-2xl font-bold">
        {onboarding
          ? 'Complete seu cadastro profissional'
          : 'Meu perfil e minhas escolas'}
      </h1>
      <p className="my-3 text-sm text-slate-600">
        A escola será usada no cabeçalho das provas. Informar uma escola ou
        escolher Coordenador não concede acesso ao banco compartilhado: esse
        acesso depende de convite do administrador da instituição.
      </p>
      {message && (
        <output className="my-3 block rounded-lg bg-blue-50 p-3 text-sm">
          {message}
        </output>
      )}
      <form onSubmit={save} className="space-y-4">
        <fieldset
          disabled={!loaded || busy}
          className="space-y-4 disabled:opacity-60"
        >
          <legend className="font-semibold">Dados profissionais</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Perfil profissional
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'teacher' | 'coordinator')
                }
                className="mt-1 w-full rounded-lg border p-2"
              >
                <option value="teacher">Professor(a)</option>
                <option value="coordinator">Coordenador(a)</option>
              </select>
            </label>
            <label className="text-sm">
              Telefone pessoal (opcional)
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              Disciplinas (separadas por vírgula)
              <input
                required={role === 'teacher'}
                value={subjects}
                onChange={(e) => setSubjects(e.target.value)}
                placeholder="Química, Física"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm">
              Séries / anos (separados por vírgula)
              <input
                required={role === 'teacher'}
                value={grades}
                onChange={(e) => setGrades(e.target.value)}
                placeholder="1ª série, 2ª série"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Etapas sob sua coordenação (separadas por vírgula)
              <input
                required={role === 'coordinator'}
                value={stages}
                onChange={(e) => setStages(e.target.value)}
                placeholder="Ensino Fundamental, Ensino Médio"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
          </div>
          <h2 className="text-lg font-semibold">Escola para o cabeçalho</h2>
          <label className="block text-sm">
            Editar escola ou cadastrar outra
            <select
              value={school.id || ''}
              onChange={(e) =>
                setSchool(
                  schools.find((s) => s.id === e.target.value) || { ...blank },
                )
              }
              className="mt-1 w-full rounded-lg border p-2"
            >
              <option value="" disabled={schools.length >= (role === 'teacher' ? 6 : 30)}>Cadastrar nova escola</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.city}/{s.state}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="text-sm text-slate-600">
              {schools.length} de {role === 'teacher' ? 6 : 30} escolas cadastradas.
              {schools.length >= (role === 'teacher' ? 6 : 30) && ' Limite atingido. Você pode editar as escolas existentes.'}
            </p>
            {field('name', 'Nome da escola', true)}
            <label className="text-sm">
              Rede / tipo
              <select
                value={school.schoolType}
                onChange={(e) =>
                  setSchool({ ...school, schoolType: e.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2"
              >
                {['municipal', 'estadual', 'federal', 'privada', 'outra'].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </label>
            {field('cnpj', 'CNPJ (quando aplicável)')}
            {field('inep', 'Código INEP (opcional)')}
            {field('address', 'Endereço e número', true)}
            {field('postalCode', 'CEP (opcional)')}
            {field('city', 'Município', true)}
            <label className="text-sm">
              UF
              <select
                value={school.state}
                onChange={(e) =>
                  setSchool({ ...school, state: e.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2"
              >
                {'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'
                  .split(' ')
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
            {field('phone', 'Telefone da escola (opcional)')}
            {field('email', 'E-mail da escola (opcional)')}
          </div>
          <label className="block text-sm">
            Logotipo da escola (PNG/JPEG, até 400 KB)
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                void logo(e.target.files?.[0]);
              }}
              className="mt-2 block"
            />
          </label>
          {school.logoDataUrl && (
            <div className="flex items-center gap-3">
              <span>Logotipo cadastrado</span>
              <button
                type="button"
                onClick={() => setSchool({ ...school, logoDataUrl: '' })}
                className="text-sm underline"
              >
                Remover logotipo
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={busy || (!school.id && schools.length >= (role === 'teacher' ? 6 : 30))}
            className="rounded-lg bg-blue-700 px-5 py-3 text-white"
          >
            {busy
              ? 'Salvando…'
              : onboarding
                ? 'Salvar e entrar no portal'
                : 'Salvar perfil e escola'}
          </button>
        </fieldset>
      </form>
      {onboarding && (
        <button
          type="button"
          className="mt-4 text-sm underline"
          onClick={() => {
            apiFetch(`${apiUrl}/api/auth/logout`, { method: 'POST' })
              .then((r) => {
                if (r.ok) window.location.reload();
                else setMessage('Não foi possível sair.');
              })
              .catch(() => setMessage('Falha de conexão.'));
          }}
        >
          Sair da conta
        </button>
      )}
    </section>
  );
}
