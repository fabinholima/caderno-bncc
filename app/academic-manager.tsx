'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarCheck,
  Download,
  Eye,
  GraduationCap,
  RefreshCw,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

type SchoolClass = {
  id: string;
  name: string;
  grade: string;
  schoolYear: number;
  students: number;
};
type Student = {
  id: string;
  registration: string;
  name: string;
  active: boolean;
};
type Assessment = { id: string; title: string; grade: string };
type Application = {
  id: string;
  title: string;
  className: string;
  students: number;
  completed: number;
  scheduledAt: string;
  status: string;
};
type Assignment = {
  id: string;
  studentName: string;
  registration: string;
  number?: number;
  versionCode: string;
  renderJobId: string;
  status: string;
};
type ApplicationAssignment = Assignment & {
  renderStatus: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  downloads?: { prova: string; gabarito: string } | null;
};
type ApplicationDetail = Application & {
  grade: string;
  schoolYear: number;
  canCancel: boolean;
  assignments: ApplicationAssignment[];
};
type CardScan = {
  id: string;
  status: string;
  studentName?: string;
  versionCode?: string;
  submissionId?: string;
  score?: number | null;
  maxScore?: number | null;
  sourcePage?: number;
  sourcePages?: number;
  result?: {
    answers: Array<{
      questionNumber: number;
      selectedLabels: string[];
      status: string;
    }>;
  };
  error?: string;
  imageAvailable?: boolean;
};
type ScanReviewCandidate = {
  id: string;
  studentName: string;
  registration: string;
  number?: number;
  versionCode: string;
  assessmentTitle: string;
  className: string;
  questions: Array<{
    number: number;
    type: string;
    labels: string[];
  }>;
};
type ScanReview = {
  id: string;
  status: string;
  error?: string;
  applicationStudentId?: string;
  imageAvailable: boolean;
  detectedAnswers: Array<{
    questionNumber: number;
    selectedLabels: string[];
  }>;
  candidates: ScanReviewCandidate[];
};
type ApiBody<T> = { data?: T; error?: string };
type ApplicationReport = {
  application: {
    id: string;
    title: string;
    className: string;
    grade: string;
    schoolYear: number;
  };
  summary: {
    students: number;
    corrected: number;
    review: number;
    awaiting: number;
    averagePercentage: number;
  };
  students: Array<{
    id: string;
    name: string;
    number?: number;
    versionCode: string;
    status: 'corrected' | 'manual_review' | 'review' | 'awaiting';
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
  }>;
  skills: Array<{
    code: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
  competencies: Array<{
    sourceKey: string;
    number: number;
    description: string;
    area: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
};

export function AcademicManager({ apiUrl }: { apiUrl: string }) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [lastAssignments, setLastAssignments] = useState<Assignment[]>([]);
  const [applicationDetail, setApplicationDetail] =
    useState<ApplicationDetail | null>(null);
  const [scans, setScans] = useState<CardScan[]>([]);
  const [scanReview, setScanReview] = useState<ScanReview | null>(null);
  const [reviewCandidateId, setReviewCandidateId] = useState('');
  const [reviewAnswers, setReviewAnswers] = useState<Record<number, string[]>>(
    {},
  );
  const [report, setReport] = useState<ApplicationReport | null>(null);
  const [message, setMessage] = useState('');
  const refresh = async () => {
    if (!apiUrl) return;
    const [c, s, a, ap, sc] = await Promise.all([
      apiFetch(`${apiUrl}/api/classes`).then(
        (r) => r.json() as Promise<ApiBody<SchoolClass[]>>,
      ),
      apiFetch(`${apiUrl}/api/students`).then(
        (r) => r.json() as Promise<ApiBody<Student[]>>,
      ),
      apiFetch(`${apiUrl}/api/assessments`).then(
        (r) => r.json() as Promise<ApiBody<Assessment[]>>,
      ),
      apiFetch(`${apiUrl}/api/assessment-applications`).then(
        (r) => r.json() as Promise<ApiBody<Application[]>>,
      ),
      apiFetch(`${apiUrl}/api/card-scans`).then(
        (r) => r.json() as Promise<ApiBody<CardScan[]>>,
      ),
    ]);
    setClasses(c.data || []);
    setStudents(s.data || []);
    setAssessments(a.data || []);
    setApplications(ap.data || []);
    setScans(sc.data || []);
  };
  useEffect(() => {
    refresh().catch(() =>
      setMessage('Não foi possível carregar os dados acadêmicos.'),
    );
  }, [apiUrl]);
  const post = async (
    path: string,
    form: HTMLFormElement,
    transform: (data: FormData) => object,
  ) => {
    const response = await apiFetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(transform(new FormData(form))),
    });
    const body = (await response.json()) as ApiBody<unknown>;
    if (!response.ok) throw new Error(body.error || 'Não foi possível salvar.');
    form.reset();
    setMessage('Dados salvos com sucesso.');
    await refresh();
    return body.data;
  };
  const loadReport = async (applicationId: string) => {
    const response = await apiFetch(
      `${apiUrl}/api/assessment-applications/${applicationId}/report`,
    );
    const body = (await response.json()) as ApiBody<ApplicationReport>;
    if (!response.ok || !body.data)
      throw new Error(body.error || 'Não foi possível gerar o relatório.');
    setReport(body.data);
  };
  const loadApplication = async (applicationId: string) => {
    const response = await apiFetch(
      `${apiUrl}/api/assessment-applications/${applicationId}`,
    );
    const body = (await response.json()) as ApiBody<ApplicationDetail>;
    if (!response.ok || !body.data)
      throw new Error(body.error || 'Não foi possível abrir a aplicação.');
    setApplicationDetail(body.data);
  };
  const retryFailed = async (applicationId: string) => {
    const response = await apiFetch(
      `${apiUrl}/api/assessment-applications/${applicationId}/retry`,
      { method: 'POST' },
    );
    const body = (await response.json()) as ApiBody<{ retried: number }>;
    if (!response.ok || !body.data) throw new Error(body.error);
    setMessage(
      body.data.retried
        ? `${body.data.retried} PDF(s) reenviado(s) para a fila.`
        : 'Não há PDFs com falha para reprocessar.',
    );
    await Promise.all([refresh(), loadApplication(applicationId)]);
  };
  const cancelScheduled = async (applicationId: string) => {
    if (!window.confirm('Cancelar esta aplicação antes da impressão?')) return;
    const response = await apiFetch(
      `${apiUrl}/api/assessment-applications/${applicationId}/cancel`,
      { method: 'POST' },
    );
    const body = (await response.json()) as ApiBody<{ status: string }>;
    if (!response.ok) throw new Error(body.error);
    setMessage(
      'Aplicação cancelada. Os trabalhos pendentes foram interrompidos.',
    );
    await Promise.all([refresh(), loadApplication(applicationId)]);
  };
  const loadScanReview = async (scanId: string) => {
    const response = await apiFetch(`${apiUrl}/api/card-scans/${scanId}`);
    const body = (await response.json()) as ApiBody<ScanReview>;
    if (!response.ok || !body.data)
      throw new Error(body.error || 'Não foi possível abrir o cartão.');
    const candidateId =
      body.data.applicationStudentId || body.data.candidates[0]?.id || '';
    setScanReview(body.data);
    setReviewCandidateId(candidateId);
    setReviewAnswers(
      Object.fromEntries(
        body.data.detectedAnswers.map((answer) => [
          answer.questionNumber,
          answer.selectedLabels,
        ]),
      ),
    );
  };
  const confirmScan = async () => {
    if (!scanReview || !reviewCandidateId)
      throw new Error('Selecione o aluno identificado no cartão.');
    const candidate = scanReview.candidates.find(
      (item) => item.id === reviewCandidateId,
    );
    if (!candidate) throw new Error('Aluno selecionado não encontrado.');
    const response = await apiFetch(
      `${apiUrl}/api/card-scans/${scanReview.id}/confirm`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          applicationStudentId: reviewCandidateId,
          responses: candidate.questions.map((question) => ({
            questionNumber: question.number,
            selectedLabels: reviewAnswers[question.number] || [],
          })),
        }),
      },
    );
    const body = (await response.json()) as ApiBody<{
      score: number;
      maxScore: number;
    }>;
    if (!response.ok || !body.data) throw new Error(body.error);
    setMessage(
      `Cartão confirmado. Nota: ${body.data.score.toLocaleString('pt-BR')} de ${body.data.maxScore.toLocaleString('pt-BR')}.`,
    );
    setScanReview(null);
    await refresh();
  };
  const retryCard = async (scanId: string) => {
    const response = await apiFetch(
      `${apiUrl}/api/card-scans/${scanId}/retry`,
      {
        method: 'POST',
      },
    );
    const body = (await response.json()) as ApiBody<unknown>;
    if (!response.ok) throw new Error(body.error);
    setMessage('Cartão reenviado para leitura automática.');
    setScanReview(null);
    await refresh();
  };
  const reviewCandidate = scanReview?.candidates.find(
    (candidate) => candidate.id === reviewCandidateId,
  );
  return (
    <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-600">
        Gestão acadêmica
      </p>
      <h1 className="font-display mt-1 text-3xl font-bold text-[var(--navy)]">
        Turmas e alunos
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Organize as turmas, matricule estudantes e associe uma avaliação para
        gerar cartões identificados.
      </p>
      {message && (
        <output className="mt-4 block rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {message}
        </output>
      )}
      <div className="mt-7 grid gap-5 xl:grid-cols-3">
        <Panel icon={<GraduationCap />} title="Nova turma">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              post('/api/classes', e.currentTarget, (d) => ({
                name: d.get('name'),
                grade: d.get('grade'),
                schoolYear: Number(d.get('schoolYear')),
              })).catch((x) => setMessage(x.message));
            }}
          >
            <Input name="name" required placeholder="Ex.: 3º A" />
            <Input name="grade" required placeholder="Ensino Médio" />
            <Input
              name="schoolYear"
              type="number"
              min="2000"
              max="2100"
              defaultValue="2026"
              required
            />
            <Button type="submit" className="w-full">
              Criar turma
            </Button>
          </form>
        </Panel>
        <Panel icon={<UserPlus />} title="Novo aluno">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              post('/api/students', e.currentTarget, (d) => ({
                registration: d.get('registration'),
                name: d.get('name'),
              })).catch((x) => setMessage(x.message));
            }}
          >
            <Input name="name" required placeholder="Nome completo" />
            <Input name="registration" required placeholder="Matrícula" />
            <Button type="submit" className="w-full">
              Cadastrar aluno
            </Button>
          </form>
        </Panel>
        <Panel icon={<Users />} title="Matricular na turma">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              post(
                `/api/classes/${d.get('classId')}/enrollments`,
                e.currentTarget,
                (x) => ({
                  studentId: x.get('studentId'),
                  number: x.get('number') ? Number(x.get('number')) : undefined,
                }),
              ).catch((x) => setMessage(x.message));
            }}
          >
            <Select
              name="classId"
              label="Selecione a turma"
              items={classes.map((x) => [x.id, `${x.name} · ${x.grade}`])}
            />
            <Select
              name="studentId"
              label="Selecione o aluno"
              items={students.map((x) => [
                x.id,
                `${x.name} · ${x.registration}`,
              ])}
            />
            <Input
              name="number"
              type="number"
              min="1"
              placeholder="Número na chamada"
            />
            <Button type="submit" className="w-full">
              Matricular
            </Button>
          </form>
        </Panel>
      </div>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-5 text-blue-600" />
          <h2 className="font-display text-xl font-bold">
            Aplicar avaliação a uma turma
          </h2>
        </div>
        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_220px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            post('/api/assessment-applications', e.currentTarget, (d) => ({
              assessmentId: d.get('assessmentId'),
              classId: d.get('classId'),
              scheduledAt: new Date(String(d.get('scheduledAt'))).toISOString(),
            }))
              .then((data) =>
                setLastAssignments(
                  (data as { assignments: Assignment[] }).assignments || [],
                ),
              )
              .catch((x) => setMessage(x.message));
          }}
        >
          <Select
            name="assessmentId"
            label="Selecione a avaliação"
            items={assessments.map((x) => [x.id, x.title])}
          />
          <Select
            name="classId"
            label="Selecione a turma"
            items={classes.map((x) => [x.id, x.name])}
          />
          <Input name="scheduledAt" type="datetime-local" required />
          <Button type="submit">Agendar aplicação</Button>
        </form>
      </section>
      {lastAssignments.length > 0 && (
        <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-display text-lg font-bold text-emerald-900">
            Distribuição criada
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            As versões foram alternadas e um PDF individual entrou na fila para
            cada aluno.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {lastAssignments.map((x) => (
              <div
                key={x.id}
                className="flex justify-between rounded-lg bg-white px-3 py-2 text-sm"
              >
                <span>
                  {x.number ? `${x.number}. ` : ''}
                  {x.studentName}
                </span>
                <b>Versão {x.versionCode}</b>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="border-b p-4 font-semibold">
          Aplicações e PDFs individuais
        </header>
        {applications.length ? (
          applications.map((x) => (
            <div
              key={x.id}
              className="flex flex-wrap justify-between gap-2 border-b px-4 py-3 text-sm last:border-0"
            >
              <span>
                <b>{x.title}</b> · {x.className}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-slate-500">
                  {x.completed}/{x.students} PDFs prontos
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    loadApplication(x.id).catch((error) =>
                      setMessage(error.message),
                    )
                  }
                >
                  <Eye />
                  Detalhes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    loadReport(x.id).catch((error) => setMessage(error.message))
                  }
                >
                  Ver relatório
                </Button>
                {x.students > 0 && x.completed === x.students && (
                  <Button asChild type="button" size="sm">
                    <a
                      href={`${apiUrl}/api/assessment-applications/${x.id}/pdf`}
                      download
                    >
                      <Download />
                      Baixar lote
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="p-6 text-sm text-slate-400">
            Nenhuma aplicação agendada.
          </p>
        )}
      </section>
      {applicationDetail && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">
                {applicationDetail.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {applicationDetail.className} · {applicationDetail.grade} ·{' '}
                {applicationDetail.schoolYear} ·{' '}
                {applicationDetail.status === 'cancelled'
                  ? 'Cancelada'
                  : 'Agendada'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {applicationDetail.assignments.some(
                (assignment) => assignment.renderStatus === 'failed',
              ) &&
                applicationDetail.status !== 'cancelled' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      retryFailed(applicationDetail.id).catch((error) =>
                        setMessage(error.message),
                      )
                    }
                  >
                    <RefreshCw />
                    Reprocessar falhas
                  </Button>
                )}
              {applicationDetail.canCancel && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-rose-700"
                  onClick={() =>
                    cancelScheduled(applicationDetail.id).catch((error) =>
                      setMessage(error.message),
                    )
                  }
                >
                  <XCircle />
                  Cancelar aplicação
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Aluno</th>
                  <th>Matrícula</th>
                  <th>Versão</th>
                  <th>Situação do PDF</th>
                  <th>Downloads</th>
                </tr>
              </thead>
              <tbody>
                {applicationDetail.assignments.map((assignment) => (
                  <tr key={assignment.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      {assignment.number ? `${assignment.number}. ` : ''}
                      {assignment.studentName}
                    </td>
                    <td>{assignment.registration}</td>
                    <td>{assignment.versionCode}</td>
                    <td>
                      {assignment.renderStatus === 'completed'
                        ? 'Pronto'
                        : assignment.renderStatus === 'failed'
                          ? `Falhou${assignment.error ? ` · ${assignment.error}` : ''}`
                          : assignment.renderStatus === 'running'
                            ? 'Compondo'
                            : 'Na fila'}
                    </td>
                    <td>
                      {assignment.downloads ? (
                        <div className="flex gap-2">
                          <a
                            className="font-semibold text-blue-700 hover:underline"
                            href={`${apiUrl}${assignment.downloads.prova}`}
                            download
                          >
                            Prova
                          </a>
                          <a
                            className="font-semibold text-blue-700 hover:underline"
                            href={`${apiUrl}${assignment.downloads.gabarito}`}
                            download
                          >
                            Gabarito
                          </a>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {report && (
        <section className="mt-5 rounded-2xl border border-blue-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-5 text-blue-600" />
            <div>
              <h2 className="font-display text-xl font-bold">
                Relatório pedagógico
              </h2>
              <p className="text-sm text-slate-500">
                {report.application.title} · {report.application.className}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Alunos', report.summary.students],
              ['Corrigidos', report.summary.corrected],
              ['Para revisar', report.summary.review],
              ['Aguardando', report.summary.awaiting],
              ['Média', `${report.summary.averagePercentage}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-bold text-[var(--navy)]">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <ReportPerformance
              title="Desempenho por habilidade BNCC"
              empty="As correções ainda não possuem habilidades consolidadas."
              items={report.skills.map((item) => ({
                key: item.code,
                label: item.code,
                detail: `${item.correct}/${item.total} acertos`,
                percentage: item.percentage,
              }))}
            />
            <ReportPerformance
              title="Desempenho por competência"
              empty="Esta aplicação ainda não possui competências vinculadas."
              items={report.competencies.map((item) => ({
                key: item.sourceKey,
                label: `Competência ${item.number} · ${item.area}`,
                detail: item.description,
                percentage: item.percentage,
              }))}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">Aluno</th>
                  <th>Versão</th>
                  <th>Situação</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {report.students.map((student) => (
                  <tr key={student.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      {student.number ? `${student.number}. ` : ''}
                      {student.name}
                    </td>
                    <td>{student.versionCode}</td>
                    <td>
                      {student.status === 'corrected'
                        ? 'Corrigido'
                        : student.status === 'review'
                          ? 'Revisar cartão'
                          : student.status === 'manual_review'
                            ? 'Correção manual'
                            : 'Aguardando'}
                    </td>
                    <td className="font-semibold">
                      {student.score == null
                        ? '—'
                        : `${student.score}/${student.maxScore} · ${student.percentage}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-display text-xl font-bold">
          Corrigir cartão-resposta
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Selecione vários cartões PNG/JPEG/PDF ou envie um único PDF com um
          cartão por página. Cada página é corrigida separadamente; leituras
          duvidosas não interrompem as demais.
        </p>
        <label className="mt-4 inline-flex cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Enviar cartões
          <input
            className="sr-only"
            type="file"
            multiple
            accept="image/png,image/jpeg,application/pdf"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              if (files.length > 20) {
                setMessage('Selecione no máximo 20 arquivos por envio.');
                return;
              }
              if (files.some((file) => file.size > 6_000_000)) {
                setMessage('Cada arquivo deve ter no máximo 6 MB.');
                return;
              }
              const asDataUrl = (file: File) =>
                new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(file);
                });
              void (async () => {
                try {
                  await Promise.all(
                    files.map(async (file) => {
                      const response = await apiFetch(
                        `${apiUrl}/api/card-scans`,
                        {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({
                            imageDataUrl: await asDataUrl(file),
                          }),
                        },
                      );
                      const body = (await response.json()) as ApiBody<unknown>;
                      if (!response.ok) throw new Error(body.error);
                    }),
                  );
                  setMessage(
                    `${files.length} arquivo(s) enviado(s) para leitura OMR.`,
                  );
                  e.target.value = '';
                  await refresh();
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : 'Falha no envio.',
                  );
                }
              })();
            }}
          />
        </label>
        <div className="mt-4 space-y-2">
          {scans.map((x) => (
            <div
              key={x.id}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <div className="flex justify-between">
                <span>
                  {x.studentName || 'Identificando cartão'}{' '}
                  {x.versionCode ? `· Versão ${x.versionCode}` : ''}
                  {x.sourcePages && x.sourcePages > 1
                    ? ` · Página ${x.sourcePage}/${x.sourcePages}`
                    : ''}
                </span>
                <b>
                  {x.status === 'completed'
                    ? 'Corrigido'
                    : x.status === 'review'
                      ? 'Revisar'
                      : x.status === 'failed'
                        ? 'Falhou'
                        : 'Processando'}
                </b>
              </div>
              {x.result?.answers?.map((a) => (
                <p
                  key={a.questionNumber}
                  className="mt-1 text-xs text-slate-500"
                >
                  Questão {a.questionNumber}:{' '}
                  {a.selectedLabels.join(', ') || 'em branco'} · {a.status}
                </p>
              ))}
              {x.score != null && x.maxScore != null && (
                <p className="mt-2 font-semibold text-emerald-700">
                  Nota: {x.score.toLocaleString('pt-BR')} de{' '}
                  {x.maxScore.toLocaleString('pt-BR')}
                </p>
              )}
              {x.error && (
                <p className="mt-1 text-xs text-rose-600">{x.error}</p>
              )}
              {x.imageAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    loadScanReview(x.id).catch((error) =>
                      setMessage(error.message),
                    )
                  }
                >
                  Revisar cartão
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
      {scanReview && (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">
                Revisão do cartão-resposta
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Confira o aluno e cada marcação antes de recalcular a nota.
              </p>
            </div>
            <div className="flex gap-2">
              {['review', 'failed'].includes(scanReview.status) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    retryCard(scanReview.id).catch((error) =>
                      setMessage(error.message),
                    )
                  }
                >
                  <RefreshCw />
                  Reprocessar OMR
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setScanReview(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
            <div className="overflow-hidden rounded-xl border bg-slate-100">
              {scanReview.imageAvailable ? (
                <img
                  src={`${apiUrl}/api/card-scans/${scanReview.id}/image`}
                  alt="Página original do cartão-resposta"
                  className="mx-auto max-h-[760px] w-full object-contain"
                />
              ) : (
                <p className="p-6 text-sm text-slate-500">
                  A imagem original não está disponível.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-semibold">
                Aluno e versão
                <select
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3"
                  value={reviewCandidateId}
                  onChange={(event) => {
                    setReviewCandidateId(event.target.value);
                    setReviewAnswers({});
                  }}
                >
                  <option value="">Selecione...</option>
                  {scanReview.candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.number ? `${candidate.number}. ` : ''}
                      {candidate.studentName} · {candidate.className} · Versão{' '}
                      {candidate.versionCode}
                    </option>
                  ))}
                </select>
              </label>
              {scanReview.error && (
                <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  Leitura automática: {scanReview.error}
                </p>
              )}
              <div className="mt-4 space-y-3">
                {reviewCandidate?.questions.map((question) => (
                  <div
                    key={question.number}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <p className="text-sm font-semibold">
                      Questão {question.number}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.labels.map((label) => {
                        const selected = (
                          reviewAnswers[question.number] || []
                        ).includes(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={selected}
                            className={`grid size-10 place-items-center rounded-full border text-sm font-bold ${
                              selected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700'
                            }`}
                            onClick={() =>
                              setReviewAnswers((current) => {
                                const answers = current[question.number] || [];
                                return {
                                  ...current,
                                  [question.number]:
                                    question.type === 'single_choice'
                                      ? selected
                                        ? []
                                        : [label]
                                      : selected
                                        ? answers.filter(
                                            (answer) => answer !== label,
                                          )
                                        : [...answers, label],
                                };
                              })
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="mt-5 w-full"
                disabled={!reviewCandidate}
                onClick={() =>
                  confirmScan().catch((error) => setMessage(error.message))
                }
              >
                Confirmar e calcular nota
              </Button>
            </div>
          </div>
        </section>
      )}
      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="border-b p-4 font-semibold">
          Turmas cadastradas
        </header>
        {classes.length ? (
          classes.map((x) => (
            <div
              key={x.id}
              className="flex justify-between border-b px-4 py-3 text-sm last:border-0"
            >
              <span>
                <b>{x.name}</b> · {x.grade}
              </span>
              <span className="text-slate-500">
                {x.schoolYear} · {x.students} alunos
              </span>
            </div>
          ))
        ) : (
          <p className="p-6 text-sm text-slate-400">
            Nenhuma turma cadastrada.
          </p>
        )}
      </section>
    </main>
  );
}

function ReportPerformance({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    key: string;
    label: string;
    detail: string;
    percentage: number;
  }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-[var(--navy)]">{title}</h3>
      {items.length ? (
        <div className="mt-3 space-y-4">
          {items.map((item) => (
            <div key={item.key}>
              <div className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.detail}
                  </p>
                </div>
                <b>{item.percentage}%</b>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${item.percentage < 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">{empty}</p>
      )}
    </div>
  );
}
function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[var(--navy)]">
        {icon}
        <h2 className="font-display text-lg font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}
function Select({
  name,
  label,
  items,
}: {
  name: string;
  label: string;
  items: Array<[string, string]>;
}) {
  return (
    <select
      name={name}
      required
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
    >
      <option value="">{label}</option>
      {items.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}
