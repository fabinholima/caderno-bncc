'use client';
import { type SubmitEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type SchoolSuggestion = Omit<School, 'id' | 'logoDataUrl'> & { addressNumber?: string };
const onlyDigits = (value: string) => value.replace(/\D/g, '');
const maskPostalCode = (value: string) => {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};
const maskCnpj = (value: string) => {
  const digits = onlyDigits(value).slice(0, 14);
  return digits.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};
const maskSchoolPhone = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  const area = digits.slice(0, 2), rest = digits.slice(2);
  return `(${area}) ${rest.length > 8 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : rest.length > 4 ? `${rest.slice(0, 4)}-${rest.slice(4)}` : rest}`;
};
const validCnpj = (value: string) => {
  const cnpj = onlyDigits(value);
  if (!cnpj) return true;
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((total, char, index) => total + Number(char) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const second = digit(cnpj.slice(0, 12) + first, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj.endsWith(`${first}${second}`);
};

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
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolSuggestions, setSchoolSuggestions] = useState<SchoolSuggestion[]>([]);
  const [schoolSearchMessage, setSchoolSearchMessage] = useState('');
  const [schoolSearching, setSchoolSearching] = useState(false);
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
  useEffect(() => {
    const query = schoolQuery.trim();
    if (query.length < 3) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSchoolSearching(true);
      try {
        const params = new URLSearchParams({ q: query, uf: school.state });
        const response = await apiFetch(`${apiUrl}/api/escolas?${params.toString()}`);
        const body = (await response.json()) as { data?: SchoolSuggestion[]; error?: string };
        if (!response.ok) throw new Error(body.error || 'Não foi possível buscar escolas.');
        if (!active) return;
        const results = body.data || [];
        setSchoolSuggestions(results);
        setSchoolSearchMessage(results.length ? '' : 'Escola não encontrada, preencha manualmente');
      } catch (error) {
        if (active) {
          setSchoolSuggestions([]);
          setSchoolSearchMessage(error instanceof Error ? error.message : 'Falha ao buscar escolas.');
        }
      } finally {
        if (active) setSchoolSearching(false);
      }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [apiUrl, schoolQuery, school.state]);
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validCnpj(school.cnpj)) {
      setMessage('Informe um CNPJ válido ou deixe o campo em branco.');
      return;
    }
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
        value={key === 'cnpj' ? maskCnpj(school[key]) : key === 'postalCode' ? maskPostalCode(school[key]) : key === 'phone' ? maskSchoolPhone(school[key]) : school[key]}
        maxLength={key === 'name' ? 140 : key === 'city' ? 100 : 240}
        type={key === 'email' ? 'email' : 'text'}
        onChange={(e) =>
          setSchool({
            ...school,
            [key]: ['cnpj', 'inep', 'postalCode'].includes(key)
              ? e.target.value.replace(/\D/g, '').slice(0, key === 'cnpj' ? 14 : key === 'inep' ? 8 : 8)
              : key === 'phone' ? maskSchoolPhone(e.target.value)
              : e.target.value,
          })
        }
        inputMode={['cnpj', 'inep', 'postalCode', 'phone'].includes(key) ? 'numeric' : undefined}
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
            <div className="relative text-sm sm:col-span-2">
              <label htmlFor="school-name">Nome da escola</label>
              <input
                id="school-name"
                required
                autoComplete="off"
                value={school.name}
                onChange={(event) => {
                  const value = event.target.value;
                  const selected = schoolSuggestions.find((item) => `${item.name} - ${item.city}/${item.state} - ${item.inep}` === value);
                  if (selected) {
                    setSchool({ ...school, id: undefined, name: selected.name, schoolType: selected.schoolType || school.schoolType, cnpj: selected.cnpj || '', inep: selected.inep || '', address: [selected.address, selected.addressNumber].filter(Boolean).join(', '), city: selected.city || '', state: selected.state || school.state, postalCode: selected.postalCode || '', phone: selected.phone || '', email: selected.email || '' });
                    setSchoolQuery(''); setSchoolSuggestions([]); setSchoolSearchMessage('Escola selecionada. Os campos continuam editáveis.'); setSchoolSearching(false);
                    return;
                  }
                  setSchool({ ...school, name: value, id: undefined });
                  setSchoolQuery(value);
                  setSchoolSearchMessage('');
                  if (value.trim().length < 3) { setSchoolSuggestions([]); setSchoolSearching(false); }
                }}
                className="mt-1 w-full rounded-lg border p-2"
                placeholder="Digite ao menos 3 caracteres ou o código INEP"
              />
              {schoolSearching && <span className="mt-1 block text-xs text-slate-500">Buscando escolas…</span>}
              {schoolSearchMessage && <output className="mt-1 block text-xs text-slate-600">{schoolSearchMessage}</output>}
              {schoolSuggestions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white p-1 shadow-lg">
                  {schoolSuggestions.map((item) => <button key={item.inep} type="button" className="block w-full rounded-md px-3 py-2 text-left hover:bg-blue-50" onClick={() => {
                    setSchool({ ...school, id: undefined, name: item.name, schoolType: item.schoolType || school.schoolType, cnpj: item.cnpj || '', inep: item.inep || '', address: [item.address, item.addressNumber].filter(Boolean).join(', '), city: item.city || '', state: item.state || school.state, postalCode: item.postalCode || '', phone: item.phone || '', email: item.email || '' });
                    setSchoolQuery(''); setSchoolSuggestions([]); setSchoolSearchMessage('Escola selecionada. Os campos continuam editáveis.'); setSchoolSearching(false);
                  }}>{item.name} - {item.city}/{item.state} - {item.inep}</button>)}
                </div>
              )}
            </div>
            <label className="text-sm">
              Rede / tipo
              <select
                value={school.schoolType}
                onChange={(e) =>
                  setSchool({ ...school, schoolType: e.target.value })
                }
                className="mt-1 w-full rounded-lg border p-2"
              >
                {[
                  ['estadual', 'Estadual'],
                  ['municipal', 'Municipal'],
                  ['federal', 'Federal'],
                  ['privada', 'Privada'],
                  ...(school.schoolType === 'outra' ? [['outra', 'Outra (cadastro anterior)']] : []),
                ].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
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
