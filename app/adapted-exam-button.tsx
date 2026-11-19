'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

// Botão "Gerar prova adaptada" da prova. Só habilita quando há aluno com laudo.
export function AdaptedExamButton({
  apiUrl,
  assessmentId,
}: {
  apiUrl: string;
  assessmentId: string;
}) {
  const [temLaudo, setTemLaudo] = useState<boolean | null>(null);
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [erro, setErro] = useState('');
  const [pedindo, setPedindo] = useState(false);

  useEffect(() => {
    let ativo = true;
    apiFetch(`${apiUrl}/api/students`)
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: Array<{ adaptedExam?: boolean; active?: boolean }>;
        };
        if (ativo)
          setTemLaudo(
            (body.data ?? []).some(
              (aluno) => aluno.adaptedExam && aluno.active !== false,
            ),
          );
      })
      .catch(() => ativo && setTemLaudo(false));
    return () => {
      ativo = false;
    };
  }, [apiUrl]);

  // Acompanha o job até terminar; o PDF só é oferecido quando completed.
  useEffect(() => {
    if (!jobId || status === 'completed' || status === 'failed') return;
    let ativo = true;
    const consultar = async () => {
      const response = await apiFetch(`${apiUrl}/api/render-jobs/${jobId}`);
      const body = (await response.json()) as {
        data?: { status: JobStatus; error?: string | null };
      };
      if (!ativo || !body.data) return;
      setStatus(body.data.status);
      if (body.data.status === 'failed')
        setErro(body.data.error || 'A geração da prova adaptada falhou.');
    };
    const temporizador = window.setInterval(() => {
      consultar().catch(() => undefined);
    }, 3000);
    return () => {
      ativo = false;
      window.clearInterval(temporizador);
    };
  }, [apiUrl, jobId, status]);

  const gerar = async () => {
    setErro('');
    setPedindo(true);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/assessments/${assessmentId}/adapted-exam`,
        {
          method: 'POST',
        },
      );
      const body = (await response.json()) as {
        data?: { renderJobId?: string; status?: string };
        error?: string;
      };
      if (!response.ok || !body.data?.renderJobId)
        throw new Error(
          body.error || 'Não foi possível gerar a prova adaptada.',
        );
      setJobId(body.data.renderJobId);
      setStatus('queued');
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar a prova adaptada.',
      );
    } finally {
      setPedindo(false);
    }
  };

  const baixar = async (kind: 'prova' | 'gabarito') => {
    const response = await apiFetch(
      `${apiUrl}/api/render-jobs/${jobId}/${kind}`,
    );
    if (!response.ok) throw new Error('Não foi possível baixar o arquivo.');
    const arquivo = await response.blob();
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      kind === 'prova' ? 'prova-adaptada.pdf' : 'gabarito-adaptado.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const emAndamento = status === 'queued' || status === 'running';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 text-sm">
      {temLaudo === false && (
        <span className="text-slate-600">
          Marque um aluno com laudo no cadastro de alunos para gerar a prova
          adaptada.
        </span>
      )}
      {temLaudo && status !== 'completed' && (
        <Button
          type="button"
          variant="outline"
          disabled={pedindo || emAndamento}
          onClick={() => void gerar()}
        >
          {emAndamento
            ? 'Gerando prova adaptada…'
            : 'Gerar prova adaptada (laudo)'}
        </Button>
      )}
      {status === 'completed' && (
        <>
          <span className="text-slate-700">Prova adaptada pronta.</span>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              baixar('prova').catch((e: Error) => setErro(e.message))
            }
          >
            <Download />
            Baixar prova adaptada
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              baixar('gabarito').catch((e: Error) => setErro(e.message))
            }
          >
            <Download />
            Baixar gabarito adaptado
          </Button>
        </>
      )}
      {erro && <span className="w-full text-red-700">{erro}</span>}
    </div>
  );
}
