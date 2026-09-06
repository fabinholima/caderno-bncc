'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Eye,
  FileText,
  FileUp,
  RefreshCw,
  ScanText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';

type ExamImport = {
  id: string;
  sourceInstitution: string;
  sourceYear: number;
  examType: string;
  subjectMode: string;
  primarySubject?: string;
  sourceUrl?: string;
  rightsStatus: string;
  status: string;
  detectedQuestions: number;
  reviewedQuestions: number;
  error?: string;
  candidates: ExamImportCandidate[];
  documents: Array<{
    id: string;
    kind: 'exam' | 'answer_key';
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  createdAt: string;
};

type ExamImportCandidate = {
  id: string;
  sourceNumber: number;
  rawText: string;
  selected: boolean;
  questionType: 'single_choice' | 'multiple_choice' | 'essay';
  status: 'complete' | 'review' | 'completed';
  pageNumber?: number;
  extractionMethod?: 'text' | 'ocr';
};

type PdfPreview = {
  name: string;
  size: number;
  url: string;
};

type StoredPdfPreview = {
  importId: string;
  documentId: string;
  title: string;
  name: string;
  size: number;
};

const statusLabels: Record<string, string> = {
  uploaded: 'Documentos recebidos',
  queued: 'Na fila',
  extracting: 'Extraindo',
  extracted: 'Extração concluída',
  needs_review: 'Aguardando revisão',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const rightsLabels: Record<string, string> = {
  pending_review: 'Direitos pendentes',
  authorized: 'Uso autorizado',
  public_license: 'Licença pública',
  citation_only: 'Somente citação',
  restricted: 'Uso interno',
  blocked: 'Uso bloqueado',
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Não foi possível ler o PDF.'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ExamImportManager({
  apiUrl,
  role,
  onRegisterQuestion,
}: {
  apiUrl: string;
  role: 'admin' | 'coordinator' | 'teacher';
  onRegisterQuestion: (value: {
    importId: string;
    candidateId: string;
    rawText: string;
    sourceInstitution: string;
    sourceYear: number;
    questionType: ExamImportCandidate['questionType'];
  }) => void;
}) {
  const [imports, setImports] = useState<ExamImport[]>([]);
  const [subjectMode, setSubjectMode] = useState('single');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [examPreview, setExamPreview] = useState<PdfPreview | null>(null);
  const [answerKeyPreview, setAnswerKeyPreview] = useState<PdfPreview | null>(
    null,
  );
  const [storedPreview, setStoredPreview] = useState<StoredPdfPreview | null>(
    null,
  );
  const [extractingId, setExtractingId] = useState('');
  const [pagePreviewCandidateId, setPagePreviewCandidateId] = useState('');

  useEffect(
    () => () => {
      if (examPreview) URL.revokeObjectURL(examPreview.url);
    },
    [examPreview],
  );

  useEffect(
    () => () => {
      if (answerKeyPreview) URL.revokeObjectURL(answerKeyPreview.url);
    },
    [answerKeyPreview],
  );

  const updatePreview = (
    file: File | null,
    setter: (preview: PdfPreview | null) => void,
  ) => {
    setter(
      file
        ? { name: file.name, size: file.size, url: URL.createObjectURL(file) }
        : null,
    );
  };

  const refresh = async () => {
    const response = await apiFetch(`${apiUrl}/api/exam-imports`);
    const body = (await response.json()) as {
      data?: ExamImport[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || 'Falha ao listar importações.');
    setImports(body.data || []);
  };

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, [apiUrl]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const exam = data.get('examPdf');
    const answerKey = data.get('answerKeyPdf');
    if (!(exam instanceof File) || !exam.size)
      return setMessage('Selecione o PDF da prova.');
    const files = [
      exam,
      ...(answerKey instanceof File && answerKey.size ? [answerKey] : []),
    ];
    if (files.some((file) => file.type !== 'application/pdf'))
      return setMessage('Envie somente arquivos PDF.');
    if (files.some((file) => file.size > 15_000_000))
      return setMessage('Cada PDF deve ter no máximo 15 MB.');
    setBusy(true);
    setMessage('Enviando os documentos para a área de preparação...');
    try {
      const documents = await Promise.all(
        files.map(async (file, index) => ({
          kind: index === 0 ? 'exam' : 'answer_key',
          fileName: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      );
      const response = await apiFetch(`${apiUrl}/api/exam-imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceInstitution: String(data.get('sourceInstitution') || ''),
          sourceYear: Number(data.get('sourceYear')),
          examType: String(data.get('examType')),
          subjectMode,
          primarySubject:
            subjectMode === 'single'
              ? String(data.get('primarySubject') || '')
              : '',
          sourceUrl: String(data.get('sourceUrl') || ''),
          rightsStatus: String(data.get('rightsStatus')),
          documents,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'Falha ao enviar a prova.');
      form.reset();
      setSubjectMode('single');
      setExamPreview(null);
      setAnswerKeyPreview(null);
      setMessage(
        'Prova recebida. Ela permanece isolada até a revisão editorial.',
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro no envio.');
    } finally {
      setBusy(false);
    }
  };

  const extractQuestions = async (item: ExamImport) => {
    setExtractingId(item.id);
    setMessage('Lendo o PDF e separando as questões...');
    try {
      const response = await apiFetch(
        `${apiUrl}/api/exam-imports/${item.id}/extract`,
        { method: 'POST' },
      );
      const body = (await response.json()) as {
        data?: ExamImportCandidate[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível extrair as questões.');
      await refresh();
      setMessage(
        `${body.data?.length || 0} questões encontradas. Revise antes de cadastrar.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha na extração.');
      await refresh().catch(() => undefined);
    } finally {
      setExtractingId('');
    }
  };

  const updateCandidate = async (
    importId: string,
    candidateId: string,
    changes: Partial<ExamImportCandidate>,
  ) => {
    setImports((current) =>
      current.map((item) =>
        item.id === importId
          ? {
              ...item,
              candidates: item.candidates.map((candidate) =>
                candidate.id === candidateId
                  ? { ...candidate, ...changes }
                  : candidate,
              ),
            }
          : item,
      ),
    );
    const response = await apiFetch(
      `${apiUrl}/api/exam-imports/${importId}/candidates/${candidateId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      throw new Error(body.error || 'Não foi possível atualizar a questão.');
  };

  return (
    <main className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-violet-700">
        Curadoria editorial
      </p>
      <h1 className="font-display mt-1 text-3xl font-bold text-[var(--navy)]">
        Importar provas
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">
        Cadastre a fonte e envie os PDFs. Os documentos ficam em preparação e
        nenhuma questão entra no banco público sem revisão e aprovação.
      </p>
      {message && (
        <output className="mt-4 block rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-950">
          {message}
        </output>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <FileUp className="size-5 text-violet-700" />
          <h2 className="font-display text-xl font-bold">Nova importação</h2>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              name="sourceInstitution"
              required
              placeholder="Instituição: ITA, Fuvest..."
            />
            <Input
              name="sourceYear"
              required
              type="number"
              min="1900"
              max="2100"
              defaultValue="2025"
            />
            <SelectField
              name="examType"
              label="Tipo de prova"
              options={[
                ['vestibular', 'Vestibular'],
                ['concurso', 'Concurso'],
                ['enem', 'ENEM'],
                ['simulado', 'Simulado'],
                ['other', 'Outro'],
              ]}
            />
            <SelectField
              name="subjectMode"
              label="Organização"
              value={subjectMode}
              onChange={setSubjectMode}
              options={[
                ['single', 'Uma disciplina'],
                ['multidisciplinary', 'Multidisciplinar'],
              ]}
            />
            {subjectMode === 'single' && (
              <Input
                name="primarySubject"
                required
                placeholder="Disciplina: Química"
              />
            )}
            <Input
              name="sourceUrl"
              type="url"
              placeholder="URL oficial de origem (opcional)"
            />
            <SelectField
              name="rightsStatus"
              label="Direitos de uso"
              options={
                role === 'teacher'
                  ? [
                      ['pending_review', 'Pendente de análise'],
                      ['restricted', 'Somente uso interno'],
                    ]
                  : [
                      ['pending_review', 'Pendente de análise'],
                      ['authorized', 'Uso autorizado'],
                      ['public_license', 'Licença pública'],
                      ['citation_only', 'Somente citação'],
                      ['restricted', 'Somente uso interno'],
                      ['blocked', 'Uso bloqueado'],
                    ]
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PdfField
              name="examPdf"
              title="PDF da prova"
              required
              onFileSelected={(file) => updatePreview(file, setExamPreview)}
            />
            <PdfField
              name="answerKeyPdf"
              title="PDF do gabarito"
              onFileSelected={(file) =>
                updatePreview(file, setAnswerKeyPreview)
              }
            />
          </div>
          {(examPreview || answerKeyPreview) && (
            <section aria-labelledby="pdf-preview-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3
                    id="pdf-preview-title"
                    className="font-display text-lg font-bold text-[var(--navy)]"
                  >
                    Prévia dos documentos
                  </h3>
                  <p className="text-xs text-slate-500">
                    Confira os arquivos antes de criar a importação.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Ainda não enviados
                </span>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {examPreview && (
                  <PdfPreviewCard title="Prova" preview={examPreview} />
                )}
                {answerKeyPreview && (
                  <PdfPreviewCard title="Gabarito" preview={answerKeyPreview} />
                )}
              </div>
            </section>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="size-4 text-emerald-700" />
              PDF de até 15 MB por arquivo. A publicação permanece bloqueada
              nesta etapa.
            </p>
            <Button type="submit" disabled={busy}>
              <FileUp /> {busy ? 'Enviando...' : 'Criar importação'}
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              Trabalhos de importação
            </h2>
            <p className="text-sm text-slate-500">
              Documentos aguardando extração e revisão.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              refresh().catch((error) => setMessage(error.message))
            }
          >
            <RefreshCw /> Atualizar
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {!imports.length && (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
              Nenhuma prova foi enviada ainda.
            </p>
          )}
          {imports.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--navy)]">
                    {item.sourceInstitution} {item.sourceYear}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.primarySubject || 'Prova multidisciplinar'} ·{' '}
                    {statusLabels[item.status] || item.status}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${item.rightsStatus === 'authorized' || item.rightsStatus === 'public_license' ? 'bg-emerald-50 text-emerald-800' : item.rightsStatus === 'blocked' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}
                >
                  {rightsLabels[item.rightsStatus] || item.rightsStatus}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.documents.map((document) => (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() =>
                      setStoredPreview({
                        importId: item.id,
                        documentId: document.id,
                        title: document.kind === 'exam' ? 'Prova' : 'Gabarito',
                        name: document.fileName,
                        size: document.sizeBytes,
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs transition hover:bg-violet-50 hover:text-violet-900"
                  >
                    <FileText className="size-4 text-violet-700" />
                    {document.kind === 'exam' ? 'Prova' : 'Gabarito'}:{' '}
                    {document.fileName} ·{' '}
                    {(document.sizeBytes / 1_000_000).toFixed(1)} MB
                    <Eye className="ml-1 size-4" />
                    <span className="font-semibold">Visualizar</span>
                  </button>
                ))}
              </div>
              {storedPreview?.importId === item.id && (
                <StoredPdfPreviewCard
                  apiUrl={apiUrl}
                  preview={storedPreview}
                  onClose={() => setStoredPreview(null)}
                />
              )}
              <section className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-[var(--navy)]">
                      Questões extraídas
                    </h4>
                    <p className="text-xs text-slate-500">
                      Selecione, classifique e revise cada questão antes do
                      cadastro.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={extractingId === item.id}
                    onClick={() => extractQuestions(item)}
                  >
                    <ScanText />
                    {extractingId === item.id
                      ? 'Extraindo...'
                      : item.candidates?.length
                        ? 'Extrair novamente'
                        : 'Extrair questões'}
                  </Button>
                </div>
                {item.error && (
                  <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
                    {item.error}
                  </p>
                )}
                <div className="mt-3 space-y-3">
                  {(item.candidates || []).map((candidate) => (
                    <article
                      key={candidate.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={candidate.selected}
                            onChange={(event) =>
                              updateCandidate(item.id, candidate.id, {
                                selected: event.target.checked,
                              }).catch((error) => setMessage(error.message))
                            }
                            className="size-4 accent-violet-700"
                          />
                          Questão {candidate.sourceNumber}
                        </label>
                        <select
                          aria-label={`Tipo da questão ${candidate.sourceNumber}`}
                          value={candidate.questionType}
                          onChange={(event) =>
                            updateCandidate(item.id, candidate.id, {
                              questionType: event.target
                                .value as ExamImportCandidate['questionType'],
                            }).catch((error) => setMessage(error.message))
                          }
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs"
                        >
                          <option value="single_choice">
                            Múltipla escolha · uma resposta
                          </option>
                          <option value="multiple_choice">
                            Múltipla escolha · várias respostas
                          </option>
                          <option value="essay">Discursiva</option>
                        </select>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${candidate.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : candidate.status === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'}`}
                        >
                          {candidate.status === 'completed'
                            ? 'Concluída'
                            : candidate.status === 'review'
                              ? 'Em revisão'
                              : 'Completa'}
                        </span>
                        {candidate.pageNumber && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPagePreviewCandidateId((current) =>
                                current === candidate.id ? '' : candidate.id,
                              )
                            }
                          >
                            <Eye /> Página {candidate.pageNumber}
                          </Button>
                        )}
                        {candidate.extractionMethod === 'ocr' && (
                          <span className="text-xs font-semibold text-sky-700">
                            Texto obtido por OCR
                          </span>
                        )}
                      </div>
                      {pagePreviewCandidateId === candidate.id &&
                        candidate.pageNumber && (
                          <iframe
                            title={`Página original da questão ${candidate.sourceNumber}`}
                            src={`${apiUrl}/api/exam-imports/${item.id}/pages/${candidate.pageNumber}.jpg`}
                            className="mt-3 h-[620px] w-full rounded-lg border border-slate-200 bg-white"
                          />
                        )}
                      <textarea
                        aria-label={`Texto extraído da questão ${candidate.sourceNumber}`}
                        defaultValue={candidate.rawText}
                        rows={9}
                        onBlur={(event) => {
                          if (event.target.value.trim() !== candidate.rawText)
                            updateCandidate(item.id, candidate.id, {
                              rawText: event.target.value,
                              status: 'review',
                            }).catch((error) => setMessage(error.message));
                        }}
                        className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-5"
                      />
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          disabled={
                            !candidate.selected ||
                            candidate.status === 'completed'
                          }
                          onClick={() => {
                            updateCandidate(item.id, candidate.id, {
                              status: 'review',
                            }).catch((error) => setMessage(error.message));
                            onRegisterQuestion({
                              importId: item.id,
                              candidateId: candidate.id,
                              rawText: candidate.rawText,
                              sourceInstitution: item.sourceInstitution,
                              sourceYear: item.sourceYear,
                              questionType: candidate.questionType,
                            });
                          }}
                        >
                          Revisar e cadastrar <ArrowRight />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <p className="mt-3 text-xs text-slate-400">
                Criada em {new Date(item.createdAt).toLocaleString('pt-BR')} ·{' '}
                {item.detectedQuestions} detectadas · {item.reviewedQuestions}{' '}
                revisadas
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SelectField({
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
    <label className="block text-sm font-semibold text-slate-700">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        aria-label={label}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"
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

function PdfField({
  name,
  title,
  required = false,
  onFileSelected,
}: {
  name: string;
  title: string;
  required?: boolean;
  onFileSelected: (file: File | null) => void;
}) {
  return (
    <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <FileText className="mx-auto size-7 text-violet-700" />
      <span className="mt-2 block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">
        Selecione um arquivo PDF de até 15 MB.
      </span>
      <input
        name={name}
        type="file"
        accept="application/pdf,.pdf"
        required={required}
        onChange={(event) =>
          onFileSelected(event.currentTarget.files?.[0] || null)
        }
        className="mt-3 block w-full text-xs"
      />
    </label>
  );
}

function PdfPreviewCard({
  title,
  preview,
}: {
  title: string;
  preview: PdfPreview;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
            {title}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {preview.name}
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {(preview.size / 1_000_000).toFixed(1)} MB
        </span>
      </div>
      <iframe
        title={`Prévia do PDF: ${preview.name}`}
        src={`${preview.url}#toolbar=1&navpanes=0&view=FitH`}
        className="h-[520px] w-full bg-white"
      />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-right">
        <a
          href={preview.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          Abrir prévia em outra aba
        </a>
      </div>
    </article>
  );
}

function StoredPdfPreviewCard({
  apiUrl,
  preview,
  onClose,
}: {
  apiUrl: string;
  preview: StoredPdfPreview;
  onClose: () => void;
}) {
  const url = `${apiUrl}/api/exam-imports/${preview.importId}/documents/${preview.documentId}/pdf`;
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-violet-200 bg-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
            Prévia após a importação · {preview.title}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {preview.name} · {(preview.size / 1_000_000).toFixed(1)} MB
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar prévia"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <iframe
        title={`Prévia do PDF importado: ${preview.name}`}
        src={`${url}#toolbar=1&navpanes=0&view=FitH`}
        className="h-[620px] w-full bg-white"
      />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-right">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          Abrir PDF em outra aba
        </a>
      </div>
    </section>
  );
}
