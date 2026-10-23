'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
export function AssessmentPdfPreview({
  apiUrl,
  jobId,
  code,
}: {
  apiUrl: string;
  jobId: string;
  code: string;
}) {
  const [urls, setUrls] = useState<string[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    Promise.all(
      ['prova', 'gabarito'].map(async (kind) => {
        const r = await apiFetch(`${apiUrl}/api/render-jobs/${jobId}/${kind}`);
        if (!r.ok) throw new Error('Falha ao carregar a prévia.');
        const blob = await r.blob();
        if (!active) return '';
        const url = URL.createObjectURL(blob);
        created.push(url);
        return url;
      }),
    )
      .then((result) => {
        if (active) setUrls(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [apiUrl, jobId]);
  return (
    <article className="space-y-3 rounded-xl border bg-white p-4">
      <h3 className="font-bold">Versão {code}</h3>
      {error && <p role="alert">{error}</p>}
      {urls.map((url, index) => (
        <div key={url}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            Abrir {index ? 'gabarito' : 'prova'} em tela inteira
          </a>
          <iframe
            title={`${index ? 'Gabarito' : 'Prova'} — versão ${code}`}
            src={url}
            className="mt-2 h-[650px] w-full border"
          />
        </div>
      ))}
    </article>
  );
}
